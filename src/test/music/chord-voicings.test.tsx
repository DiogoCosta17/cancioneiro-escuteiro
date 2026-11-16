import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  CHORD_QUALITIES,
  chordVoicingKey,
  getChordVoicings,
  parseVoicingChord,
  voicingMatchesChord,
  voicingSignature,
} from '../../lib/chord-voicings';
import { GUITAR_CHORDS } from '../../lib/guitar-chords';
import {
  CAVAQUINHO_CHORDS,
  INSTRUMENTS,
  INSTRUMENT_IDS,
  UKULELE_CHORDS,
  getInstrumentChordDefinition,
  type Instrument,
} from '../../lib/instrument-chords';
import {
  CHORD_VOICINGS_STORAGE_KEY,
  getVoicingChoices,
  resetVoicingChoicesMemoryForTests,
  sanitizeVoicingChoices,
  setVoicingChoice,
} from '../../hooks/useChordVoicing';
import { setStoredInstrument } from '../../hooks/useInstrument';
import { ChordDiagram } from '../../components/songs/ChordDiagram';

const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
const QUALITIES = Object.keys(CHORD_QUALITIES);

beforeEach(() => {
  localStorage.clear();
  resetVoicingChoicesMemoryForTests();
  setStoredInstrument('guitarra');
});

describe('Posições alternativas: todas as posições propostas tocam o acorde certo', () => {
  describe.each(INSTRUMENT_IDS)('%s', (instrument) => {
    const tuning = INSTRUMENTS[instrument].tuningMidi;

    it.each(QUALITIES)('qualidade "%s" nas 17 fundamentais', (quality) => {
      for (const root of ROOTS) {
        const name = `${root}${quality}`;
        const parsed = parseVoicingChord(name)!;
        expect(parsed, name).not.toBeNull();
        const voicings = getChordVoicings(name, instrument);
        const curated = getInstrumentChordDefinition(name, instrument);

        expect(voicings.length, `${instrument} ${name}: sem posições`).toBeGreaterThan(0);
        expect(voicings.length).toBeLessThanOrEqual(8);
        const signatures = voicings.map((v) => voicingSignature(v.frets));
        expect(new Set(signatures).size, `${instrument} ${name}: posições repetidas`).toBe(signatures.length);

        for (const v of voicings) {
          const isCurated = curated && voicingSignature(curated.frets) === voicingSignature(v.frets);
          expect(v.frets).toHaveLength(tuning.length);
          // A tabela feita à mão é validada noutros testes; as calculadas validam-se aqui
          if (!isCurated) {
            expect(voicingMatchesChord(v.frets, tuning, parsed), `${instrument} ${name}: ${v.frets} não é ${name}`).toBe(true);
          }
          const fretted = v.frets.filter((f) => f > 0);
          if (fretted.length) {
            const base = v.baseFret ?? 1;
            expect(Math.max(...fretted) - Math.min(...fretted), `${instrument} ${name}: ${v.frets} abre demasiado a mão`).toBeLessThanOrEqual(3);
            expect(Math.max(...fretted) - base, `${instrument} ${name}: ${v.frets} não cabe no diagrama`).toBeLessThan(4);
            expect(Math.min(...fretted)).toBeGreaterThanOrEqual(base);
          }
          for (const finger of v.fingers ?? []) {
            expect(finger).toBeGreaterThanOrEqual(0);
            expect(finger).toBeLessThanOrEqual(4);
          }
        }
      }
    });
  });
});

describe('Posições alternativas: a posição habitual mantém-se', () => {
  const tables: [Instrument, Record<string, { frets: number[] }>][] = [
    ['guitarra', GUITAR_CHORDS],
    ['ukulele', UKULELE_CHORDS],
    ['cavaquinho', CAVAQUINHO_CHORDS],
  ];

  it.each(tables)('%s: a 1.ª posição é a da tabela sempre que esta toca o acorde certo', (instrument, table) => {
    const tuning = INSTRUMENTS[instrument].tuningMidi;
    for (const name of Object.keys(table)) {
      const parsed = parseVoicingChord(name);
      const curated = getInstrumentChordDefinition(name, instrument)!;
      if (parsed && !voicingMatchesChord(curated.frets, tuning, parsed)) continue;
      expect(getChordVoicings(name, instrument)[0].frets, `${instrument} ${name}`).toEqual(curated.frets);
    }
  });

  it('acordes que a app não sabe decompor continuam com a posição de sempre', () => {
    expect(getChordVoicings('Dmaj7sus2', 'guitarra')[0].frets).toEqual(GUITAR_CHORDS['Dmaj7sus2'].frets);
    expect(getChordVoicings('XYZ99', 'guitarra')).toEqual([]);
  });

  it('quando a posição habitual era outro acorde, passa a mostrar o acorde certo', () => {
    const tuning = INSTRUMENTS.guitarra.tuningMidi;
    // A tabela não tem Ebmaj7 e mostrava Eb7; Lám/Sol mostrava Lám (baixo errado)
    const ebmaj7 = getChordVoicings('Ebmaj7', 'guitarra');
    expect(voicingMatchesChord(ebmaj7[0].frets, tuning, parseVoicingChord('Ebmaj7')!)).toBe(true);
    expect(ebmaj7.some((v) => voicingSignature(v.frets) === voicingSignature(GUITAR_CHORDS['Eb7'].frets))).toBe(false);
    expect(getChordVoicings('Lám/Sol', 'guitarra')[0].frets).toEqual([3, 0, 2, 0, 1, 0]);
  });

  it('inclui as posições alternativas mais conhecidas', () => {
    const has = (chord: string, frets: number[]) =>
      getChordVoicings(chord, 'guitarra').some((v) => voicingSignature(v.frets) === voicingSignature(frets));
    expect(has('F', [-1, -1, 3, 2, 1, 1])).toBe(true); // Fá sem pestana completa
    expect(has('C', [-1, 3, 5, 5, 5, 3])).toBe(true); // Dó com pestana na 3.ª
    expect(has('G', [3, 5, 5, 4, 3, 3])).toBe(true); // Sol com pestana na 3.ª
    expect(has('D', [-1, 5, 7, 7, 7, 5])).toBe(true); // Ré com pestana na 5.ª
    expect(has('Am', [5, 7, 7, 5, 5, 5])).toBe(true); // Lá menor com pestana na 5.ª
  });
});

