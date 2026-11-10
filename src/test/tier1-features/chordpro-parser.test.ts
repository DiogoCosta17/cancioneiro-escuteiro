import { describe, it, expect } from 'vitest';
import {
  parseChordProLine,
  cleanAndAlignChordPro,
  parseChordPro,
  transposeParsedLines,
  isSectionDirective,
} from '../../lib/chordpro-parser';
import {
  convertToChordPro,
  isChordLine,
  isChordToken,
} from '../../lib/chordpro-converter';
import { parseChord, standardizeContentNotation } from '../../lib/chords';
import { getChordDefinition } from '../../lib/guitar-chords';

describe('Tier 1: ChordPro Parser Engine (chordpro-parser.ts)', () => {
  describe('parseChordProLine', () => {
    it('parses a line with no chords as a single token', () => {
      const tokens = parseChordProLine('Caminhando pela floresta');
      expect(tokens).toEqual([{ chord: null, text: 'Caminhando pela floresta' }]);
    });

    it('parses a line starting with text before first chord', () => {
      const tokens = parseChordProLine('Tu és a [C]luz do [G]mundo');
      expect(tokens).toEqual([
        { chord: null, text: 'Tu és a ' },
        { chord: 'C', text: 'luz do ' },
        { chord: 'G', text: 'mundo' },
      ]);
    });

    it('parses a line starting directly with a chord', () => {
      const tokens = parseChordProLine('[C]Aleluia [G]ao Senhor');
      expect(tokens).toEqual([
        { chord: 'C', text: 'Aleluia ' },
        { chord: 'G', text: 'ao Senhor' },
      ]);
    });

    it('handles chords attached to spaces properly without drifting', () => {
      const tokens = parseChordProLine('[D] palavra1 [A] palavra2');
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.some((t) => t.chord === 'D')).toBe(true);
      expect(tokens.some((t) => t.chord === 'A')).toBe(true);
    });
  });

  describe('cleanAndAlignChordPro', () => {
    it('handles empty input gracefully', () => {
      expect(cleanAndAlignChordPro('')).toBe('');
    });

    it('preserves section directives like {Refrão} and {Intro}', () => {
      const input = '{Refrão}\n{Intro}\n[C]Letra';
      const output = cleanAndAlignChordPro(input);
      expect(output).toContain('{Refrão}');
      expect(output).toContain('{Intro}');
    });

    it('fixes chords separated by spaces from word at line start: "^[G]  Palavra" -> "^[G]Palavra"', () => {
      const input = '[G]  Palavra';
      const output = cleanAndAlignChordPro(input);
      expect(output).toBe('[G]Palavra');
    });

    it('repairs glued prefixes like "os[Lá]olhos" -> "os [Lá]olhos"', () => {
      const input = 'Abrindo os[Lá]olhos para o sol';
      const output = cleanAndAlignChordPro(input);
      expect(output).toBe('Abrindo os [Lá]olhos para o sol');
    });

    it('does not split legitimate chorded words like "cami[G]nhos"', () => {
      const input = 'pelos cami[G]nhos da vida';
      const output = cleanAndAlignChordPro(input);
      expect(output).toBe('pelos cami[G]nhos da vida');
    });
  });

  describe('isSectionDirective', () => {
    it('detects simple bracketed directives: {Refrão}, {Intro}, {Estrofe 1}', () => {
      expect(isSectionDirective('{Refrão}')).toBe('Refrão');
      expect(isSectionDirective('{Intro}')).toBe('Intro');
      expect(isSectionDirective('{Estrofe 1}')).toBe('Estrofe 1');
      expect(isSectionDirective('{Ponte}')).toBe('Ponte');
    });

    it('detects standard ChordPro directives: {soc}, {start_of_chorus}, {comment: Solo}', () => {
      expect(isSectionDirective('{soc}')).toBe('Refrão');
      expect(isSectionDirective('{start_of_chorus}')).toBe('Refrão');
      expect(isSectionDirective('{start_of_chorus: Coro}')).toBe('Coro');
      expect(isSectionDirective('{comment: Solo de Guitarra}')).toBe('Solo de Guitarra');
    });

    it('ignores chordpro closing directives: {eoc}, {end_of_chorus}', () => {
      expect(isSectionDirective('{eoc}')).toBeNull();
      expect(isSectionDirective('{end_of_chorus}')).toBeNull();
    });

    it('returns null for normal lines', () => {
      expect(isSectionDirective('[C]Lá no alto da montanha')).toBeNull();
      expect(isSectionDirective('Apenas letra')).toBeNull();
    });
  });

  describe('parseChordPro', () => {
    it('parses multi-line chordpro text into structured ParsedLine array', () => {
      const songContent = `
{Refrão}
[C]Canta com a[G]mor
[Am]Vive com al[F]egria

{Estrofe 1}
[C]Na alvorada do [G]dia
      `.trim();

      const lines = parseChordPro(songContent);
      expect(lines.length).toBeGreaterThan(0);

      // Section header line
      expect(lines[0].sectionHeader).toBe('Refrão');
      expect(lines[0].tokens).toEqual([]);

      // Lyrics line
      expect(lines[1].tokens.length).toBe(2);
      expect(lines[1].tokens[0].chord).toBe('C');
      expect(lines[1].tokens[1].chord).toBe('G');

      // Blank line separating sections
      expect(lines[3].isBlank).toBe(true);
    });

    it('handles null/empty string content safely', () => {
      expect(parseChordPro('')).toEqual([]);
    });
  });

  describe('transposeParsedLines', () => {
    it('transposes all tokens in parsed lines', () => {
      const lines = parseChordPro('[C]Luz do [G]mundo');
      const transposed = transposeParsedLines(lines, 2, false, 'alfabetica');

      expect(transposed[0].tokens[0].chord).toBe('D');
      expect(transposed[0].tokens[1].chord).toBe('A');
    });

    it('formats tokens into syllabic notation', () => {
      const lines = parseChordPro('[C]Luz do [G]mundo');
      const transposed = transposeParsedLines(lines, 0, false, 'silabica');

      expect(transposed[0].tokens[0].chord).toBe('Dó');
      expect(transposed[0].tokens[1].chord).toBe('Sol');
    });

    it('hides chords when notation is "ocultar"', () => {
      const lines = parseChordPro('[C]Luz do [G]mundo');
      const transposed = transposeParsedLines(lines, 0, false, 'ocultar');

      expect(transposed[0].tokens[0].chord).toBeNull();
      expect(transposed[0].tokens[1].chord).toBeNull();
      expect(transposed[0].tokens[0].text).toContain('Luz do ');
    });
  });

  describe('cleanAndAlignChordPro Edge Cases', () => {
    it('does not split words like "ossos" or "nosso" into "os [D]sos" or "nos [D]so"', () => {
      const input = 'Se não for os[D]sos do nos[A]so amor';
      const output = cleanAndAlignChordPro(input);
      expect(output).toBe('Se não for [D]ossos do [A]nosso amor');
      expect(output).not.toContain('os [D]sos');
      expect(output).not.toContain('nos [A]so');
    });

    it('does not split real words that start like an article ("as[G]sim", "dos[G]sel", "os[D]tentar")', () => {
      expect(cleanAndAlignChordPro('Foi as[G]sim que eu vi')).toBe('Foi as[G]sim que eu vi');
      expect(cleanAndAlignChordPro('Sob o dos[G]sel do céu')).toBe('Sob o dos[G]sel do céu');
      expect(cleanAndAlignChordPro('Sem os[D]tentar nada')).toBe('Sem [D]ostentar nada');
      expect(cleanAndAlignChordPro('Quero as[C]pirar ao céu')).toBe('Quero [C]aspirar ao céu');
      // Artigos realmente colados continuam a ser separados
      expect(cleanAndAlignChordPro('Abrindo os[Lá]olhos')).toBe('Abrindo os [Lá]olhos');
      expect(cleanAndAlignChordPro('Cantam as[G]flores')).toBe('Cantam as [G]flores');
    });

    it('preserves clean aligned lines like "Se não for os [D]ossos do nosso amor"', () => {
      const input = 'Se não for os [D]ossos do nosso amor';
      const output = cleanAndAlignChordPro(input);
      expect(output).toBe('Se não for os [D]ossos do nosso amor');
    });
  });

  describe('convertToChordPro & 2-Line Tab Conversion', () => {
    it('recognizes multi-token chord lines with Em, A, E without treating them as common words', () => {
      expect(isChordToken('Em')).toBe(true);
      expect(isChordToken('A')).toBe(true);
      expect(isChordToken('E')).toBe(true);
      expect(isChordToken('D')).toBe(true);

      const chordLine = '         Em   D';
      expect(isChordLine(chordLine)).toBe(true);
    });

    it('recognizes and formats parenthesized instrumental lines', () => {
      const parenLine = '( Em   D   C   Em   D )';
      expect(isChordLine(parenLine)).toBe(true);
      const converted = convertToChordPro(parenLine);
      expect(converted).toBe('( [Em]   [D]   [C]   [Em]   [D] )');
    });

    it('snaps chords inside words back to word start to prevent cutting words in half', () => {
      const tab = `              Am
Se não formos corpos em furacão
         Em   D
Sem roupa nas palavras`;
      const converted = convertToChordPro(tab);
      expect(converted).toContain('Se não formos [Am]corpos');
      expect(converted).not.toContain('co[Am]rpos');
      expect(converted).toContain('Sem roupa [Em]nas [D]palavras');
    });

    it('correctly converts the full song "Guarda-me Esta Noite" without split words or missing chords', () => {
      const songTab = `Em
A casa vai ruir
               D
Se não for os ossos do nosso amor
              Am
Se não formos corpos em furacão
         Em   D
Sem roupa nas palavras
Em
Porque o tempo é um fio
                D
Que pode romper hoje
             Am
Sem que nós vivêssemos demais
                        Em
Exaltássemos demais sem receios

D             C
Como... se soubesses que amanhã
                     Am
Não há um amanhã tão certo
               Em
Guarda-me esta noite
               D
Guarda-me esta noite
    C
E o universo ainda não tem
                        Am
O que nos falta para sermos eternos
               Em
Guarda-me esta noite
                 D
Escreve a nossa História

( Em   D   C   Em   D )`;

      const result = convertToChordPro(songTab);

      // Verify no chords are left unconverted as plain text lines
      expect(result).not.toMatch(/^\s+Em\s+D$/m);
      expect(result).not.toContain('( Em   D   C   Em   D )');
      expect(result).toContain('( [Em]   [D]   [C]   [Em]   [D] )');

      // Verify chords snap to word starts and never slice words
      expect(result).toContain('[Em]A casa vai ruir');
      expect(result).toContain('Se não for os [D]ossos do nosso amor');
      expect(result).not.toContain('os os [D]sos');
      expect(result).not.toContain('co[Am]rpos');
      expect(result).toContain('[Am]corpos');
      expect(result).toContain('Sem roupa [Em]nas [D]palavras');
      expect(result).not.toContain('h[D]oje');
      expect(result).toContain('[D]hoje');
      expect(result).not.toContain('viv[Am]êssemos');
      expect(result).toContain('[Am]vivêssemos');
      expect(result).not.toContain('rece[Em]ios');
      expect(result).toContain('[Em]receios');
      expect(result).not.toContain('so[C]ubesses');
      expect(result).toContain('[C]soubesses');
      expect(result).toContain('Guarda-me esta [Em]noite');
      expect(result).toContain('Guarda-me esta [D]noite');
      expect(result).not.toContain('univ[C]erso');
      expect(result).toContain('[C]universo');
      expect(result).toContain('[Am]sermos');
      expect(result).not.toContain('His[D]tória');
      expect(result).toContain('[D]História');
    });

    it('repairs impossible consonant-only syllable splits from OCR like "S[G]enhor", "pr[D]esente", and "Senho[G]r"', () => {
      const input = 'S[G]enhor aqui pr[D]esente com amo[Am]r no cami[C]nho';
      const cleaned = cleanAndAlignChordPro(input);
      expect(cleaned).toBe('[G]Senhor aqui [D]presente com [Am]amor no cami[C]nho');
    });

    it('recognizes extended Portuguese/CifraClub chord notations (7M, 7+, 7/4, º, (b5)) and resolves guitar diagrams for solfège', () => {
      expect(parseChord('C7M')).toEqual({ root: 'C', suffix: '7M' });
      expect(parseChord('F7+')).toEqual({ root: 'F', suffix: '7+' });
      expect(parseChord('G7/4')).toEqual({ root: 'G', suffix: '7/4' });
      expect(parseChord('Cº')).toEqual({ root: 'C', suffix: 'º' });
      expect(parseChord('Bm7(b5)')).toEqual({ root: 'B', suffix: 'm7(b5)' });

      // Guitar diagrams must work even when chords are stored in Portuguese solfège
      expect(getChordDefinition('Sol')?.frets).toEqual([3, 2, 0, 0, 0, 3]);
      expect(getChordDefinition('Ré-')?.frets).toEqual([-1, -1, 0, 2, 3, 1]);
      expect(getChordDefinition('Mim')?.frets).toEqual([0, 2, 2, 0, 0, 0]);
      expect(getChordDefinition('Dó7M')?.frets).toEqual([-1, 3, 2, 0, 0, 0]);
    });

    it('converts standalone section headers (without colons or brackets) and standardizes chord notation on demand', () => {
      const rawText = `Introdução
G  D  Em  C

1ª Estrofe
G            D
Senhor fazei de mim

Refrão
C            G
Um instrumento da Paz`;
      const converted = convertToChordPro(rawText);
      expect(converted).toContain('{Intro}');
      expect(converted).toContain('{Estrofe 1}');
      expect(converted).toContain('{Refrão}');

      const toSilabica = standardizeContentNotation('[G]Senhor [Dm]fazei de [Em]mim', 'silabica');
      expect(toSilabica).toBe('[Sol]Senhor [Rém]fazei de [Mim]mim');

      const toAlfabetica = standardizeContentNotation('[Sol]Senhor [Ré-]fazei de [Mim]mim', 'alfabetica');
      expect(toAlfabetica).toBe('[G]Senhor [Dm]fazei de [Em]mim');
    });
  });
});
