import { describe, it, expect } from 'vitest';
import {
  parseChord,
  transposeChord,
  formatChordNotation,
  transposeContent,
  standardizeContentNotation,
  semitoneDifference,
  getKeyName,
  extractUniqueChords,
} from '../../lib/chords';
import { getChordDefinition, normalizeChordName } from '../../lib/guitar-chords';
import { cleanAndAlignChordPro } from '../../lib/chordpro-parser';

describe('Tier 1: Music & Chords Engine (chords.ts)', () => {
  describe('parseChord', () => {
    it('parses standard English major chords', () => {
      expect(parseChord('C')).toEqual({ root: 'C', suffix: '' });
      expect(parseChord('G')).toEqual({ root: 'G', suffix: '' });
      expect(parseChord('D')).toEqual({ root: 'D', suffix: '' });
    });

    it('parses chords with accidentals (# and b)', () => {
      expect(parseChord('F#')).toEqual({ root: 'F#', suffix: '' });
      expect(parseChord('Bb')).toEqual({ root: 'Bb', suffix: '' });
      expect(parseChord('C#')).toEqual({ root: 'C#', suffix: '' });
      expect(parseChord('Eb')).toEqual({ root: 'Eb', suffix: '' });
    });

    it('parses Portuguese solfege roots and normalizes to standard English root', () => {
      expect(parseChord('Dó')).toEqual({ root: 'C', suffix: '' });
      expect(parseChord('Ré')).toEqual({ root: 'D', suffix: '' });
      expect(parseChord('Mi')).toEqual({ root: 'E', suffix: '' });
      expect(parseChord('Fá')).toEqual({ root: 'F', suffix: '' });
      expect(parseChord('Sol')).toEqual({ root: 'G', suffix: '' });
      expect(parseChord('Lá')).toEqual({ root: 'A', suffix: '' });
      expect(parseChord('Si')).toEqual({ root: 'B', suffix: '' });
    });

    it('parses Portuguese roots with accidentals', () => {
      expect(parseChord('Fá#')).toEqual({ root: 'F#', suffix: '' });
      expect(parseChord('Sib')).toEqual({ root: 'Bb', suffix: '' });
      expect(parseChord('Dó#')).toEqual({ root: 'C#', suffix: '' });
    });

    it('parses suffixes (m, 7, maj7, sus4, dim, add9)', () => {
      expect(parseChord('Am')).toEqual({ root: 'A', suffix: 'm' });
      expect(parseChord('G7')).toEqual({ root: 'G', suffix: '7' });
      expect(parseChord('Cmaj7')).toEqual({ root: 'C', suffix: 'maj7' });
      expect(parseChord('Dsus4')).toEqual({ root: 'D', suffix: 'sus4' });
    });

    it('parses slash chords with bass notes', () => {
      expect(parseChord('D/F#')).toEqual({ root: 'D', suffix: '/F#' });
      expect(parseChord('C/G')).toEqual({ root: 'C', suffix: '/G' });
    });

    it('returns null for invalid chord strings', () => {
      expect(parseChord('XYZ')).toBeNull();
      expect(parseChord('123')).toBeNull();
      expect(parseChord('')).toBeNull();
    });
  });

  describe('transposeChord', () => {
    it('leaves chords unchanged when semitones is 0', () => {
      expect(transposeChord('C', 0)).toBe('C');
      expect(transposeChord('Am', 0)).toBe('Am');
    });

    it('transposes single semitones up (+1)', () => {
      expect(transposeChord('C', 1)).toBe('C#');
      expect(transposeChord('E', 1)).toBe('F');
      expect(transposeChord('B', 1)).toBe('C');
    });

    it('transposes whole tones up (+2)', () => {
      expect(transposeChord('C', 2)).toBe('D');
      expect(transposeChord('G', 2)).toBe('A');
      expect(transposeChord('Am', 2)).toBe('Bm');
    });

    it('transposes down with negative semitones', () => {
      expect(transposeChord('D', -2)).toBe('C');
      expect(transposeChord('A', -2)).toBe('G');
    });

    it('respects preferFlats flag', () => {
      expect(transposeChord('C', 1, true)).toBe('Db');
      expect(transposeChord('C', 1, false)).toBe('C#');
      expect(transposeChord('G', 3, true)).toBe('Bb');
      expect(transposeChord('G', 3, false)).toBe('A#');
    });

    it('transposes slash chords including the bass note', () => {
      expect(transposeChord('D/F#', 2)).toBe('E/G#');
      expect(transposeChord('C/G', 2)).toBe('D/A');
    });
  });

  describe('formatChordNotation', () => {
    it('formats into alphabetical notation and normalizes hyphenated minors (Feature 17)', () => {
      expect(formatChordNotation('C', 'alfabetica')).toBe('C');
      expect(formatChordNotation('Dó', 'alfabetica')).toBe('C');
      expect(formatChordNotation('Sol', 'alfabetica')).toBe('G');
      expect(formatChordNotation('Am', 'alfabetica')).toBe('Am');
      // Portuguese hyphenated minor normalization
      expect(formatChordNotation('Ré-', 'alfabetica')).toBe('Dm');
      expect(formatChordNotation('Lá-', 'alfabetica')).toBe('Am');
      expect(formatChordNotation('Mi-', 'alfabetica')).toBe('Em');
      expect(formatChordNotation('Dó-', 'alfabetica')).toBe('Cm');
      expect(formatChordNotation('Ré-7', 'alfabetica')).toBe('Dm7');
    });

    it('formats into syllabic Portuguese notation', () => {
      expect(formatChordNotation('C', 'silabica')).toBe('Dó');
      expect(formatChordNotation('D', 'silabica')).toBe('Ré');
      expect(formatChordNotation('E', 'silabica')).toBe('Mi');
      expect(formatChordNotation('F', 'silabica')).toBe('Fá');
      expect(formatChordNotation('G', 'silabica')).toBe('Sol');
      expect(formatChordNotation('A', 'silabica')).toBe('Lá');
      expect(formatChordNotation('B', 'silabica')).toBe('Si');
      expect(formatChordNotation('Am', 'silabica')).toBe('Lám');
      expect(formatChordNotation('F#m7', 'silabica')).toBe('Fá#m7');
    });

    it('formats slash chords in both notations', () => {
      expect(formatChordNotation('D/F#', 'silabica')).toBe('Ré/Fá#');
      expect(formatChordNotation('D/F#', 'alfabetica')).toBe('D/F#');
    });
  });

  describe('transposeContent', () => {
    it('transposes all chords enclosed in brackets within lyrics', () => {
      const content = 'Tu és a [C]luz do [G]mundo que ilumina a [Am]terra [F]';
      const transposed = transposeContent(content, 2);
      expect(transposed).toBe('Tu és a [D]luz do [A]mundo que ilumina a [Bm]terra [G]');
    });
  });

  describe('semitoneDifference & getKeyName', () => {
    it('calculates semitone distance correctly for major, minor and solfege roots (Feature 19)', () => {
      expect(semitoneDifference('C', 'D')).toBe(2);
      expect(semitoneDifference('C', 'G')).toBe(7);
      expect(semitoneDifference('G', 'C')).toBe(5);
      // Minor roots
      expect(semitoneDifference('Am', 'Bm')).toBe(2);
      expect(semitoneDifference('Dm', 'Em')).toBe(2);
      // Solfege roots
      expect(semitoneDifference('Dó', 'Ré')).toBe(2);
      expect(semitoneDifference('Lá-', 'Mi-')).toBe(7);
      expect(semitoneDifference('Sol', 'Dó')).toBe(5);
    });

    it('gets formatted key name', () => {
      expect(getKeyName('C', 2, false, 'alfabetica')).toBe('D');
      expect(getKeyName('C', 2, false, 'silabica')).toBe('Ré');
    });
  });

  describe('extractUniqueChords', () => {
    it('extracts unique chords in order of appearance', () => {
      const content = '[C] Palavra [G] outra [C] palavra [Am] final [G]';
      const chords = extractUniqueChords(content);
      expect(chords).toEqual(['C', 'G', 'Am']);
    });

    it('extracts unique transposed chords', () => {
      const content = '[C] [G] [Am]';
      const chords = extractUniqueChords(content, 2);
      expect(chords).toEqual(['D', 'A', 'Bm']);
    });

    it('returns empty array when content has no chords or is empty', () => {
      expect(extractUniqueChords('')).toEqual([]);
      expect(extractUniqueChords('Texto sem acordes')).toEqual([]);
    });
  });

  describe('standardizeContentNotation & Solfège Guitar Diagrams', () => {
    it('converts ChordPro content between alphabetical and syllabic notation while preserving directives', () => {
      const sample = '{Refrão}\nHoje é o [Dó]dia da vi[Sol]tória e da ver[Lá-]dade,';
      expect(standardizeContentNotation(sample, 'alfabetica')).toBe(
        '{Refrão}\nHoje é o [C]dia da vi[G]tória e da ver[Am]dade,'
      );
      expect(standardizeContentNotation('{Refrão}\n[C]Luz [Dm]vida [Em7]paz', 'silabica')).toBe(
        '{Refrão}\n[Dó]Luz [Rém]vida [Mim7]paz'
      );
    });

    it('resolves guitar chord diagrams directly from Portuguese solfège and CifraClub suffixes', () => {
      expect(normalizeChordName('Sol')).toBe('G');
      expect(normalizeChordName('Ré-')).toBe('Dm');
      expect(normalizeChordName('Lá-7')).toBe('Am7');
      expect(normalizeChordName('Dó7M')).toBe('Cmaj7');
      expect(getChordDefinition('Sol')?.frets).toEqual(getChordDefinition('G')?.frets);
      expect(getChordDefinition('Ré-')?.frets).toEqual(getChordDefinition('Dm')?.frets);
      expect(getChordDefinition('Mi-')?.frets).toEqual(getChordDefinition('Em')?.frets);
      expect(getChordDefinition('Dó7M')?.frets).toEqual(getChordDefinition('Cmaj7')?.frets);
    });

    it('repairs impossible consonant-only word splits in cleanAndAlignChordPro', () => {
      expect(cleanAndAlignChordPro('Louvai ao S[G]enhor aqui pr[D]esente com amo[Am]r')).toBe(
        'Louvai ao [G]Senhor aqui [D]presente com [Am]amor'
      );
      // Preserves legitimate interior syllable splits
      expect(cleanAndAlignChordPro('Hoje é o [Dó]dia da vi[Sol]tória e da ver[Lá-]dade,')).toBe(
        'Hoje é o [Dó]dia da vi[Sol]tória e da ver[Lá-]dade,'
      );
    });
  });
});
