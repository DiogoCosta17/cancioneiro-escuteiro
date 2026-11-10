import { parseChord, transposeChord, formatChordNotation } from './chords';

export interface CapoSuggestion {
  capoFret: number;
  shapesSemitones: number;
  targetKeyShapes: string;
  barreCountBefore: number;
  barreCountAfter: number;
}

const SHARP_FLAT_ROOTS = new Set([
  'C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb'
]);

const OPEN_MAJOR_ROOTS = new Set(['C', 'G', 'D', 'A', 'E']);
const OPEN_MINOR_ROOTS = new Set(['A', 'E', 'D']);

const TIER1_OPEN_KEYS = new Set(['G', 'C', 'D', 'Am', 'Em']);
const TIER2_OPEN_KEYS = new Set(['A', 'E', 'Dm']);

function extractMainAlphaChord(chord: string): { root: string; suffix: string; isMinor: boolean; isDim: boolean; full: string } | null {
  if (!chord) return null;
  const alpha = formatChordNotation(chord.trim(), 'alfabetica');
  const slashIdx = alpha.indexOf('/');
  const mainPart = slashIdx > 0 ? alpha.substring(0, slashIdx) : alpha;
  const parsed = parseChord(mainPart);
  if (!parsed) return null;

  const normSuffix = parsed.suffix.replace(/^[-–—−]/, 'm');
  const isDim = /(?:dim|º|°|m7b5|m7\(b5\))/i.test(normSuffix);
  // Sensível a maiúsculas: "M7" (CM7) é sétima maior, não menor
  const isMinor = !isDim && /^(?:m(?!aj)|min)/.test(normSuffix);
  return {
    root: parsed.root,
    suffix: normSuffix,
    isMinor,
    isDim,
    full: `${parsed.root}${normSuffix}`,
  };
}

export function isBarreChord(chord: string): boolean {
  const info = extractMainAlphaChord(chord);
  if (!info) return false;

  // Acordes diminutos de passagem não contam como pestana padrão
  if (info.isDim) return false;

  // Exceções clássicas de acordes abertos em F e B: Fmaj7 (x33210) e B7 (x21202)
  if (info.root === 'F' && !info.isMinor && /^(?:maj7|7M)$/i.test(info.suffix)) {
    return false;
  }
  if (info.root === 'B' && !info.isMinor && info.suffix === '7') {
    return false;
  }

  // Qualquer acorde com raiz sustenida/bemol, ou raiz F / B (exceto Fmaj7/B7) exige pestana
  if (SHARP_FLAT_ROOTS.has(info.root) || info.root === 'F' || info.root === 'B') {
    return true;
  }

  // Acordes menores em C e G (Cm, Cm7, Gm, Gm7) exigem pestana
  if (info.isMinor && (info.root === 'C' || info.root === 'G')) {
    return true;
  }

  return false;
}

export function isEasyOpenChord(chord: string): boolean {
  const info = extractMainAlphaChord(chord);
  if (!info || info.isDim) return false;

  if (info.root === 'F' && !info.isMinor && /^(?:maj7|7M)$/i.test(info.suffix)) {
    return true;
  }
  if (info.root === 'B' && !info.isMinor && info.suffix === '7') {
    return true;
  }

  if (info.isMinor) {
    return OPEN_MINOR_ROOTS.has(info.root);
  }

  return OPEN_MAJOR_ROOTS.has(info.root);
}

function normalizeKeySignature(rawKey: string): string {
  const info = extractMainAlphaChord(rawKey);
  if (!info) return rawKey.trim();
  return `${info.root}${info.isMinor ? 'm' : ''}`;
}

/**
 * Analisa os acordes atuais e sugere a melhor posição de Capo (1ª a 7ª casa)
 * seguindo a prática real de guitarra acústica:
 * - Prioriza transformar o tom principal num dos desenhos abertos clássicos (G, C, D, Am, Em, A, E, Dm)
 * - Penaliza fortemente casas altas (6ª e 7ª casa) quando existe solução limpa nas casas 1ª a 5ª
 * - Classifica corretamente acordes com 7ª/9ª/maj7 em raízes de pestana (ex: Sim7, Fá9, Sib9)
 */
export function getCapoSuggestion(chords: string[], currentKey?: string): CapoSuggestion | null {
  if (!Array.isArray(chords) || chords.length === 0) return null;

  const validChords = chords.filter(Boolean);
  if (validChords.length === 0) return null;

  const barreCountBefore = validChords.filter(isBarreChord).length;
  const referenceKey = currentKey && currentKey.trim() ? currentKey.trim() : validChords[0];
  const currentKeyNorm = normalizeKeySignature(referenceKey);

  // Se não há nenhum acorde de pestana e o tom já é aberto, não precisa de capo
  if (barreCountBefore === 0 && (TIER1_OPEN_KEYS.has(currentKeyNorm) || TIER2_OPEN_KEYS.has(currentKeyNorm))) {
    return null;
  }
  if (barreCountBefore === 0) {
    return null;
  }

  let bestFret = 0;
  let bestScore = -Infinity;
  let bestBarreAfter = barreCountBefore;

  for (let capoFret = 1; capoFret <= 7; capoFret++) {
    const transposed = validChords.map((c) => transposeChord(c, -capoFret));
    const barreCountAfter = transposed.filter(isBarreChord).length;
    const easyOpenCount = transposed.filter(isEasyOpenChord).length;

    const targetKeyRaw = transposeChord(referenceKey, -capoFret);
    const targetKeyNorm = normalizeKeySignature(targetKeyRaw);
    const keyTurnedFromBarreToOpen = isBarreChord(currentKeyNorm) && !isBarreChord(targetKeyNorm);

    // Só considera se reduzir o número de pestanas, OU se mantiver o número mas transformar a tónica de pestana num tom aberto
    if (barreCountAfter > barreCountBefore) continue;
    if (barreCountAfter === barreCountBefore && !keyTurnedFromBarreToOpen) continue;

    let keyBonus = 0;
    if (TIER1_OPEN_KEYS.has(targetKeyNorm)) {
      keyBonus = 18;
    } else if (TIER2_OPEN_KEYS.has(targetKeyNorm)) {
      keyBonus = 10;
    } else if (isBarreChord(targetKeyNorm)) {
      keyBonus = -20;
    }

    // O primeiro acorde da música (geralmente a tónica) ficar aberto também é muito importante
    const firstChordOpenBonus = isEasyOpenChord(transposed[0]) ? 8 : -8;

    const barreReduction = barreCountBefore - barreCountAfter;
    const zeroBarreBonus = barreCountAfter === 0 ? 15 : 0;

    // Penalização realista de casas altas: casas 1..4 são a zona ideal de guitarra acústica; 6 e 7 só quando não há solução nas casas baixas
    const highFretPenalty = capoFret * 3 + (capoFret >= 6 ? 22 : capoFret === 5 ? 8 : 0);

    const score =
      barreReduction * 12 +
      easyOpenCount * 4 +
      zeroBarreBonus +
      keyBonus +
      firstChordOpenBonus -
      highFretPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestFret = capoFret;
      bestBarreAfter = barreCountAfter;
    }
  }

  if (bestFret === 0) {
    return null;
  }

  const targetKeyShapes = normalizeKeySignature(transposeChord(referenceKey, -bestFret));

  return {
    capoFret: bestFret,
    shapesSemitones: -bestFret,
    targetKeyShapes,
    barreCountBefore,
    barreCountAfter: bestBarreAfter,
  };
}
