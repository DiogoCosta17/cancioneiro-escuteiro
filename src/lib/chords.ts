import { NOTES_SHARP, NOTES_FLAT } from './types';

const PORTUGUESE_ROOTS = ['dó#', 'dó', 'do#', 'do', 'réb', 'reb', 'ré#', 're#', 'ré', 're', 'mib', 'mi', 'fá#', 'fa#', 'fá', 'fa', 'solb', 'sol#', 'sol', 'láb', 'lab', 'lá#', 'la#', 'lá', 'la', 'sib', 'si'];
const ENGLISH_ROOTS = ['C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];

const ALL_ROOTS = [...ENGLISH_ROOTS, ...PORTUGUESE_ROOTS].sort((a, b) => b.length - a.length);
const ROOT_CAPTURE_REGEX = new RegExp(`^(${ALL_ROOTS.join('|')})(.*)$`, 'i');

const SUFFIX_BASE = '(?:m(?:in(?:or)?)?|[-–—−]|maj|M|Δ|dim|[°º]|ø|aug|\\+|sus(?:[249])?|add(?:[249]|1[13]))';
const SUFFIX_TENSION = '(?:6\\/9|7\\/9|7\\/4|4\\/7|69|7M|7\\+|m7M|7sus4|7sus2|7sus|add(?:[249]|1[13])|[245679]|1[13])';
const SUFFIX_ALT = '(?:[-–—−]?(?:M|b5|#5|5-|5\\+|b9|#9|9-|9\\+|#11|11\\+|b13|13-|alt|\\+(?:5|9)?))';
const SUFFIX_PARENS = '(?:\\([#b+-]?(?:[245679]|1[13]|add[249]|omit[35]|no[35]|maj7|7M|b5|#5|5-|5\\+|b9|#9|9-|9\\+|#11|11\\+|b13|13-)\\))';

const VALID_SUFFIX_REGEX = new RegExp(
  `^(?:${SUFFIX_BASE})?(?:${SUFFIX_TENSION})?(?:${SUFFIX_ALT})?(?:${SUFFIX_PARENS})?$`,
  'i'
);

const NON_CHORD_TOKENS_REGEX = /^(?:\d+x|bis|solo|refrão|refrao|coro|intro(?:dução|ducao)?|estrofe(?:\s+\d+)?|verso(?:\s+\d+)?|ponte|coda|final|fim|salmo|entrada|comunhão|comunhao)$/i;

export type ChordNotation = 'silabica' | 'alfabetica' | 'ocultar';

export const NOTE_TO_SOLFEGE: Record<string, string> = {
  'C': 'Dó', 'C#': 'Dó#', 'Db': 'Réb', 'D': 'Ré', 'D#': 'Ré#', 'Eb': 'Mib',
  'E': 'Mi', 'F': 'Fá', 'F#': 'Fá#', 'Gb': 'Solb', 'G': 'Sol', 'G#': 'Sol#',
  'Ab': 'Láb', 'A': 'Lá', 'A#': 'Lá#', 'Bb': 'Sib', 'B': 'Si'
};

export const SOLFEGE_TO_NOTE: Record<string, string> = {
  'dó': 'C', 'do': 'C', 'dó#': 'C#', 'do#': 'C#', 'réb': 'Db', 'reb': 'Db',
  'ré': 'D', 're': 'D', 'ré#': 'D#', 're#': 'D#', 'mib': 'Eb',
  'mi': 'E', 'fá': 'F', 'fa': 'F', 'fá#': 'F#', 'fa#': 'F#', 'solb': 'Gb',
  'sol': 'G', 'sol#': 'G#', 'láb': 'Ab', 'lab': 'Ab',
  'lá': 'A', 'la': 'A', 'lá#': 'A#', 'la#': 'A#', 'sib': 'Bb',
  'si': 'B'
};

export function isRootNote(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const normalized = str.trim().normalize('NFC').replace(/♯/g, '#').replace(/♭/g, 'b');
  return ALL_ROOTS.some(r => r.toLowerCase() === normalized.toLowerCase());
}

export function parseChord(chord: string): { root: string; suffix: string } | null {
  if (!chord || typeof chord !== 'string') return null;
  const normalized = chord.trim().normalize('NFC').replace(/♯/g, '#').replace(/♭/g, 'b');
  if (!normalized || NON_CHORD_TOKENS_REGEX.test(normalized)) return null;

  const slashIndex = normalized.indexOf('/');
  let bassNote = '';
  let mainChord = normalized;

  if (slashIndex > 0) {
    const afterSlash = normalized.substring(slashIndex + 1);
    if (isRootNote(afterSlash)) {
      mainChord = normalized.substring(0, slashIndex);
      bassNote = normalized.substring(slashIndex);
    } else if (/^(?:6\/9|7\/9|7\/4|4\/7)$/.test(normalized.substring(slashIndex - 1))) {
      mainChord = normalized;
    } else {
      return null;
    }
  }

  if (!ROOT_CAPTURE_REGEX.test(mainChord)) return null;

  // Raízes ambíguas (ex: "Fadd9" = F + add9, não "Fa" + "dd9"): escolhe a raiz mais longa cujo sufixo seja válido
  const lowerMain = mainChord.toLowerCase();
  const rootCandidate = ALL_ROOTS.find(
    (r) => lowerMain.startsWith(r.toLowerCase()) && VALID_SUFFIX_REGEX.test(mainChord.substring(r.length))
  );
  if (!rootCandidate) return null;

  let root = mainChord.substring(0, rootCandidate.length);
  const mainSuffix = mainChord.substring(rootCandidate.length);

  const suffix = mainSuffix + bassNote;

  // Normalize root to standard English format
  if (SOLFEGE_TO_NOTE[root.toLowerCase()]) {
    root = SOLFEGE_TO_NOTE[root.toLowerCase()];
  } else {
    // It's an English root, ensure correct capitalization
    root = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase();
  }

  return { root, suffix };
}

function getNoteIndex(note: string): number {
  let idx = NOTES_SHARP.indexOf(note as typeof NOTES_SHARP[number]);
  if (idx === -1) {
    idx = NOTES_FLAT.indexOf(note as typeof NOTES_FLAT[number]);
  }
  return idx;
}

function isFlat(note: string): boolean {
  return note.length === 2 && note[1] === 'b';
}

export function transposeChord(chord: string, semitones: number, preferFlats?: boolean): string {
  if (!chord || typeof chord !== 'string') return '';
  if (semitones === 0 && preferFlats === undefined) return chord;

  const slashIndex = chord.indexOf('/');
  if (slashIndex > 0) {
    const mainPart = chord.substring(0, slashIndex);
    const bassPart = chord.substring(slashIndex + 1);
    if (isRootNote(bassPart)) {
      return `${transposeChord(mainPart, semitones, preferFlats)}/${transposeChord(bassPart, semitones, preferFlats)}`;
    }
  }

  const parsed = parseChord(chord);
  if (!parsed) return chord;

  const { root, suffix } = parsed;
  const noteIndex = getNoteIndex(root);
  if (noteIndex === -1) return chord;

  const newIndex = ((noteIndex + semitones) % 12 + 12) % 12;
  const useFlat = preferFlats !== undefined ? preferFlats : isFlat(root);
  const scale = useFlat ? NOTES_FLAT : NOTES_SHARP;
  return `${scale[newIndex]}${suffix}`;
}

/**
 * Converte um acorde para notação silábica (Dó, Ré, Mi...) ou alfabética (C, D, E...)
 */
export function formatChordNotation(chord: string, notation: 'silabica' | 'alfabetica'): string {
  if (!chord || typeof chord !== 'string') return '';
  const slashIndex = chord.indexOf('/');
  if (slashIndex > 0) {
    const mainPart = chord.substring(0, slashIndex);
    const bassPart = chord.substring(slashIndex + 1);
    if (isRootNote(bassPart)) {
      return `${formatChordNotation(mainPart, notation)}/${formatChordNotation(bassPart, notation)}`;
    }
  }

  const parsed = parseChord(chord);
  if (!parsed) return chord;

  const { root, suffix } = parsed;
  
  if (notation === 'alfabetica') {
    // Feature 17: Normaliza menores com hífen portugueses ([Ré-], [Lá-], etc.) para standard alfabético (Dm, Am, etc.)
    const alphaSuffix = suffix.replace(/^[-–—−]/, 'm');
    return `${root}${alphaSuffix}`;
  }

  const solfegeRoot = NOTE_TO_SOLFEGE[root] || root;
  return `${solfegeRoot}${suffix}`;
}

export function transposeContent(content: string, semitones: number, preferFlats?: boolean): string {
  if (!content || typeof content !== 'string') return '';
  if (semitones === 0 && preferFlats === undefined) return content;
  return content.replace(/\[([^\]]+)\]/g, (_match, chord: string) => {
    return `[${transposeChord(chord, semitones, preferFlats)}]`;
  });
}

