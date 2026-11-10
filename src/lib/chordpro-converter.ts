// Utility to convert traditional 2-line chords (chords above lyrics, like Cifra Club or Word) into ChordPro format.
// Supports both alphabetic (C, D, E, F, G, A, B) and solfège (Dó, Ré, Mi, Fá, Sol, Lá, Si) notation.

import { cleanAndAlignChordPro } from './chordpro-parser';
import { parseChord } from './chords';

// Solfège → Alphabetic mapping (case-insensitive keys)
const SOLFEGE_TO_ALPHA: Record<string, string> = {
  'dó': 'C', 'do': 'C',
  'ré': 'D', 're': 'D',
  'mi': 'E',
  'fá': 'F', 'fa': 'F',
  'sol': 'G',
  'lá': 'A', 'la': 'A',
  'si': 'B',
};

// Build a regex alternation for solfège roots (longest first to avoid partial matches)
const SOLFEGE_ROOTS = ['Sol', 'Dó', 'Ré', 'Mi', 'Fá', 'Lá', 'Si', 'Do', 'Re', 'Fa', 'La',
                       'SOL', 'DÓ', 'RÉ', 'MI', 'FÁ', 'LÁ', 'SI', 'DO', 'RE', 'FA', 'LA',
                       'sol', 'dó', 'ré', 'mi', 'fá', 'lá', 'si', 'do', 're', 'fa', 'la'];

// Alphabetic chord regex: A-G with optional # or b, plus suffixes
const ALPHA_CHORD_REGEX = /^[A-G][#b]?(?:m|maj|min|dim|[°º]|aug|\+|sus[249]?|add[0-9]+|[0-9]+|M[0-9]+|7M|7\+|7\/4|4\/7|6\/9|7\/9|\([#b+-]?[0-9a-zA-Z]+\))*(?:\/[A-G][#b]?)?$/i;

// Solfège chord regex: Dó, Ré, Mi, Fá, Sol, Lá, Si with optional #/b, suffixes, or trailing - for minor
// The trailing "-" is a common Portuguese shorthand for minor (e.g., RÉ- = Dm, LÁ- = Am)
const SOLFEGE_CHORD_REGEX = new RegExp(
  '^(' + SOLFEGE_ROOTS.join('|') + ')[#b]?' +
  '(?:m|maj|min|dim|[°º]|aug|\\+|sus[249]?|add[0-9]+|[0-9]+|M[0-9]+|7M|7\\+|7\\/4|4\\/7|6\\/9|7\\/9|\\([#b+-]?[0-9a-zA-Z]+\\)|-)*' +
  '(?:\\/(?:' + SOLFEGE_ROOTS.join('|') + '|[A-G])[#b]?)?$',
  'i'
);

// Cabeçalhos de secção isolados comuns em documentos Word / CifraClub (mesmo sem ':' ou '[]')
const STANDALONE_SECTION_REGEX = /^(?:refr[aã]o|coro|chorus|intro(?:du[çc][aã]o)?|estrofe(?:\s+\d+)?|\d+[ªº]?\s*estrofe|verso(?:\s+\d+)?|verse(?:\s+\d+)?|ponte|bridge|coda|final|fim|outro|interl[úu]dio)$/i;

// Palavras comuns em português que nunca devem ser tratadas como acordes.
// NUNCA incluir acordes reais como 'em', 'a', 'e', 'am', 'bm', 'cm', 'dm', 'fm', 'gm'.
const TEXT_WORDS_TO_FILTER = new Set([
  'de', 'do', 'da', 'dos', 'das',
  'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem',
  'um', 'uma', 'uns', 'umas', 'que', 'se', 'mas', 'ou',
  'tu', 'ele', 'ela', 'vos', 'eles', 'elas', 'ja',
  'foi', 'vai', 'vou', 'ter', 'ser', 'dar', 'ver', 'ca'
]);

const MAX_CHORD_TOKEN_LENGTH = 20;

interface ChordPosition {
  chord: string;
  index: number;
}

function cleanToken(token: unknown): string {
  if (!token || typeof token !== 'string') return '';
  return token.trim().replace(/^[[\](),;:|]+|[[\](),;:|]+$/g, '');
}

/**
 * Checks if a string is a valid chord in either notation
 */
function isChord(token: unknown): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = cleanToken(token);
  // Nenhum acorde real passa de ~16 caracteres (ex: "Dó#m7(b5)/Sol#"); limitar evita backtracking exponencial
  // dos regex com quantificadores aninhados em tokens longos como "A1111111111111111111111111111x".
  if (!clean || clean.length > MAX_CHORD_TOKEN_LENGTH) return false;
  return ALPHA_CHORD_REGEX.test(clean) || SOLFEGE_CHORD_REGEX.test(clean) || parseChord(clean) !== null;
}

