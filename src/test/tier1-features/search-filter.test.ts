import { describe, it, expect } from 'vitest';
import type { Song } from '../../lib/types';

// Canonical search logic from useSongs and catalog views
function searchSongs(songs: Song[], query: string): Song[] {
  if (!query || !query.trim()) return songs;
  const lowerQuery = query.toLowerCase().trim();

  return songs.filter((song) => {
    const titleMatch = (song.title || '').toLowerCase().includes(lowerQuery);
    const artistMatch = (song.artist || '').toLowerCase().includes(lowerQuery);
    const contentMatch = (song.content || '').toLowerCase().includes(lowerQuery);
    const tagsMatch = (song.tags || []).some((t) => (t || '').toLowerCase().includes(lowerQuery));
    return titleMatch || artistMatch || contentMatch || tagsMatch;
  });
}

function normalizeTag(tag: string): string {
  if (!tag) return '';
  return tag
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function filterByLiturgicalMoment(songs: Song[], momentTags: string[]): Song[] {
  const normalizedTargets = momentTags.map(normalizeTag);
  return songs.filter((song) =>
    (song.tags || []).some((t) => normalizedTargets.includes(normalizeTag(t)))
  );
}

describe('Tier 1: Search & Filter Logic', () => {
  const songsCatalog: Song[] = [
    {
      id: '1',
      title: 'Hino da Flor de Lis',
      artist: 'Baden-Powell',
      content: '[C]A flor de lis nos guia nos caminhos da honra',
      tags: ['escutistas', 'promessa', 'hino'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    {
      id: '2',
      title: 'Avante Escuteiros',
      artist: 'Pe. Hugo',
      content: '[D]Pelo mar e pela serra marchamos com fervor',
      tags: ['escutistas', 'marcha'],
      original_key: 'D',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    {
      id: '3',
      title: 'Pão do Céu',
      artist: 'Comunidade Shalom',
      content: '[G]Tomai e comei, este é o meu corpo na comunhão',
      tags: ['comunhão', 'eucaristia'],
      original_key: 'G',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    {
      id: '4',
      title: 'Canto de Entrada Festivo',
      artist: null,
      content: '[Em]Vamos cantar com alegria à casa do Senhor',
      tags: ['entrada'],
      original_key: 'Em',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
  ];

  it('returns all songs when query is empty', () => {
    expect(searchSongs(songsCatalog, '')).toEqual(songsCatalog);
    expect(searchSongs(songsCatalog, '   ')).toEqual(songsCatalog);
  });

  it('filters songs by title (case-insensitive)', () => {
    const results = searchSongs(songsCatalog, 'flor de lis');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('1');
  });

  it('filters songs by artist', () => {
    const results = searchSongs(songsCatalog, 'Pe. Hugo');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('2');
  });

  it('filters songs by lyrics content', () => {
    const results = searchSongs(songsCatalog, 'marchamos');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('2');
  });

  it('filters songs by tag', () => {
    const results = searchSongs(songsCatalog, 'promessa');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('1');
  });

  it('returns empty array when no matches are found', () => {
    const results = searchSongs(songsCatalog, 'inexistente 999');
    expect(results).toEqual([]);
  });

  it('normalizes liturgical tags stripping diacritics', () => {
    expect(normalizeTag('Comunhão')).toBe('comunhao');
    expect(normalizeTag('Pós-Comunhão')).toBe('pos-comunhao');
    expect(normalizeTag('Ofertório')).toBe('ofertorio');
    expect(normalizeTag('Bênção')).toBe('bencao');
  });

  it('filters liturgical songs regardless of tag diacritic differences', () => {
    const comunhaoSongs = filterByLiturgicalMoment(songsCatalog, ['comunhao']);
    expect(comunhaoSongs.length).toBe(1);
    expect(comunhaoSongs[0].title).toBe('Pão do Céu');

    const entradaSongs = filterByLiturgicalMoment(songsCatalog, ['entrada']);
    expect(entradaSongs.length).toBe(1);
    expect(entradaSongs[0].title).toBe('Canto de Entrada Festivo');
  });
});
