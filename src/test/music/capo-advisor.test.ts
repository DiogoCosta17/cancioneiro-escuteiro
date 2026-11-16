import { describe, it, expect } from 'vitest';
import { getCapoSuggestion, isBarreChord, isEasyOpenChord } from '../../lib/capo-advisor';

describe('Sugestão de capo', () => {
  it('distingue acordes com pestana de acordes abertos fáceis', () => {
    expect(isBarreChord('F#m')).toBe(true);
    expect(isBarreChord('Bm')).toBe(true);
    expect(isBarreChord('Eb')).toBe(true);
    expect(isEasyOpenChord('G')).toBe(true);
    expect(isEasyOpenChord('Em')).toBe(true);
    expect(isBarreChord('C')).toBe(false);
  });

  it('sugere capo 2 (desenhos de G/Em/C/D) para uma música em A com F#m e Bm', () => {
    const suggestion = getCapoSuggestion(['A', 'E', 'F#m', 'D', 'Bm'], 'A');
    expect(suggestion).not.toBeNull();
    expect(suggestion?.capoFret).toBe(2);
    expect(suggestion?.shapesSemitones).toBe(-2);
    expect(suggestion?.targetKeyShapes).toBe('G');
    expect(suggestion?.barreCountAfter).toBe(0);
  });

  it('não sugere nada quando a música já só tem acordes abertos', () => {
    expect(getCapoSuggestion(['G', 'Em', 'C', 'D'], 'G')).toBeNull();
  });

  it('prefere capo 2 (desenhos de Am) a capo 7 numa música em Si menor escrita em solfejo', () => {
    const suggestion = getCapoSuggestion(
      ['Sim7', 'Sim', 'Ré', 'Rémaj7', 'Lásus4', 'Lá#dim7', 'Dó9', 'Lá', 'Lám', 'Ré7'],
      'Sim'
    );
    expect(suggestion).not.toBeNull();
    expect(suggestion?.capoFret).toBe(2);
    expect(suggestion?.targetKeyShapes).toBe('Am');
  });
});
