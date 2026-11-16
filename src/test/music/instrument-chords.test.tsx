import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  UKULELE_CHORDS,
  CAVAQUINHO_CHORDS,
  INSTRUMENTS,
  getInstrumentChordDefinition,
} from '../../lib/instrument-chords';
import { getChordDefinition, GUITAR_CHORDS } from '../../lib/guitar-chords';
import { playInstrumentChord, playGuitarChord, midiToFrequency } from '../../lib/audio-synth';
import { useInstrument, INSTRUMENT_STORAGE_KEY, setStoredInstrument } from '../../hooks/useInstrument';
import { InstrumentToggle } from '../../components/songs/InstrumentToggle';
import { ChordDiagram } from '../../components/songs/ChordDiagram';

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

// Intervalos (em semitons a partir da fundamental): [notas do acorde, notas obrigatórias no desenho]
const QUALITIES: Record<string, { tones: number[]; required: number[]; third: number | null }> = {
  '': { tones: [0, 4, 7], required: [0, 4], third: 4 },
  m: { tones: [0, 3, 7], required: [0, 3], third: 3 },
  '7': { tones: [0, 4, 7, 10], required: [0, 4, 10], third: 4 },
  m7: { tones: [0, 3, 7, 10], required: [0, 3, 10], third: 3 },
  maj7: { tones: [0, 4, 7, 11], required: [0, 4, 11], third: 4 },
  '6': { tones: [0, 4, 7, 9], required: [0, 4, 9], third: 4 },
  m6: { tones: [0, 3, 7, 9], required: [0, 3, 9], third: 3 },
  '9': { tones: [0, 4, 7, 10, 2], required: [0, 4, 10, 2], third: 4 },
  add9: { tones: [0, 4, 7, 2], required: [0, 4, 2], third: 4 },
  sus2: { tones: [0, 2, 7], required: [0, 2, 7], third: null },
  sus4: { tones: [0, 5, 7], required: [0, 5, 7], third: null },
  '7sus4': { tones: [0, 5, 7, 10], required: [0, 5, 10], third: null },
  dim: { tones: [0, 3, 6], required: [0, 3, 6], third: 3 },
  dim7: { tones: [0, 3, 6, 9], required: [0, 3, 6, 9], third: 3 },
  m7b5: { tones: [0, 3, 6, 10], required: [0, 3, 6, 10], third: 3 },
  aug: { tones: [0, 4, 8], required: [0, 4, 8], third: 4 },
};

function sounded(frets: number[], tuningMidi: number[], rootPc: number): number[] {
  return frets
    .map((fret, i) => (fret < 0 ? null : (((tuningMidi[i] + fret - rootPc) % 12) + 12) % 12))
    .filter((pc): pc is number => pc !== null);
}

