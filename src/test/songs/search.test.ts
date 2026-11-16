import { describe, it, expect } from 'vitest';
import {
  normalizeSearchText,
  stripChordProMarkup,
  getMatchingLyricSnippet,
  searchAndRankSongs,
} from '../../lib/search-utils';
import { normalizeTag } from '../../pages/Eucharist';
import type { Song } from '../../lib/types';

function song(partial: Partial<Song> & Pick<Song, 'id' | 'title'>): Song {
  return {
    artist: null,
    content: '',
    tags: [],
    original_key: 'C',
    created_by: null,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...partial,
  };
}

const CATALOG: Song[] = [
  song({
    id: 'oracao',
    title: 'Oração da Manhã',
    artist: 'Grupo de Teste',
    original_key: 'G',
    content: '{Estrofe 1}\n[G]Logo de manhã, [Em]antes de partir, um ins[C]trumento de [D]paz',
    tags: ['Oração', 'Comunhão'],
    updated_at: '2026-01-01T10:00:00Z',
  }),
  song({
    id: 'marcha',
    title: 'Marcha do Agrupamento',
    artist: 'Autor Exemplo',
    original_key: 'D',
    content: '{Refrão}\n[D]Pelo mar e pela [A]serra marchamos com [G]fervor',
    tags: ['Escutistas', 'Promessa'],
    updated_at: '2026-02-01T10:00:00Z',
  }),
  song({
    id: 'entrada',
    title: 'Canto de Entrada',
    artist: null,
    original_key: 'Em',
    content: '[Em]Vamos cantar com alegria',
    tags: ['entrada'],
    updated_at: '2025-12-01T10:00:00Z',
  }),
];

describe('Normalização e limpeza de texto', () => {
  it('ignora acentos, maiúsculas e espaços repetidos', () => {
    expect(normalizeSearchText('  Oração   de São   João  ')).toBe('oracao de sao joao');
    expect(normalizeSearchText('Pós-Comunhão')).toBe('pos-comunhao');
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(42)).toBe('');
  });

  it('retira acordes e diretivas ChordPro', () => {
    const stripped = stripChordProMarkup('{Refrão}\n[G]Logo de [Em]manhã');
    expect(stripped).toContain('Logo de manhã');
    expect(stripped).not.toContain('[G]');
    expect(stripped).not.toContain('{Refrão}');
  });

  it('mostra a linha da letra que corresponde à pesquisa, sem acordes', () => {
    expect(getMatchingLyricSnippet(CATALOG[0].content, 'instrumento')).toBe(
      'Logo de manhã, antes de partir, um instrumento de paz'
    );
    expect(getMatchingLyricSnippet(CATALOG[0].content, 'inexistente')).toBeNull();
    expect(getMatchingLyricSnippet(CATALOG[0].content, '   ')).toBeNull();
  });

  it('corta linhas longas à volta da palavra encontrada', () => {
    const longLine = `${'palavra '.repeat(20)}alvo ${'outra '.repeat(20)}`;
    const snippet = getMatchingLyricSnippet(longLine, 'alvo');
    expect(snippet).toContain('alvo');
    expect(snippet!.startsWith('…')).toBe(true);
    expect(snippet!.endsWith('…')).toBe(true);
  });

  it('normalizeTag (etiquetas litúrgicas) ignora acentos e tolera valores inválidos', () => {
    expect(normalizeTag('Comunhão')).toBe('comunhao');
    expect(normalizeTag('Pós-Comunhão')).toBe('pos-comunhao');
    expect(normalizeTag('Ofertório')).toBe('ofertorio');
    expect(normalizeTag('Bênção')).toBe('bencao');
    expect(normalizeTag('  Ato Penitencial  ')).toBe('ato penitencial');
    for (const invalid of [null, undefined, 12345, {}, [], false]) {
      expect(normalizeTag(invalid)).toBe('');
    }
  });
});

describe('searchAndRankSongs', () => {
  const ids = (songs: Song[]) => songs.map((s) => s.id);

  it('sem pesquisa devolve a lista original (a mesma referência)', () => {
    expect(searchAndRankSongs(CATALOG, '')).toBe(CATALOG);
    expect(searchAndRankSongs(CATALOG, '   ')).toBe(CATALOG);
  });

  it('encontra por título, artista, etiqueta, tom e letra, sem acentos', () => {
    expect(ids(searchAndRankSongs(CATALOG, 'oracao'))).toEqual(['oracao']);
    expect(ids(searchAndRankSongs(CATALOG, 'autor exemplo'))).toEqual(['marcha']);
    expect(ids(searchAndRankSongs(CATALOG, 'promessa'))).toEqual(['marcha']);
    expect(ids(searchAndRankSongs(CATALOG, 'em'))).toContain('entrada');
    expect(ids(searchAndRankSongs(CATALOG, 'marchamos'))).toEqual(['marcha']);
    expect(searchAndRankSongs(CATALOG, 'inexistente 999')).toEqual([]);
  });

  it('título vale mais do que letra: "entrada" no título fica à frente', () => {
    const catalog = [
      song({ id: 'letra', title: 'Outro Cântico', content: 'Cantamos à entrada da igreja' }),
      song({ id: 'titulo', title: 'Canto de Entrada' }),
      song({ id: 'exato', title: 'Entrada' }),
    ];
    expect(ids(searchAndRankSongs(catalog, 'entrada'))).toEqual(['exato', 'titulo', 'letra']);
  });

  it('ordena por A-Z, mais recentes e tom', () => {
    expect(ids(searchAndRankSongs(CATALOG, '', 'az'))).toEqual(['entrada', 'marcha', 'oracao']);
    expect(ids(searchAndRankSongs(CATALOG, '', 'recent'))).toEqual(['marcha', 'oracao', 'entrada']);
    expect(ids(searchAndRankSongs(CATALOG, '', 'key'))).toEqual(['marcha', 'entrada', 'oracao']);
  });

  it('tolera entradas inválidas e listas que não são listas', () => {
    const withGarbage = [null, undefined, CATALOG[0]] as unknown as Song[];
    expect(ids(searchAndRankSongs(withGarbage, 'oracao'))).toEqual(['oracao']);
    expect(searchAndRankSongs(null as unknown as Song[], 'x')).toEqual([]);
  });
});
