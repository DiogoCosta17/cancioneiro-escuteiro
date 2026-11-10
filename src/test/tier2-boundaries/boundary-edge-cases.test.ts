import { describe, it, expect } from 'vitest';
import {
  parseChord,
  transposeChord,
  transposeContent,
  extractUniqueChords,
} from '../../lib/chords';
import {
  cleanAndAlignChordPro,
  parseChordPro,
  transposeParsedLines,
} from '../../lib/chordpro-parser';

describe('Tier 2: Boundary & Corner Cases (boundary-edge-cases.test.ts)', () => {
  describe('Empty and Malformed Content Resilience', () => {
    it('handles empty string content gracefully', () => {
      expect(cleanAndAlignChordPro('')).toBe('');
      expect(parseChordPro('')).toEqual([]);
      expect(extractUniqueChords('')).toEqual([]);
      expect(transposeContent('', 2)).toBe('');
    });

    it('handles whitespace-only content', () => {
      const whitespace = '   \n  \t  \n  ';
      expect(cleanAndAlignChordPro(whitespace).trim()).toBe('');
      const parsed = parseChordPro(whitespace);
      expect(parsed.every((p) => p.isBlank)).toBe(true);
      expect(extractUniqueChords(whitespace)).toEqual([]);
    });

    it('handles chords with unicode accidentals (♯ and ♭)', () => {
      expect(parseChord('F♯')).toEqual({ root: 'F#', suffix: '' });
      expect(parseChord('B♭')).toEqual({ root: 'Bb', suffix: '' });
      expect(transposeChord('F♯', 2)).toBe('G#');
      expect(transposeChord('B♭', 2, true)).toBe('C');
    });
  });

  describe('Pure Instrumental & Chords Without Words', () => {
    it('parses lines composed exclusively of chords (e.g. solo or intro)', () => {
      const line = '[Am] [G] [F] [E]';
      const parsed = parseChordPro(line);
      expect(parsed.length).toBe(1);
      const tokens = parsed[0].tokens;
      expect(tokens.length).toBe(4);
      expect(tokens.map((t) => t.chord)).toEqual(['Am', 'G', 'F', 'E']);
    });

    it('transposes purely instrumental lines correctly', () => {
      const line = '[Am] [G] [F] [E]';
      const parsed = parseChordPro(line);
      const transposed = transposeParsedLines(parsed, 2, false, 'alfabetica');
      expect(transposed[0].tokens.map((t) => t.chord)).toEqual(['Bm', 'A', 'G', 'F#']);
    });
  });

  describe('Extreme Transpositions (+/- 12, +/- 24, +/- 13, +/- 11)', () => {
    it('+12 semitones (one full octave) preserves root note and chord quality', () => {
      expect(transposeChord('C', 12)).toBe('C');
      expect(transposeChord('G', 12)).toBe('G');
      expect(transposeChord('Am', 12)).toBe('Am');
      expect(transposeChord('F#m7', 12)).toBe('F#m7');
      expect(transposeChord('D/F#', 12)).toBe('D/F#');
    });

    it('-12 semitones (down one full octave) preserves root note and chord quality', () => {
      expect(transposeChord('C', -12)).toBe('C');
      expect(transposeChord('G', -12)).toBe('G');
      expect(transposeChord('Am', -12)).toBe('Am');
      expect(transposeChord('D/F#', -12)).toBe('D/F#');
    });

    it('+24 semitones and -24 semitones (two octaves) preserve chord quality', () => {
      expect(transposeChord('C', 24)).toBe('C');
      expect(transposeChord('C', -24)).toBe('C');
      expect(transposeChord('Em', 24)).toBe('Em');
    });

    it('+13 semitones behaves identically to +1 semitone (octave + 1)', () => {
      expect(transposeChord('C', 13)).toBe(transposeChord('C', 1));
      expect(transposeChord('G', 13)).toBe(transposeChord('G', 1));
    });

    it('-11 semitones behaves identically to +1 semitone (+12 - 11 = +1)', () => {
      expect(transposeChord('C', -11)).toBe('C#');
      expect(transposeChord('G', -11)).toBe('G#');
    });
  });

  describe('Complex & Extended Chords', () => {
    it('handles complex jazz / extended chords with suffixes', () => {
      expect(parseChord('F#m7b5')).toEqual({ root: 'F#', suffix: 'm7b5' });
      expect(transposeChord('F#m7b5', 2)).toBe('G#m7b5');

      expect(parseChord('Cmaj7')).toEqual({ root: 'C', suffix: 'maj7' });
      expect(transposeChord('Cmaj7', 2)).toBe('Dmaj7');

      expect(parseChord('Dsus4')).toEqual({ root: 'D', suffix: 'sus4' });
      expect(transposeChord('Dsus4', 2)).toBe('Esus4');
    });

    it('transposes slash chords with altered bass notes', () => {
      expect(transposeChord('C/E', 2)).toBe('D/F#');
      expect(transposeChord('Am/G', 2)).toBe('Bm/A');
      expect(transposeChord('F#/A#', 1)).toBe('G/B');
    });
  });
});