/**
 * Checks if a string token is likely a musical chord (with common-word filtering for multi-token lines)
 */
export function isChordToken(token: unknown): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = cleanToken(token);
  if (!clean) return false;
  // Letras minúsculas isoladas 'a', 'e', 'o' são artigos/conjunções/vogais em português e não acordes.
  // Em contrapartida, 'A', 'E' em maiúsculas são acordes maiores válidos.
  if (clean === 'a' || clean === 'e' || clean === 'o') return false;
  // Palavras em português que nunca são acordes (exceto raízes solfège como Dó, Ré, Mi, Fá, Sol, Lá, Si)
  if (TEXT_WORDS_TO_FILTER.has(clean.toLowerCase()) && !isSolfegeRoot(clean)) return false;
  return isChord(clean);
}

/**
 * Checks if a token (case-insensitive) is a solfège root note
 */
function isSolfegeRoot(token: unknown): boolean {
  if (!token || typeof token !== 'string') return false;
  return SOLFEGE_TO_ALPHA[token.toLowerCase()] !== undefined;
}

/**
 * Converts a solfège chord to alphabetic notation for ChordPro internal format.
 * E.g., "Fá" → "F", "Ré-" → "Dm", "Sol#m" → "G#m", "Lá" → "A"
 */
export function solfegeToAlpha(chord: unknown): string {
  if (!chord || typeof chord !== 'string') return '';
  // Handle bass note (slash chord)
  const slashIdx = chord.indexOf('/');
  if (slashIdx > 0) {
    const main = solfegeToAlpha(chord.substring(0, slashIdx));
    const bass = solfegeToAlpha(chord.substring(slashIdx + 1));
    return `${main}/${bass}`;
  }

  // Try to match a solfège root at the start (longest match first)
  const lower = chord.toLowerCase();
  // Sort solfège keys by length descending so "sol" matches before "so", etc.
  const sortedKeys = Object.keys(SOLFEGE_TO_ALPHA).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (lower.startsWith(key)) {
      const root = SOLFEGE_TO_ALPHA[key];
      let suffix = chord.substring(key.length);

      // Handle trailing "-" as minor
      if (suffix === '-') {
        suffix = 'm';
      } else if (suffix.startsWith('-')) {
        // e.g., "-7" should probably be "m7" — common in PT notation
        suffix = 'm' + suffix.substring(1);
      }

      return root + suffix;
    }
  }

  // Not solfège, return as-is (already alphabetic)
  return chord;
}

/**
 * Normalizes a chord token: cleans brackets/punctuation and preserves the chord name
 */
function normalizeChord(token: unknown): string {
  if (!token || typeof token !== 'string') return '';
  const clean = cleanToken(token);
  return clean;
}

/**
 * Determines whether a line consists predominantly of chords
 */
export function isChordLine(line: unknown): boolean {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Ignorar diretivas de secção com chavetas ou isoladas: {Refrão}, {Estrofe 1}, {Intro}, Refrão
  if (/^\{[^}]+\}$/.test(trimmed) || STANDALONE_SECTION_REGEX.test(trimmed)) return false;

  // Se for apenas uma expressão entre colchetes como [Refrão] ou [Intro]
  if (/^\[[^\]]+\]$/.test(trimmed)) {
    const inside = trimmed.slice(1, -1).trim();
    if (!isChord(inside)) return false; // É uma secção como [Refrão]
    return true; // É um acorde único como [Sol]
  }

  // Remove parêntesis envolventes de linhas instrumentais como: ( Em   D   C   Em   D )
  const withoutParens = trimmed.replace(/^\(\s*|\s*\)$/g, '');
  const tokens = withoutParens.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  // Special case: a single token that is a chord → chord line
  if (tokens.length === 1) {
    return isChord(tokens[0]);
  }

  let chordCount = 0;
  for (const token of tokens) {
    if (isChordToken(token)) {
      chordCount++;
    } else {
      // Allow chord dividers like |, /, -, :, (, ), 2x, bis
      if (
        token === '|' ||
        token === '/' ||
        token === '-' ||
        token === ':' ||
        token === '(' ||
        token === ')' ||
        /^(?:\(?[2-9]x\)?|\(?bis\)?)$/i.test(token)
      ) {
        chordCount++;
      }
    }
  }

  // If at least 55% of the tokens are chords, treat as a chord line
  return chordCount / tokens.length >= 0.55;
}

/**
 * Expands tab characters into spaces based on standard tab stops (default 4 spaces)
 */
