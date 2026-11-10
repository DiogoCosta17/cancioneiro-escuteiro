import { describe, it, expect } from 'vitest';
import { parseChordPro, transposeParsedLines } from '../../lib/chordpro-parser';
import { getKeyName } from '../../lib/chords';

describe('Tier 3: Cross-Feature Combinations — Transposition & Notation Switching', () => {
  const songSnippet = `
{Refrão}
[C]Canta com [G]alegria
[Am]Deus é o nosso [F]guia
  `.trim();

  it('transposes from C to D and verifies both alphabetic and syllabic representations', () => {
    const parsed = parseChordPro(songSnippet);

    // 1. Transpose +2 semitones in alphabetic notation (C -> D, G -> A, Am -> Bm, F -> G)
    const transposedAlpha = transposeParsedLines(parsed, 2, false, 'alfabetica');
    const chordsAlpha = transposedAlpha
      .flatMap((l) => l.tokens)
      .filter((t) => t.chord)
      .map((t) => t.chord);
    expect(chordsAlpha).toEqual(['D', 'A', 'Bm', 'G']);

    // 2. Transpose +2 semitones in syllabic notation (D -> Ré, A -> Lá, Bm -> Sim, G -> Sol)
    const transposedSilabica = transposeParsedLines(parsed, 2, false, 'silabica');
    const chordsSilabica = transposedSilabica
      .flatMap((l) => l.tokens)
      .filter((t) => t.chord)
      .map((t) => t.chord);
    expect(chordsSilabica).toEqual(['Ré', 'Lá', 'Sim', 'Sol']);

    // 3. Verify key name output in both notations
    expect(getKeyName('C', 2, false, 'alfabetica')).toBe('D');
    expect(getKeyName('C', 2, false, 'silabica')).toBe('Ré');
  });

  it('cycles from alphabetic -> syllabic -> ocultar -> alphabetic cleanly', () => {
    const parsed = parseChordPro(songSnippet);

    // A. Alphabetic at +3 semitones (C -> D# / Eb)
    const stepA = transposeParsedLines(parsed, 3, true, 'alfabetica');
    const chordsA = stepA.flatMap((l) => l.tokens).filter((t) => t.chord).map((t) => t.chord);
    expect(chordsA).toEqual(['Eb', 'Bb', 'Cm', 'Ab']);

    // B. Syllabic at +3 semitones (Eb -> Mib, Bb -> Sib, Cm -> Dóm, Ab -> Láb)
    const stepB = transposeParsedLines(parsed, 3, true, 'silabica');
    const chordsB = stepB.flatMap((l) => l.tokens).filter((t) => t.chord).map((t) => t.chord);
    expect(chordsB).toEqual(['Mib', 'Sib', 'Dóm', 'Láb']);

    // C. Ocultar (all chords null, lyrics completely intact)
    const stepC = transposeParsedLines(parsed, 3, true, 'ocultar');
    const chordsC = stepC.flatMap((l) => l.tokens).filter((t) => t.chord);
    expect(chordsC).toEqual([]);
    const lyricsC = stepC.flatMap((l) => l.tokens).map((t) => t.text).join('');
    expect(lyricsC).toContain('Canta com alegria');
    expect(lyricsC).toContain('Deus é o nosso guia');

    // D. Return to alphabetic at original key (0 semitones)
    const stepD = transposeParsedLines(parsed, 0, false, 'alfabetica');
    const chordsD = stepD.flatMap((l) => l.tokens).filter((t) => t.chord).map((t) => t.chord);
    expect(chordsD).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('handles negative transpositions with slash chords across notation changes', () => {
    const slashSnippet = '[D/F#]Caminho da [A/C#]vida';
    const parsed = parseChordPro(slashSnippet);

    // Transpose down -2 semitones: D/F# -> C/E, A/C# -> G/B
    const down2Alpha = transposeParsedLines(parsed, -2, false, 'alfabetica');
    const chordsAlpha = down2Alpha.flatMap((l) => l.tokens).filter((t) => t.chord).map((t) => t.chord);
    expect(chordsAlpha).toEqual(['C/E', 'G/B']);

    // Same in syllabic: C/E -> Dó/Mi, G/B -> Sol/Si
    const down2Silabica = transposeParsedLines(parsed, -2, false, 'silabica');
    const chordsSilabica = down2Silabica.flatMap((l) => l.tokens).filter((t) => t.chord).map((t) => t.chord);
    expect(chordsSilabica).toEqual(['Dó/Mi', 'Sol/Si']);
  });
});
