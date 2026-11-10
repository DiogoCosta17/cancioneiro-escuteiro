import { normalizeSearchText } from './search-utils';

/**
 * Deteção de músicas provavelmente duplicadas (por título normalizado e, opcionalmente, artista).
 * Lógica pura, sem React nem Supabase, para poder ser testada isoladamente.
 */

export type DuplicateMatchKind = 'exact' | 'possible';

export interface DuplicateCandidate {
  title: string;
  artist?: string | null;
}

export interface ComparableSong {
  id: string;
  title: string;
  artist?: string | null;
}

export interface DuplicateMatch<T extends ComparableSong = ComparableSong> {
  song: T;
  kind: DuplicateMatchKind;
  /** Motivo legível (pt-PT) para mostrar ao dirigente. */
  reason: string;
}

// Tamanho mínimo (sem espaços) para considerar correspondências parciais/aproximadas
const MIN_PARTIAL_LENGTH = 4;

/**
 * Normaliza um título para comparação: minúsculas, sem acentos, sem pontuação
 * (hífens, pontos, aspas, etc. passam a espaço) e com espaços colapsados.
 * Ex.: "Avé-Maria!" -> "ave maria"
 */
export function normalizeSongTitle(input: unknown): string {
  return normalizeSearchText(input)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const compact = (normalized: string) => normalized.replace(/\s/g, '');

// Distância de Levenshtein com limite (devolve limit + 1 se exceder, para poupar trabalho)
function boundedLevenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Verifica se `needle` aparece em `haystack` como sequência de palavras completas
function containsWords(haystack: string, needle: string): boolean {
  return (` ${haystack} `).includes(` ${needle} `);
}

/**
 * Compara dois títulos.
 * - 'exact': iguais depois de normalizados (ignorando acentos, pontuação, maiúsculas e espaços).
 * - 'possible': um contém o outro como palavras completas, ou diferem por um erro de escrita.
 * - null: sem relação aparente.
 */
export function compareSongTitles(a: string, b: string): DuplicateMatchKind | null {
  const na = normalizeSongTitle(a);
  const nb = normalizeSongTitle(b);
  if (!na || !nb) return null;

  const ca = compact(na);
  const cb = compact(nb);
  if (ca === cb) return 'exact';

  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (compact(shorter).length >= MIN_PARTIAL_LENGTH && containsWords(longer, shorter)) {
    return 'possible';
  }

  // Pequenos erros de escrita ("Senhor Eu Nao Sou Digno" vs "Senhor eu não sou dino")
  // (números diferentes não são erros de escrita: "Salmo 23" ≠ "Salmo 24")
  const digits = (s: string) => s.replace(/\D/g, '');
  const minLen = Math.min(ca.length, cb.length);
  if (minLen >= 6 && digits(ca) === digits(cb)) {
    const limit = minLen >= 12 ? 2 : 1;
    if (boundedLevenshtein(ca, cb, limit) <= limit) return 'possible';
  }

  return null;
}

/**
 * Procura, numa lista de músicas existentes, as que parecem ser a mesma que `candidate`.
 * O artista é usado como desempate: se ambos tiverem artista e forem diferentes,
 * um título exatamente igual é rebaixado para "possível" (pode ser outra música com o mesmo nome).
 * Resultados ordenados: exatos primeiro, depois possíveis; limitado a `limit` (por defeito 5).
 */
export function findDuplicateSongs<T extends ComparableSong>(
  candidate: DuplicateCandidate,
  songs: readonly T[],
  options: { excludeId?: string | null; limit?: number } = {}
): DuplicateMatch<T>[] {
  const { excludeId = null, limit = 5 } = options;
  if (!candidate || !normalizeSongTitle(candidate.title) || !Array.isArray(songs)) return [];

  const candidateArtist = normalizeSongTitle(candidate.artist);
  const matches: DuplicateMatch<T>[] = [];

  for (const song of songs) {
    if (!song || typeof song.title !== 'string') continue;
    if (excludeId && song.id === excludeId) continue;

    let kind = compareSongTitles(candidate.title, song.title);
    if (!kind) continue;

    const songArtist = normalizeSongTitle(song.artist);
    const bothHaveArtist = Boolean(candidateArtist && songArtist);
    const sameArtist = bothHaveArtist && compact(candidateArtist) === compact(songArtist);

    let reason: string;
    if (kind === 'exact') {
      if (bothHaveArtist && !sameArtist) {
        kind = 'possible';
        reason = 'Mesmo título, mas de outro artista';
      } else {
        reason = sameArtist ? 'Mesmo título e mesmo artista' : 'Mesmo título';
      }
    } else {
      reason = sameArtist ? 'Título semelhante e mesmo artista' : 'Título semelhante';
    }

    matches.push({ song, kind, reason });
  }

  matches.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'exact' ? -1 : 1;
    return (a.song.title || '').localeCompare(b.song.title || '', 'pt', { sensitivity: 'base' });
  });

  return matches.slice(0, Math.max(0, limit));
}