/**
 * Converte todos os acordes entre colchetes `[Acorde]` no texto ChordPro
 * para a norma pretendida ('alfabetica' -> [G], [Dm], [Em] | 'silabica' -> [Sol], [Rém], [Mim]).
 */
export function standardizeContentNotation(
  content: string,
  notation: 'alfabetica' | 'silabica' = 'alfabetica'
): string {
  if (!content || typeof content !== 'string') return '';
  return content.replace(/\[([^\]]+)\]/g, (fullMatch, rawChord: string) => {
    const trimmed = rawChord.trim();
    if (!trimmed || NON_CHORD_TOKENS_REGEX.test(trimmed)) return fullMatch;
    const parsed = parseChord(trimmed);
    if (!parsed) return fullMatch;
    return `[${formatChordNotation(trimmed, notation)}]`;
  });
}

// Tons cuja armação de clave usa bemóis (índices em NOTES_SHARP): F, Bb, Eb, Ab, Db (maiores) e Dm, Gm, Cm, Fm, Bbm, Ebm (menores)
const FLAT_MAJOR_KEY_INDICES = new Set([5, 10, 3, 8, 1]);
const FLAT_MINOR_KEY_INDICES = new Set([2, 7, 0, 5, 10, 3]);

/**
 * Indica se um tom (ex: "F", "Sib", "Dm", "Ré-") se escreve normalmente com bemóis.
 * Devolve `undefined` se o tom não for reconhecido.
 */