describe('chordVoicingKey', () => {
  it('a mesma escolha vale para o mesmo acorde em qualquer notação ou grafia', () => {
    expect(chordVoicingKey('Sol')).toBe(chordVoicingKey('G'));
    expect(chordVoicingKey('Dó#')).toBe(chordVoicingKey('Db'));
    expect(chordVoicingKey('Lá-')).toBe(chordVoicingKey('Am'));
    expect(chordVoicingKey('Ré/Fá#')).toBe(chordVoicingKey('D/F#'));
    expect(chordVoicingKey('G')).not.toBe(chordVoicingKey('Gm'));
    expect(chordVoicingKey('D/F#')).not.toBe(chordVoicingKey('D'));
  });
});

describe('Escolha guardada no dispositivo', () => {
  it('guarda, apaga (volta à habitual) e separa por instrumento', () => {
    setVoicingChoice('guitarra', '5', '-1,-1,3,2,1,1');
    setVoicingChoice('ukulele', '5', '2,0,1,0');
    expect(getVoicingChoices()).toEqual({ guitarra: { '5': '-1,-1,3,2,1,1' }, ukulele: { '5': '2,0,1,0' } });
    setVoicingChoice('guitarra', '5', null);
    expect(getVoicingChoices().guitarra).toEqual({});
    expect(getVoicingChoices().ukulele).toEqual({ '5': '2,0,1,0' });
  });

  it('ignora dados corrompidos ou inválidos', () => {
    localStorage.setItem(CHORD_VOICINGS_STORAGE_KEY, '{lixo');
    expect(getVoicingChoices()).toEqual({});
    expect(
      sanitizeVoicingChoices({ guitarra: { ok: '0,2,2,1,0,0', mau: 'x32010', num: 5 }, bandolim: { a: '0,0,0,0' }, ukulele: [] })
    ).toEqual({ guitarra: { ok: '0,2,2,1,0,0' } });
    expect(sanitizeVoicingChoices(null)).toEqual({});
  });
});

describe('ChordDiagram: mudar de posição', () => {
  const frets = () => Array.from(document.querySelectorAll('svg[data-frets]')).map((el) => el.getAttribute('data-frets'));

  it('percorre as posições, sincroniza todos os diagramas do mesmo acorde e não toca o som', () => {
    const total = getChordVoicings('F', 'guitarra').length;
    render(
      <>
        <ChordDiagram chord="F" notation="alfabetica" />
        <ChordDiagram chord="Fá" notation="silabica" />
      </>
    );
    expect(screen.getAllByText(`1/${total}`)).toHaveLength(2);
    expect(frets()).toEqual(['1,3,3,2,1,1', '1,3,3,2,1,1']);

    fireEvent.click(screen.getByRole('button', { name: 'Posição seguinte de F' }));
    expect(screen.getAllByText(`2/${total}`)).toHaveLength(2);
    expect(frets()).toEqual(['-1,-1,3,2,1,1', '-1,-1,3,2,1,1']);
    expect(JSON.parse(localStorage.getItem(CHORD_VOICINGS_STORAGE_KEY)!).guitarra).toEqual({
      [chordVoicingKey('F')]: '-1,-1,3,2,1,1',
    });
    // Mudar de posição não toca o acorde (o cartão não fica destacado)
    expect(document.querySelector('.ring-2')).toBeNull();

    // Voltar à 1.ª apaga a escolha guardada
    fireEvent.click(screen.getByRole('button', { name: 'Posição anterior de Fá' }));
    expect(screen.getAllByText(`1/${total}`)).toHaveLength(2);
    expect(getVoicingChoices().guitarra).toEqual({});

    // Para trás a partir da 1.ª vai para a última
    fireEvent.click(screen.getByRole('button', { name: 'Posição anterior de F' }));
    expect(screen.getAllByText(`${total}/${total}`)).toHaveLength(2);
  });

  it('a escolha é por instrumento e uma escolha que já não existe volta à habitual', () => {
    setVoicingChoice('guitarra', chordVoicingKey('C'), '-1,3,5,5,5,3');
    setVoicingChoice('ukulele', chordVoicingKey('G'), '9,9,9,9');
    render(
      <>
        <ChordDiagram chord="C" notation="alfabetica" />
        <ChordDiagram chord="G" notation="alfabetica" />
      </>
    );
    expect(frets()[0]).toBe('-1,3,5,5,5,3');
    expect(frets()[1]).toBe(voicingSignature(GUITAR_CHORDS['G'].frets));

    act(() => setStoredInstrument('ukulele'));
    expect(frets()[0]).toBe(voicingSignature(UKULELE_CHORDS['C'].frets));
    expect(frets()[1]).toBe(voicingSignature(UKULELE_CHORDS['G'].frets)); // '9,9,9,9' não é uma posição de Sol
  });

  it('acordes sem diagrama continuam a mostrar "Diagrama indisponível" sem botões de posição', () => {
    render(<ChordDiagram chord="XYZ99" notation="alfabetica" />);
    expect(screen.getByText('Diagrama indisponível')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Posição seguinte/ })).toBeNull();
  });
});
