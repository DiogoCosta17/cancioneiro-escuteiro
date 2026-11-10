import { describe, it, expect } from 'vitest';
import { parseChord, transposeChord, keyPrefersFlats } from '../../lib/chords';
import { parseChordProLine } from '../../lib/chordpro-parser';
import { convertToChordPro, isChordLine } from '../../lib/chordpro-converter';
import { isBarreChord } from '../../lib/capo-advisor';
import { getChordDefinition, GUITAR_CHORDS } from '../../lib/guitar-chords';

describe('Regressões de lógica musical', () => {
  it('reconhece e transpõe acordes em F com sufixo começado por "a" (Fadd9, Faug)', () => {
    expect(parseChord('Fadd9')).toEqual({ root: 'F', suffix: 'add9' });
    expect(transposeChord('Fadd9', 2)).toBe('Gadd9');
    expect(transposeChord('Faug', 1)).toBe('F#aug');
    // Solfejo continua a funcionar
    expect(parseChord('Fá#m')).toEqual({ root: 'F#', suffix: 'm' });
    expect(parseChord('Sol7')).toEqual({ root: 'G', suffix: '7' });
  });

  it('keyPrefersFlats segue a armação de clave', () => {
    expect(keyPrefersFlats('F')).toBe(true);
    expect(keyPrefersFlats('Sib')).toBe(true);
    expect(keyPrefersFlats('Dm')).toBe(true);
    expect(keyPrefersFlats('Ré-')).toBe(true);
    expect(keyPrefersFlats('D')).toBe(false);
    expect(keyPrefersFlats('A#')).toBe(true);
    expect(keyPrefersFlats('F#m')).toBe(false);
    expect(keyPrefersFlats('xyz')).toBeUndefined();
  });

  it('não perde texto com parênteses retos sem fecho ou vazios', () => {
    const join = (l: string) => parseChordProLine(l).map((t) => t.text).join('');
    expect(join('[G]Hello [D')).toBe('Hello [D');
    expect(join('[G text')).toBe('[G text');
    expect(join('a [] b')).toBe('a [] b');
    expect(parseChordProLine('[G]Hello [D').map((t) => t.chord)).toEqual(['G']);
  });

  it('converter mantém a mudança de acorde a meio da palavra quando o primeiro acorde já está no início', () => {
    expect(convertToChordPro('G  D\nSenhor meu')).toBe('[G]Sen[D]hor meu');
  });

  it('converter não colapsa títulos de secção que apenas contêm palavras-chave', () => {
    expect(convertToChordPro('[Ponte instrumental]')).toBe('{Ponte instrumental}');
  });

  it('converter não sofre backtracking exponencial em tokens longos', () => {
    const start = Date.now();
    expect(isChordLine('A' + '1'.repeat(40) + 'x')).toBe(false);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('CM7 (sétima maior) não é tratado como acorde menor de pestana', () => {
    expect(isBarreChord('CM7')).toBe(false);
    expect(isBarreChord('Cm7')).toBe(true);
  });

  it('diagramas: menores com extensões não caem em desenhos maiores; slash chords em solfejo', () => {
    expect(getChordDefinition('Am9')?.frets).toEqual(GUITAR_CHORDS['Am'].frets);
    expect(getChordDefinition('Em11')?.frets).toEqual(GUITAR_CHORDS['Em'].frets);
    expect(getChordDefinition('Ré/Fá#')?.frets).toEqual(GUITAR_CHORDS['D/F#'].frets);
    expect(getChordDefinition('Dbmaj9')?.frets).not.toEqual(GUITAR_CHORDS['Dbm'].frets);
  });
});