export function keyPrefersFlats(key: string): boolean | undefined {
  if (!key || typeof key !== 'string') return undefined;
  const parsed = parseChord(key.trim());
  if (!parsed) return undefined;
  const idx = getNoteIndex(parsed.root);
  if (idx === -1) return undefined;
  const isMinor = /^(?:m(?!aj)|min|[-–—−])/.test(parsed.suffix);
  return isMinor ? FLAT_MINOR_KEY_INDICES.has(idx) : FLAT_MAJOR_KEY_INDICES.has(idx);
}

export function semitoneDifference(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey || typeof fromKey !== 'string' || typeof toKey !== 'string') return 0;
  const parsedFrom = parseChord(fromKey.trim());
  const parsedTo = parseChord(toKey.trim());

  const fromRoot = parsedFrom ? parsedFrom.root : fromKey.trim();
  const toRoot = parsedTo ? parsedTo.root : toKey.trim();

  const fromIndex = getNoteIndex(fromRoot);
  const toIndex = getNoteIndex(toRoot);
  if (fromIndex === -1 || toIndex === -1) return 0;
  return ((toIndex - fromIndex) % 12 + 12) % 12;
}

export function getKeyName(originalKey: string, semitones: number, preferFlats?: boolean, notation: 'silabica' | 'alfabetica' = 'alfabetica'): string {
  if (!originalKey || typeof originalKey !== 'string') return '';
  const transposed = transposeChord(originalKey, semitones, preferFlats);
  return formatChordNotation(transposed, notation);
}

/**
 * Extrai todos os acordes únicos presentes no conteúdo da música (já transpostos)
 */
export function extractUniqueChords(content: string, semitones: number = 0, preferFlats?: boolean): string[] {
  if (!content || typeof content !== 'string') return [];
  const matches = content.normalize('NFC').replace(/♯/g, '#').replace(/♭/g, 'b').match(/\[([^\]]+)\]/g);
  if (!matches) return [];

  const chordsSet = new Set<string>();
  matches.forEach((m) => {
    const rawChord = m.replace(/[[\]]/g, '').trim();
    if (!rawChord || NON_CHORD_TOKENS_REGEX.test(rawChord)) return;

    const parsed = parseChord(rawChord);
    if (parsed) {
      const transposed = transposeChord(rawChord, semitones, preferFlats);
      chordsSet.add(transposed);
    }
  });

  return Array.from(chordsSet);
}