function expandTabs(str: unknown, tabSize = 4): string {
  if (!str || typeof str !== 'string') return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\t') {
      const spacesToAdd = tabSize - (result.length % tabSize);
      result += ' '.repeat(spacesToAdd);
    } else {
      result += str[i];
    }
  }
  return result;
}

/**
 * Extracts chords and their column indices from a chord line
 */
function extractChordsWithPositions(chordLine: unknown): ChordPosition[] {
  if (!chordLine || typeof chordLine !== 'string') return [];
  const expanded = expandTabs(chordLine, 4);
  const result: ChordPosition[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(expanded)) !== null) {
    const raw = match[0];
    const clean = cleanToken(raw);
    if (clean && isChord(clean)) {
      result.push({
        chord: normalizeChord(raw),
        index: match.index,
      });
    }
  }

  return result;
}

function snapChordIndexToWord(lyricsLine: unknown, index: number): number {
  if (!lyricsLine || typeof lyricsLine !== 'string') return index;
  if (index >= lyricsLine.length) return index;

  // 1. Se o índice cair num espaço imediatamente antes de uma palavra (até 4 espaços de distância),
  // alinha com a primeira letra da palavra para o acorde ancorar na sílaba e não num espaço vazio.
  if (lyricsLine[index] === ' ') {
    let nextNonSpace = index;
    while (nextNonSpace < lyricsLine.length && lyricsLine[nextNonSpace] === ' ') {
      nextNonSpace++;
    }
    if (nextNonSpace < lyricsLine.length && nextNonSpace - index <= 4) {
      return nextNonSpace;
    }
    return index;
  }

  // 2. Se o índice cair DENTRO de uma palavra:
  // Em cifras de 2 linhas, os acordes estão posicionados visualmente por cima das palavras.
  // Devido a fontes proporcionais ou espaçamento do editor, o acorde muitas vezes começa na 2ª ou 3ª letra.
  // Recua para o início da palavra para ancorar no início da palavra e NUNCA partir a palavra ao meio
  // (evita "co[Am]rpos", "h[D]oje", "viv[Am]êssemos", "so[C]ubesses", "no[Em]ite", "univ[C]erso", etc.)
  let wordStart = index;
  while (wordStart > 0 && lyricsLine[wordStart - 1] !== ' ') {
    wordStart--;
  }

  return wordStart;
}

/**
 * Merges a chord line with the lyrics line below it
 */
function mergeChordsIntoLyrics(chordLine: unknown, lyricsLine: unknown): string {
  const safeChordLine = typeof chordLine === 'string' ? chordLine : '';
  const safeLyricsLine = typeof lyricsLine === 'string' ? lyricsLine : '';
  const expandedLyrics = expandTabs(safeLyricsLine, 4);
  const chords = extractChordsWithPositions(safeChordLine);
  if (chords.length === 0) return expandedLyrics;

  // 1. Mapear as posições alvo calculadas sobre a linha original intacta (sem mutações)
  const positionedChords: { chord: string; index: number; rawIndex: number }[] = [];
  const usedWordStarts = new Set<number>();

  for (const { chord, index: rawIndex } of chords) {
    let targetIndex = snapChordIndexToWord(expandedLyrics, rawIndex);
    if (targetIndex !== rawIndex && usedWordStarts.has(targetIndex)) {
      // Já existe um acorde ancorado no início desta palavra (mudança de acorde a meio da palavra).
      // Mantém a posição original para não sobrepor ambos os acordes no início da mesma palavra.
      targetIndex = rawIndex;
    }
    usedWordStarts.add(targetIndex);
    positionedChords.push({ chord, index: targetIndex, rawIndex });
  }

  // 2. Inserir os acordes da direita para a esquerda para não deslocar os índices à esquerda.
  // Se caírem no mesmo índice, preservar ordem original da esquerda para a direita.
  positionedChords.sort((a, b) => {
    if (b.index !== a.index) return b.index - a.index;
    return b.rawIndex - a.rawIndex;
  });

  let merged = expandedLyrics;

  for (const { chord, index } of positionedChords) {
    const formattedChord = `[${chord}]`;

    if (index >= merged.length) {
      // Chord starts after the lyrics end -> pad with spaces or append
      const padding = ' '.repeat(Math.max(1, index - merged.length));
      merged = merged + padding + formattedChord;
    } else {
      // Insert chord right at the index
      merged = merged.slice(0, index) + formattedChord + merged.slice(index);
    }
  }

  return merged;
}

/**
 * Converts a chord-only line (like Intro or instrumental) to ChordPro
 */
function formatChordOnlyLine(chordLine: unknown): string {
  if (!chordLine || typeof chordLine !== 'string') return '';
  return chordLine.replace(/\S+/g, (token) => {
    const clean = cleanToken(token);
    if (clean && isChord(clean)) {
      // Preserva parêntesis à volta do acorde se existirem, ex: (Em) -> ([Em])
      const prefix = token.startsWith('(') ? '(' : '';
      const suffix = token.endsWith(')') ? ')' : '';
      return `${prefix}[${normalizeChord(token)}]${suffix}`;
    }
    return token;
  });
}

