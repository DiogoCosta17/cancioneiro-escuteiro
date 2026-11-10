/**
 * Zero-Dependency Offline QR Code Generator (ISO/IEC 18004 compliant)
 * Supports Byte Mode (UTF-8), Error Correction Level L, Versions 1 to 15.
 */

interface VersionInfo {
  totalDataCodewords: number;
  ecCodewordsPerBlock: number;
  group1Blocks: number;
  group1DataCodewords: number;
  group2Blocks: number;
  group2DataCodewords: number;
  alignmentPatterns: number[];
}

// ISO/IEC 18004 Table 9 & Annex E — Error Correction Level L (Versions 1 to 15)
const VERSION_TABLE_L: Record<number, VersionInfo> = {
  1:  { totalDataCodewords: 19,  ecCodewordsPerBlock: 7,  group1Blocks: 1, group1DataCodewords: 19,  group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [] },
  2:  { totalDataCodewords: 34,  ecCodewordsPerBlock: 10, group1Blocks: 1, group1DataCodewords: 34,  group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 18] },
  3:  { totalDataCodewords: 55,  ecCodewordsPerBlock: 15, group1Blocks: 1, group1DataCodewords: 55,  group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 22] },
  4:  { totalDataCodewords: 80,  ecCodewordsPerBlock: 20, group1Blocks: 1, group1DataCodewords: 80,  group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 26] },
  5:  { totalDataCodewords: 108, ecCodewordsPerBlock: 26, group1Blocks: 1, group1DataCodewords: 108, group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 30] },
  6:  { totalDataCodewords: 136, ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 68,  group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 34] },
  7:  { totalDataCodewords: 156, ecCodewordsPerBlock: 20, group1Blocks: 2, group1DataCodewords: 78,  group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 22, 38] },
  8:  { totalDataCodewords: 194, ecCodewordsPerBlock: 24, group1Blocks: 2, group1DataCodewords: 97,  group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 24, 42] },
  9:  { totalDataCodewords: 232, ecCodewordsPerBlock: 30, group1Blocks: 2, group1DataCodewords: 116, group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 26, 46] },
  10: { totalDataCodewords: 274, ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 68,  group2Blocks: 2, group2DataCodewords: 69,  alignmentPatterns: [6, 28, 50] },
  11: { totalDataCodewords: 324, ecCodewordsPerBlock: 20, group1Blocks: 4, group1DataCodewords: 81,  group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 30, 54] },
  12: { totalDataCodewords: 370, ecCodewordsPerBlock: 24, group1Blocks: 2, group1DataCodewords: 92,  group2Blocks: 2, group2DataCodewords: 93,  alignmentPatterns: [6, 32, 58] },
  13: { totalDataCodewords: 428, ecCodewordsPerBlock: 26, group1Blocks: 4, group1DataCodewords: 107, group2Blocks: 0, group2DataCodewords: 0,   alignmentPatterns: [6, 34, 62] },
  14: { totalDataCodewords: 461, ecCodewordsPerBlock: 30, group1Blocks: 3, group1DataCodewords: 115, group2Blocks: 1, group2DataCodewords: 116, alignmentPatterns: [6, 26, 46, 66] },
  15: { totalDataCodewords: 523, ecCodewordsPerBlock: 22, group1Blocks: 5, group1DataCodewords: 87,  group2Blocks: 1, group2DataCodewords: 88,  alignmentPatterns: [6, 26, 48, 70] },
};

// GF(256) with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function getGeneratorPolynomial(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = getGeneratorPolynomial(ecCount);
  const remainder = new Uint8Array(ecCount);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    // Shift remainder left by 1
    for (let j = 0; j < ecCount - 1; j++) {
      remainder[j] = remainder[j + 1];
    }
    remainder[ecCount - 1] = 0;

    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        remainder[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return remainder;
}

function selectVersion(byteLength: number): number {
  for (let v = 1; v <= 15; v++) {
    const info = VERSION_TABLE_L[v];
    // Mode indicator = 4 bits, char count = 8 bits (v1-9) or 16 bits (v10-15)
    const headerBits = 4 + (v <= 9 ? 8 : 16);
    const availableBits = info.totalDataCodewords * 8 - headerBits;
    const maxBytes = Math.floor(availableBits / 8);
    if (byteLength <= maxBytes) {
      return v;
    }
  }
  throw new Error(`Texto demasiado longo para QR Code (${byteLength} bytes).`);
}

function encodeDataCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const info = VERSION_TABLE_L[version];
  const totalBitsCapacity = info.totalDataCodewords * 8;
  const bits: number[] = [];

  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // 1. Byte mode indicator (0100)
  pushBits(0b0100, 4);

  // 2. Character count indicator (8 bits for v1-9, 16 bits for v10+)
  const countBits = version <= 9 ? 8 : 16;
  pushBits(bytes.length, countBits);

  // 3. Payload bytes
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }

  // 4. Terminator (up to 4 zero bits)
  const terminatorLen = Math.min(4, totalBitsCapacity - bits.length);
  pushBits(0, terminatorLen);

  // 5. Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // 6. Convert to codewords and pad with 0xEC, 0x11 alternating
  const codewords = new Uint8Array(info.totalDataCodewords);
  const dataByteLen = bits.length / 8;
  for (let i = 0; i < dataByteLen; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j];
    }
    codewords[i] = b;
  }

  const padBytes = [0xec, 0x11];
  for (let i = dataByteLen; i < info.totalDataCodewords; i++) {
    codewords[i] = padBytes[(i - dataByteLen) % 2];
  }

  return codewords;
}

function interleaveCodewords(dataCodewords: Uint8Array, version: number): Uint8Array {
  const info = VERSION_TABLE_L[version];
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let i = 0; i < info.group1Blocks; i++) {
    const block = dataCodewords.slice(offset, offset + info.group1DataCodewords);
    offset += info.group1DataCodewords;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, info.ecCodewordsPerBlock));
  }

  for (let i = 0; i < info.group2Blocks; i++) {
    const block = dataCodewords.slice(offset, offset + info.group2DataCodewords);
    offset += info.group2DataCodewords;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, info.ecCodewordsPerBlock));
  }

  const totalBlocks = dataBlocks.length;
  const maxDataBlockLen = Math.max(info.group1DataCodewords, info.group2DataCodewords);
  const totalCodewords = info.totalDataCodewords + totalBlocks * info.ecCodewordsPerBlock;
  const result = new Uint8Array(totalCodewords);

  let idx = 0;
  // Interleave data codewords
  for (let col = 0; col < maxDataBlockLen; col++) {
    for (let row = 0; row < totalBlocks; row++) {
      if (col < dataBlocks[row].length) {
        result[idx++] = dataBlocks[row][col];
      }
    }
  }

  // Interleave EC codewords
  for (let col = 0; col < info.ecCodewordsPerBlock; col++) {
    for (let row = 0; row < totalBlocks; row++) {
      result[idx++] = ecBlocks[row][col];
    }
  }

  return result;
}

function computeFormatBits(maskPattern: number): number {
  // Error Correction Level L = 01
  const data = (0b01 << 3) | maskPattern;
  let rem = data << 10;
  const gen = 0b10100110111; // x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) {
      rem ^= gen << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  const gen = 0b1111100100101; // x^12 + x^11 + x^10 + x^9 + x^8 + x^5 + x^2 + 1
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) {
      rem ^= gen << (i - 12);
    }
  }
  return (version << 12) | rem;
}

function placeFunctionPatterns(
  matrix: boolean[][],
  isFunction: boolean[][],
  version: number
) {
  const size = matrix.length;

  const setModule = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = dark;
      isFunction[r][c] = true;
    }
  };

  // Finder pattern (7x7) + separator (1 module white border)
  const drawFinder = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuterBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const inRing = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setModule(r, c, !inOuterBorder && (inRing || inCenter));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setModule(6, i, dark);
    setModule(i, 6, dark);
  }

  // Alignment patterns (5x5)
  const coords = VERSION_TABLE_L[version].alignmentPatterns;
  for (const rCenter of coords) {
    for (const cCenter of coords) {
      // Skip if overlapping with any of the 3 finder patterns
      if (
        (rCenter <= 8 && cCenter <= 8) ||
        (rCenter <= 8 && cCenter >= size - 8) ||
        (rCenter >= size - 8 && cCenter <= 8)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setModule(rCenter + dr, cCenter + dc, dist !== 1);
        }
      }
    }
  }

  // Dark module
  setModule(4 * version + 9, 8, true);

  // Reserve Format Information areas
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) setModule(8, i, false);
    if (!isFunction[i][8]) setModule(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setModule(8, size - 1 - i, false);
  }
  for (let i = 0; i < 7; i++) {
    if (!isFunction[size - 1 - i][8]) setModule(size - 1 - i, 8, false);
  }

  // Version Information (for Version >= 7)
  if (version >= 7) {
    const vBits = computeVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      setModule(b, a, bit);
      setModule(a, b, bit);
    }
  }
}