describe.each([
  ['ukulele', UKULELE_CHORDS],
  ['cavaquinho', CAVAQUINHO_CHORDS],
] as const)('Tabela de acordes de %s', (instrument, table) => {
  const tuning = INSTRUMENTS[instrument].tuningMidi;
  const entries = Object.entries(table);

  it('cobre as 12 fundamentais nas qualidades principais (incluindo bemóis)', () => {
    const roots = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
    for (const root of roots) {
      for (const q of ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug', '6']) {
        expect(table[`${root}${q}`], `${instrument}: falta ${root}${q}`).toBeDefined();
      }
    }
  });

  it.each(entries)('%s produz as notas certas na afinação do instrumento', (name, def) => {
    const match = name.match(/^([A-G][#b]?)(.*)$/);
    expect(match).not.toBeNull();
    const rootPc = PITCH_CLASS[match![1]];
    const quality = QUALITIES[match![2]];
    expect(quality, `qualidade desconhecida em ${name}`).toBeDefined();

    expect(def.frets).toHaveLength(tuning.length);
    const pcs = sounded(def.frets, tuning, rootPc);

    // Todas as notas soadas pertencem ao acorde
    for (const pc of pcs) {
      expect(quality.tones, `${name}: nota fora do acorde (${pc})`).toContain(pc);
    }
    // Inclui a fundamental ou a 3ª, e as notas características
    expect(pcs.includes(0) || (quality.third !== null && pcs.includes(quality.third))).toBe(true);
    for (const req of quality.required) {
      expect(pcs, `${name}: falta o intervalo ${req}`).toContain(req);
    }

    // Tocável e representável num diagrama de 4 casas
    const fretted = def.frets.filter((f) => f > 0);
    if (fretted.length) {
      const base = def.baseFret ?? 1;
      expect(Math.max(...fretted) - base).toBeLessThan(4);
      expect(Math.min(...fretted)).toBeGreaterThanOrEqual(base);
    }
    const fingersUsed = (def.fingers ?? []).filter((f) => f > 0);
    for (const f of fingersUsed) {
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(4);
    }
  });
});

describe('getInstrumentChordDefinition', () => {
  it('mantém a guitarra exatamente como antes', () => {
    expect(getInstrumentChordDefinition('Sol', 'guitarra')).toEqual(getChordDefinition('Sol'));
    expect(getInstrumentChordDefinition('D/F#', 'guitarra')?.frets).toEqual(GUITAR_CHORDS['D/F#'].frets);
    expect(getInstrumentChordDefinition('C')?.frets).toHaveLength(6);
  });

  it('usa desenhos de 4 cordas para ukulele e cavaquinho', () => {
    expect(getInstrumentChordDefinition('C', 'ukulele')?.frets).toEqual([0, 0, 0, 3]);
    expect(getInstrumentChordDefinition('Am', 'ukulele')?.frets).toEqual([2, 0, 0, 0]);
    expect(getInstrumentChordDefinition('G', 'cavaquinho')?.frets).toEqual([0, 0, 0, 0]);
    expect(getInstrumentChordDefinition('D', 'cavaquinho')?.frets).toEqual([0, 2, 3, 4]);
  });

  it('aceita solfejo português, menores com hífen e enarmónicos', () => {
    expect(getInstrumentChordDefinition('Sol', 'ukulele')?.frets).toEqual(UKULELE_CHORDS['G'].frets);
    expect(getInstrumentChordDefinition('Ré-', 'ukulele')?.frets).toEqual(UKULELE_CHORDS['Dm'].frets);
    expect(getInstrumentChordDefinition('Dó7M', 'cavaquinho')?.frets).toEqual(CAVAQUINHO_CHORDS['Cmaj7'].frets);
    expect(getInstrumentChordDefinition('Sib', 'ukulele')?.frets).toEqual(UKULELE_CHORDS['A#'].frets);
    expect(getInstrumentChordDefinition('Db', 'cavaquinho')?.frets).toEqual(CAVAQUINHO_CHORDS['C#'].frets);
  });

  it('mostra o acorde principal nos slash chords e aproxima extensões', () => {
    expect(getInstrumentChordDefinition('Sol/Si', 'ukulele')?.frets).toEqual(UKULELE_CHORDS['G'].frets);
    expect(getInstrumentChordDefinition('D/F#', 'cavaquinho')?.frets).toEqual(CAVAQUINHO_CHORDS['D'].frets);
    expect(getInstrumentChordDefinition('Am9', 'ukulele')?.frets).toEqual(UKULELE_CHORDS['Am'].frets);
    expect(getInstrumentChordDefinition('C2', 'ukulele')?.frets).toEqual(UKULELE_CHORDS['Csus2'].frets);
    expect(getInstrumentChordDefinition('Bº', 'ukulele')?.frets).toEqual(UKULELE_CHORDS['Bdim'].frets);
    expect(getInstrumentChordDefinition('Lá#dim7', 'cavaquinho')?.frets).toEqual(CAVAQUINHO_CHORDS['A#dim7'].frets);
    expect(getInstrumentChordDefinition('Bm7(b5)', 'ukulele')?.frets).toEqual(UKULELE_CHORDS['Bm7b5'].frets);
    expect(getInstrumentChordDefinition('C+', 'cavaquinho')?.frets).toEqual(CAVAQUINHO_CHORDS['Caug'].frets);
    expect(getInstrumentChordDefinition('A#9', 'cavaquinho')).not.toBeNull();
    expect(getInstrumentChordDefinition('XYZ', 'ukulele')).toBeNull();
  });
});

describe('Reprodução de acordes por instrumento (audio-synth.ts)', () => {
  it('calcula frequências a partir de notas MIDI', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 5);
    expect(midiToFrequency(67)).toBeCloseTo(392, 0); // Sol4 (4ª corda do ukulele)
  });

  it('não falha sem AudioContext e valida o número de cordas', () => {
    expect(() => playInstrumentChord([0, 0, 0, 3], INSTRUMENTS.ukulele.tuningMidi)).not.toThrow();
    expect(playInstrumentChord([0, 0, 0], INSTRUMENTS.ukulele.tuningMidi)).toBe(false);
    expect(playGuitarChord([0, 0, 0, 3], 1)).toBe(false);
  });
});

function InstrumentProbe() {
  const { instrument } = useInstrument();
  return <span data-testid="probe">{instrument}</span>;
}

describe('useInstrument & InstrumentToggle', () => {
  it('usa a guitarra por omissão e ignora valores inválidos guardados', () => {
    localStorage.setItem(INSTRUMENT_STORAGE_KEY, 'bandolim');
    render(<InstrumentProbe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('guitarra');
  });

  it('sincroniza todos os componentes e guarda a escolha no localStorage', () => {
    render(
      <>
        <InstrumentToggle />
        <InstrumentProbe />
        <ChordDiagram chord="C" notation="alfabetica" />
      </>
    );
    expect(document.querySelector('svg[data-strings]')?.getAttribute('data-strings')).toBe('6');

    fireEvent.click(screen.getByRole('button', { name: 'Ukulele' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('ukulele');
    expect(localStorage.getItem(INSTRUMENT_STORAGE_KEY)).toBe('ukulele');
    expect(screen.getByRole('button', { name: 'Ukulele' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('svg[data-strings]')?.getAttribute('data-strings')).toBe('4');

    act(() => setStoredInstrument('cavaquinho'));
    expect(screen.getByTestId('probe')).toHaveTextContent('cavaquinho');
    expect(screen.getByRole('button', { name: 'Cavaquinho' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('permite forçar o instrumento num diagrama', () => {
    render(<ChordDiagram chord="Lá" notation="silabica" instrument="cavaquinho" />);
    expect(screen.getByText('Lá')).toBeInTheDocument();
    expect(document.querySelector('svg[data-strings]')?.getAttribute('data-strings')).toBe('4');
  });
});

describe('Guitarra: diminutos, meio-diminutos e aumentados', () => {
  const tuning = INSTRUMENTS.guitarra.tuningMidi;
  const roots = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  const cases = roots.flatMap(root => ['dim', 'dim7', 'm7b5', 'aug'].map(q => [`${root}${q}`, root, q] as const));

  it.each(cases)('%s tem desenho próprio com as notas certas', (name, root, q) => {
    const def = GUITAR_CHORDS[name];
    expect(def, `falta ${name}`).toBeDefined();
    expect(def.frets).toHaveLength(6);
    expect(Math.min(...def.frets.filter(f => f >= 0))).toBeGreaterThanOrEqual(0);
    // Desenho tocável: no máximo 4 casas entre a mais baixa e a mais alta pisadas
    const pressed = def.frets.filter(f => f > 0);
    expect(Math.max(...pressed) - Math.min(...pressed)).toBeLessThanOrEqual(3);

    const pcs = sounded(def.frets, tuning, PITCH_CLASS[root]);
    for (const pc of pcs) expect(QUALITIES[q].tones, `${name}: nota fora do acorde (${pc})`).toContain(pc);
    for (const req of QUALITIES[q].required) expect(pcs, `${name}: falta o intervalo ${req}`).toContain(req);
  });

  it('nomes alternativos usam o desenho certo e nunca o acorde maior', () => {
    expect(getChordDefinition('Bdim')?.frets).not.toEqual(GUITAR_CHORDS['B'].frets);
    expect(getChordDefinition('B°')?.frets).toEqual(GUITAR_CHORDS['Bdim'].frets);
    expect(getChordDefinition('Sol#º')?.frets).toEqual(GUITAR_CHORDS['G#dim'].frets);
    expect(getChordDefinition('Caug')?.frets).toEqual(GUITAR_CHORDS['Caug'].frets);
    expect(getChordDefinition('C+')?.frets).toEqual(GUITAR_CHORDS['Caug'].frets);
    expect(getChordDefinition('Bm7(b5)')?.frets).toEqual(GUITAR_CHORDS['Bm7b5'].frets);
    expect(getChordDefinition('Bø')?.frets).toEqual(GUITAR_CHORDS['Bm7b5'].frets);
  });
});

describe('Guitarra: fundamentais enarmónicas', () => {
  it('Gb7 usa o desenho de F#7 (e não o de Gb maior)', () => {
    expect(GUITAR_CHORDS['F#7']).toBeDefined();
    expect(getChordDefinition('Gb7')?.frets).toEqual(GUITAR_CHORDS['F#7'].frets);
    expect(getChordDefinition('Gb7')?.name).toBe('Gb7');
  });
});
