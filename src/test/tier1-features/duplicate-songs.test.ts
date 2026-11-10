import { describe, it, expect } from 'vitest';
import { compareSongTitles, findDuplicateSongs, normalizeSongTitle } from '../../lib/duplicate-songs';

const songs = [
  { id: '1', title: 'Ave Maria', artist: null },
  { id: '2', title: 'Hino dos Escuteiros', artist: 'CNE' },
  { id: '3', title: 'Salmo 23', artist: '' },
  { id: '4', title: 'Senhor, eu não sou digno', artist: 'Tradicional' },
  { id: '5', title: 'Alegria', artist: 'Cirque' },
];

describe('normalizeSongTitle', () => {
  it('remove acentos, pontuação e maiúsculas', () => {
    expect(normalizeSongTitle('Avé-Maria!')).toBe('ave maria');
    expect(normalizeSongTitle('  O  Senhor é o Meu   Pastor. ')).toBe('o senhor e o meu pastor');
    expect(normalizeSongTitle(null)).toBe('');
  });
});

describe('compareSongTitles', () => {
  it('"Ave Maria" e "Avé-Maria!" são iguais', () => {
    expect(compareSongTitles('Ave Maria', 'Avé-Maria!')).toBe('exact');
  });

  it('ignora espaços entre palavras ("AveMaria")', () => {
    expect(compareSongTitles('AveMaria', 'Ave Maria')).toBe('exact');
  });

  it('"Ave Maria de Fátima" vs "Ave Maria" é possível duplicado', () => {
    expect(compareSongTitles('Ave Maria de Fátima', 'Ave Maria')).toBe('possible');
    expect(compareSongTitles('Ave Maria', 'Ave Maria de Fátima')).toBe('possible');
  });

  it('pequenos erros de escrita contam como possível duplicado', () => {
    expect(compareSongTitles('Senhor eu nao sou dino', 'Senhor, eu não sou digno')).toBe('possible');
  });

  it('títulos sem relação não correspondem', () => {
    expect(compareSongTitles('Alegria', 'Hino dos Escuteiros')).toBeNull();
    expect(compareSongTitles('Ave Maria', 'Pai Nosso')).toBeNull();
  });

  it('números diferentes não são erros de escrita', () => {
    expect(compareSongTitles('Salmo 23', 'Salmo 24')).toBeNull();
  });

  it('não procura palavras dentro de outras palavras', () => {
    // "Maria" não aparece em "Marianas" como palavra completa
    expect(compareSongTitles('Marianas do Mar', 'Maria')).toBeNull();
  });

  it('títulos vazios nunca correspondem', () => {
    expect(compareSongTitles('', 'Ave Maria')).toBeNull();
    expect(compareSongTitles('!!!', '???')).toBeNull();
  });
});

describe('findDuplicateSongs', () => {
  it('encontra o duplicado exato', () => {
    const result = findDuplicateSongs({ title: 'AVÉ MARIA' }, songs);
    expect(result).toHaveLength(1);
    expect(result[0].song.id).toBe('1');
    expect(result[0].kind).toBe('exact');
  });

  it('ordena exatos antes de possíveis', () => {
    const list = [...songs, { id: '6', title: 'Ave Maria de Fátima', artist: null }];
    const result = findDuplicateSongs({ title: 'Ave Maria' }, list);
    expect(result.map(r => r.song.id)).toEqual(['1', '6']);
    expect(result.map(r => r.kind)).toEqual(['exact', 'possible']);
  });

  it('título igual com outro artista passa a "possível"', () => {
    const result = findDuplicateSongs({ title: 'Alegria', artist: 'Outro Autor' }, songs);
    expect(result[0].kind).toBe('possible');
    expect(result[0].reason).toMatch(/outro artista/);
  });

  it('título igual e mesmo artista mantém-se exato', () => {
    const result = findDuplicateSongs({ title: 'alegria', artist: 'CIRQUE' }, songs);
    expect(result[0].kind).toBe('exact');
    expect(result[0].reason).toBe('Mesmo título e mesmo artista');
  });

  it('exclui o próprio id (edição)', () => {
    expect(findDuplicateSongs({ title: 'Ave Maria' }, songs, { excludeId: '1' })).toEqual([]);
  });

  it('sem correspondências para títulos novos ou vazios', () => {
    expect(findDuplicateSongs({ title: 'Canção Nova do Acampamento' }, songs)).toEqual([]);
    expect(findDuplicateSongs({ title: '   ' }, songs)).toEqual([]);
  });

  it('respeita o limite de resultados e ignora entradas inválidas', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, title: 'Ave Maria' }));
    const withJunk = [...many, null as any, { id: 'y', title: 42 } as any];
    expect(findDuplicateSongs({ title: 'Ave Maria' }, withJunk, { limit: 3 })).toHaveLength(3);
  });
});