function drawFormatBits(matrix: boolean[][], maskPattern: number) {
  const size = matrix.length;
  const bits = computeFormatBits(maskPattern);

  // First copy: around top-left finder pattern
  for (let i = 0; i <= 5; i++) {
    matrix[i][8] = ((bits >>> i) & 1) === 1;
  }
  matrix[7][8] = ((bits >>> 6) & 1) === 1;
  matrix[8][8] = ((bits >>> 7) & 1) === 1;
  matrix[8][7] = ((bits >>> 8) & 1) === 1;
  for (let i = 9; i < 15; i++) {
    matrix[8][14 - i] = ((bits >>> i) & 1) === 1;
  }

  // Second copy: top-right horizontal and bottom-left vertical
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 1 - i] = ((bits >>> i) & 1) === 1;
  }
  for (let i = 8; i < 15; i++) {
    matrix[size - 15 + i][8] = ((bits >>> i) & 1) === 1;
  }
}

function placeDataBits(
  matrix: boolean[][],
  isFunction: boolean[][],
  codewords: Uint8Array
) {
  const size = matrix.length;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;

  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // Skip vertical timing pattern column
    for (let v = 0; v < size; v++) {
      const r = upward ? size - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunction[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byte = codewords[bitIdx >>> 3];
            dark = ((byte >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          matrix[r][c] = dark;
        }
      }
    }
    upward = !upward;
  }
}

function shouldInvertMask(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function computePenaltyScore(matrix: boolean[][]): number {
  const size = matrix.length;
  let score = 0;

  // Rule 1 & Rule 3 along rows and columns
  const evaluateLine = (getMod: (i: number) => boolean) => {
    let runColor = getMod(0);
    let runLen = 1;
    for (let i = 1; i < size; i++) {
      const c = getMod(i);
      if (c === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = c;
        runLen = 1;
      }
    }
  };

  for (let r = 0; r < size; r++) {
    evaluateLine((c) => matrix[r][c]);
  }
  for (let c = 0; c < size; c++) {
    evaluateLine((r) => matrix[r][c]);
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = matrix[r][c];
      if (
        matrix[r][c + 1] === color &&
        matrix[r + 1][c] === color &&
        matrix[r + 1][c + 1] === color
      ) {
        score += 3;
      }
    }
  }

  return score;
}

/**
 * Generates a 2D boolean matrix representing the QR code for `text`.
 * `true` = dark module, `false` = light module.
 */
export function generateQrMatrix(text: string): boolean[][] {
  const safeText = (text || '').trim() || 'https://cancioneiro488.pt';
  const bytes = new TextEncoder().encode(safeText);
  const version = selectVersion(bytes.length);
  const size = 17 + 4 * version;

  const dataCodewords = encodeDataCodewords(bytes, version);
  const allCodewords = interleaveCodewords(dataCodewords, version);

  const baseMatrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  placeFunctionPatterns(baseMatrix, isFunction, version);
  placeDataBits(baseMatrix, isFunction, allCodewords);

  // Pick the best mask (0..7) with lowest penalty score
  let bestMask = 0;
  let bestScore = Infinity;
  let bestMatrix: boolean[][] = baseMatrix;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseMatrix.map((row, r) =>
      row.map((val, c) =>
        isFunction[r][c] ? val : val !== shouldInvertMask(mask, r, c)
      )
    );
    drawFormatBits(candidate, mask);
    const score = computePenaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestMatrix = candidate;
    }
  }

  drawFormatBits(bestMatrix, bestMask);
  return bestMatrix;
}

/**
 * Generates an SVG string or `data:image/svg+xml;utf8,...` URL for a QR code.
 */
export function generateQrSvgDataUrl(text: string, margin = 4): string {
  const matrix = generateQrMatrix(text);
  const size = matrix.length;
  const total = size + margin * 2;

  let pathData = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${pathData}" fill="#000000"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
