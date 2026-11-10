import { parseChord, transposeChord, formatChordNotation, keyPrefersFlats, semitoneDifference } from './chords';

export interface KeyOption {
  /** Meios-tons acima do tom original (0–11) */
  offset: number;
  /** Nome do tom em notação alfabética (ex: "Bb", "F#m") — usado como valor */
  key: string;
  /** Nome do tom na notação ativa (ex: "Sib", "Fá#m") */
  label: string;
  isOriginal: boolean;
}

const MINOR_SUFFIX_REGEX = /^(?:m(?!aj)|min|[-–—−])/;

export function mod12(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

/**
 * Reduz um tom a raiz + modo (ex: "Lá-" -> "Am", "Sol7" -> "G").
 * Devolve `null` se o tom não for reconhecido.
 */
export function normalizeKey(originalKey: string): string | null {
  if (!originalKey || typeof originalKey !== 'string') return null;
  const parsed = parseChord(originalKey.trim());
  if (!parsed) return null;
  const isMinor = MINOR_SUFFIX_REGEX.test(parsed.suffix);
  return `${parsed.root}${isMinor ? 'm' : ''}`;
}

/**
 * Lista os 12 tons possíveis a partir do tom original (mantendo o modo maior/menor),
 * cada um escrito com a grafia habitual (bemóis em Fá, Sib, Mib...; sustenidos em Ré, Lá, Mi...).
 */
export function getKeyOptions(originalKey: string, notation: 'silabica' | 'alfabetica'): KeyOption[] {
  const base = normalizeKey(originalKey);
  if (!base) return [];

  return Array.from({ length: 12 }, (_, offset) => {
    const plain = transposeChord(base, offset, false);
    const flats = offset === 0 ? keyPrefersFlats(base) : keyPrefersFlats(plain);
    const key = transposeChord(base, offset, flats ?? false);
    return {
      offset,
      key,
      label: formatChordNotation(key, notation),
      isOriginal: offset === 0,
    };
  });
}

/**
 * Calcula a transposição necessária para que o tom apresentado (desenhos de acordes,
 * já com o capo descontado) passe a ser `targetKey`.
 * `capoDelta` = casa do capo escolhida - casa do capo original da música.
 */
export function semitonesForTargetKey(originalKey: string, targetKey: string, capoDelta: number = 0): number {
  return mod12(semitoneDifference(originalKey, targetKey) + capoDelta);
}
