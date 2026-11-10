import { describe, it, expect } from 'vitest';
import { parseChord, extractUniqueChords } from '../../lib/chords';
import { isSectionDirective, cleanAndAlignChordPro, parseChordPro } from '../../lib/chordpro-parser';

describe('Tier 2: Portuguese Section Directives & Word Collisions', () => {
  describe('Standard ChordPro Section Directives with Curly Braces', () => {
    it('accurately identifies curly brace directives without chord confusion', () => {
      expect(isSectionDirective('{Refrão}')).toBe('Refrão');
      expect(isSectionDirective('{Coro}')).toBe('Coro');
      expect(isSectionDirective('{Intro}')).toBe('Intro');
      expect(isSectionDirective('{Estrofe 1}')).toBe('Estrofe 1');
      expect(isSectionDirective('{Ponte}')).toBe('Ponte');
      expect(isSectionDirective('{Final}')).toBe('Final');
    });

    it('cleanAndAlignChordPro preserves section directives completely untouched', () => {
      const content = '{Refrão}\n[C]Cantai ao [G]Senhor\n{Intro}';
      const cleaned = cleanAndAlignChordPro(content);
      expect(cleaned).toContain('{Refrão}');
      expect(cleaned).toContain('{Intro}');
    });

    it('parseChordPro treats section directives as headers and not chord lines', () => {
      const content = '{Refrão}\n[C]Aleluia';
      const parsed = parseChordPro(content);
      expect(parsed[0].sectionHeader).toBe('Refrão');
      expect(parsed[0].tokens).toEqual([]);
    });
  });

  describe('Section Directives in Square Brackets vs Real Chords', () => {
    it('accurately identifies bracketed section directives (Feature 16)', () => {
      expect(isSectionDirective('[Refrão]')).toBe('Refrão');
      expect(isSectionDirective('[Intro]')).toBe('Intro');
      expect(isSectionDirective('[Estrofe 1]')).toBe('Estrofe 1');
      expect(isSectionDirective('[Ponte]')).toBe('Ponte');
      expect(isSectionDirective('[Coda]')).toBe('Coda');
      expect(isSectionDirective('[Coro]')).toBe('Coro');
      expect(isSectionDirective('[Final]')).toBe('Final');
      expect(isSectionDirective('[Solo]')).toBe('Solo');

      // Normal chords must not be treated as section directives
      expect(isSectionDirective('[C]')).toBeNull();
      expect(isSectionDirective('[Am]')).toBeNull();

      // Bracketed section in parseChordPro
      const content = '[Refrão]\n[C]Aleluia';
      const parsed = parseChordPro(content);
      expect(parsed[0].sectionHeader).toBe('Refrão');
      expect(parsed[0].tokens).toEqual([]);
    });

    it('distinguishes legitimate musical chords from Portuguese word collisions (Feature 15)', () => {
      // Valid chords
      expect(parseChord('C')).not.toBeNull();
      expect(parseChord('D')).not.toBeNull();
      expect(parseChord('Ré')).not.toBeNull();
      expect(parseChord('Sol')).not.toBeNull();
      expect(parseChord('Am')).not.toBeNull();

      // Portuguese words that collide with chord roots must NOT be recognized as chords
      expect(parseChord('Refrão')).toBeNull();
      expect(parseChord('Coro')).toBeNull();
      expect(parseChord('Amor')).toBeNull();
      expect(parseChord('Final')).toBeNull();
      expect(parseChord('Entrada')).toBeNull();
      expect(parseChord('Salmo')).toBeNull();
    });

    it('verifies non-chord repetition markers ([2x], [bis], [Solo]) are eliminated (Feature 18)', () => {
      // Non-chord repetition markers and words are not chords
      expect(parseChord('2x')).toBeNull();
      expect(parseChord('3x')).toBeNull();
      expect(parseChord('bis')).toBeNull();
      expect(parseChord('Solo')).toBeNull();

      // extractUniqueChords eliminates non-chord tokens
      const content = '[C] Palavra [2x] outra [bis] palavra [Solo] [3x] [Am] final [G] [Refrão]';
      const unique = extractUniqueChords(content);
      expect(unique).toEqual(['C', 'Am', 'G']);
    });
  });
});
