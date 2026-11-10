import { Song } from './types';

export type SongSortOption = 'relevance' | 'az' | 'recent' | 'key';

/**
 * Normalizes text for accent-insensitive, case-insensitive search:
 * converts to lowercase, normalizes Unicode NFD, strips diacritics, and collapses whitespace.
 */
export function normalizeSearchText(input: unknown): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Removes ChordPro [Chord] brackets and {Section} directives from song content,
 * leaving clean, human-readable lyrics.
 */
export function stripChordProMarkup(content: string): string {
  if (!content || typeof content !== 'string') return '';
  return content
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n');
}

/**
 * Extracts a clean lyric line (~80 chars) that matches the search query.
 * Returns null if the query is empty or no lyric line matches.
 */
export function getMatchingLyricSnippet(content: string, query: string): string | null {
  const normQuery = normalizeSearchText(query);
  if (!normQuery || !content || typeof content !== 'string') return null;

  const cleanContent = stripChordProMarkup(content);
  const lines = cleanContent.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const normLine = normalizeSearchText(line);
    const matchIdx = normLine.indexOf(normQuery);
    if (matchIdx !== -1) {
      if (line.length <= 80) {
        return line;
      }
      const halfWindow = Math.floor((80 - normQuery.length) / 2);
      const start = Math.max(0, matchIdx - halfWindow);
      const end = Math.min(line.length, start + 80);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < line.length ? '…' : '';
      return `${prefix}${line.slice(start, end).trim()}${suffix}`;
    }
  }

  return null;
}

function sortSongsList(songs: Song[], sortBy: SongSortOption): Song[] {
  if (sortBy === 'az') {
    return [...songs].sort((a, b) =>
      (a?.title || '').localeCompare(b?.title || '', 'pt', { sensitivity: 'base' })
    );
  }

  if (sortBy === 'recent') {
    return [...songs].sort((a, b) => {
      const dateA = Date.parse(a?.updated_at || a?.created_at || '') || 0;
      const dateB = Date.parse(b?.updated_at || b?.created_at || '') || 0;
      if (dateB !== dateA) return dateB - dateA;
      return (a?.title || '').localeCompare(b?.title || '', 'pt', { sensitivity: 'base' });
    });
  }

  if (sortBy === 'key') {
    return [...songs].sort((a, b) => {
      const keyA = (a?.original_key || '').trim();
      const keyB = (b?.original_key || '').trim();
      if (keyA !== keyB) {
        if (!keyA) return 1;
        if (!keyB) return -1;
        return keyA.localeCompare(keyB, 'pt', { sensitivity: 'base' });
      }
      return (a?.title || '').localeCompare(b?.title || '', 'pt', { sensitivity: 'base' });
    });
  }

  return songs;
}

/**
 * Accent-insensitive weighted search and ranking across songs.
 * Scoring hierarchy:
 * 1. Exact or prefix match on title (100+ pts)
 * 2. Substring match on title (70 pts)
 * 3. Match on tags, artist, or key (50 pts)
 * 4. Match in content lyrics (25 pts)
 */
export function searchAndRankSongs(
  songs: Song[],
  query: string,
  sortBy: SongSortOption = 'relevance'
): Song[] {
  if (!Array.isArray(songs)) return [];
  const validSongs = songs.filter((s): s is Song => Boolean(s && typeof s === 'object'));

  const normQuery = normalizeSearchText(query);
  if (!normQuery) {
    if (!sortBy || sortBy === 'relevance') {
      return songs;
    }
    return sortSongsList(validSongs, sortBy);
  }

  const scored: { song: Song; score: number }[] = [];

  for (const song of validSongs) {
    const normTitle = normalizeSearchText(song.title);
    const normArtist = normalizeSearchText(song.artist);
    const normKey = normalizeSearchText(song.original_key);
    const normTags = Array.isArray(song.tags)
      ? song.tags.map((t) => normalizeSearchText(t)).filter(Boolean)
      : [];
    const cleanLyrics = stripChordProMarkup(song.content || '');
    const normLyrics = normalizeSearchText(cleanLyrics);
    const normRawContent = normalizeSearchText(song.content);

    let score = 0;

    // 1. Title match
    if (normTitle === normQuery) {
      score += 120;
    } else if (normTitle.startsWith(normQuery)) {
      score += 100;
    } else if (normTitle.includes(normQuery)) {
      score += 70;
    }

    // 2. Tags, Artist, or Key match
    const matchesTag = normTags.some((t) => t === normQuery || t.includes(normQuery));
    const matchesArtist = normArtist.includes(normQuery);
    const matchesKey = normKey === normQuery;

    if (matchesTag || matchesArtist || matchesKey) {
      score += 50;
    }

    // 3. Lyrics / Content match
    if (normLyrics.includes(normQuery) || normRawContent.includes(normQuery)) {
      score += 25;
    }

    if (score > 0) {
      scored.push({ song, score });
    }
  }

  if (sortBy && sortBy !== 'relevance') {
    return sortSongsList(
      scored.map((item) => item.song),
      sortBy
    );
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.song.title || '').localeCompare(b.song.title || '', 'pt', { sensitivity: 'base' });
  });

  return scored.map((item) => item.song);
}