function normalizeSectionTitle(raw: string): string {
  const clean = raw.trim();
  if (/^refr[aã]o(?:\s+final)?$/i.test(clean)) return 'Refrão';
  if (/^(?:coro|chorus)$/i.test(clean)) return 'Refrão';
  if (/^(?:pr[eé]-?refr[aã]o|pre-?chorus)$/i.test(clean)) return 'Pré-Refrão';
  if (/^intro(?:du[çc][aã]o)?$/i.test(clean)) return 'Intro';
  if (/^(?:ponte|bridge)$/i.test(clean)) return 'Ponte';
  if (/^(?:solo|instrumental|base\s+solo)$/i.test(clean)) return 'Solo';
  if (/^(?:final|fim|coda|outro)$/i.test(clean)) return 'Final';
  if (/^primeira\s+parte$/i.test(clean)) return 'Estrofe 1';
  if (/^segunda\s+parte$/i.test(clean)) return 'Estrofe 2';
  if (/^terceira\s+parte$/i.test(clean)) return 'Estrofe 3';
  if (/^quarta\s+parte$/i.test(clean)) return 'Estrofe 4';
  const estrofeNum = clean.match(/^(?:estrofe|verso|verse|parte)\s*(\d+)$/i) || clean.match(/^(\d+)[ªº]?\s*(?:estrofe|parte)$/i);
  if (estrofeNum) return `Estrofe ${estrofeNum[1]}`;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Main converter: Takes traditional 2-line plain text and converts to ChordPro
 */
export function convertToChordPro(text: unknown): string {
  if (!text || typeof text !== 'string') return '';

  // NFC: letras acentuadas em NFD (ex: texto colado do macOS) ocupam 2 colunas e desalinham os acordes
  const lines = text.normalize('NFC').split(/\r?\n/);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const trimmedCurrent = current.trim();

    // 1. Detetar cabeçalhos de secção isolados sem pontuação (ex: "Refrão", "Intro", "Estrofe 1")
    if (STANDALONE_SECTION_REGEX.test(trimmedCurrent)) {
      result.push(`{${normalizeSectionTitle(trimmedCurrent)}}`);
      continue;
    }

    // 2. Preserve section headers like {Refrão}, [Refrão], [Intro] G D Em C, Refrão:, etc.
    // Output with {curly braces} so the ChordPro parser recognizes them as directives.
    const headerMatch = trimmedCurrent.match(/^(?:\[([^\]]+)\]|\{([^}]+)\}|([A-Za-zÀ-ÖØ-öø-ÿ0-9\s]+):)(?:\s+(.*))?$/);
    if (headerMatch) {
      const bracketOrBraceHeader = headerMatch[1] || headerMatch[2];
      const colonHeader = headerMatch[3];
      const headerTitle = bracketOrBraceHeader || colonHeader;
      const trailing = headerMatch[4]?.trim();

      const isValidHeader = bracketOrBraceHeader
        ? !isChord(bracketOrBraceHeader) && (!trailing || isChordLine(trailing))
        : colonHeader
        ? STANDALONE_SECTION_REGEX.test(colonHeader.trim())
        : false;

      if (headerTitle && isValidHeader) {
        result.push(`{${normalizeSectionTitle(headerTitle)}}`);
        if (trailing) {
          if (isChordLine(trailing)) {
            result.push(formatChordOnlyLine(trailing));
          } else {
            result.push(trailing);
          }
        }
        continue;
      }
    }

    if (isChordLine(current)) {
      const nextLine = i + 1 < lines.length ? lines[i + 1] : null;

      // Se a linha de acordes tiver barras '|' / parêntesis instrumentais, ou se a linha seguinte também for de acordes/vazia,
      // mantém como linha instrumental
      const looksInstrumental =
        /[|()]/.test(current) ||
        nextLine === null ||
        nextLine.trim() === '' ||
        isChordLine(nextLine);

      // Check if next line is a lyrics line
      if (!looksInstrumental && nextLine !== null && nextLine.trim() !== '' && !isChordLine(nextLine)) {
        // Merge chords into next line
        const merged = mergeChordsIntoLyrics(current, nextLine);
        result.push(merged);
        i++; // skip next line because it was consumed
      } else {
        // Next line is either empty or another chord line (instrumental)
        result.push(formatChordOnlyLine(current));
      }
    } else {
      result.push(current);
    }
  }

  return cleanAndAlignChordPro(result.join('\n'));
}
