import { ChordDefinition, GUITAR_CHORDS, findChordInTable, getChordDefinition } from './guitar-chords';

/**
 * Instrumentos suportados nos diagramas e na reprodução de acordes.
 * - Guitarra: afinação padrão E2 A2 D3 G3 B3 E4 (6 cordas)
 * - Ukulele: afinação padrão reentrante G4 C4 E4 A4 (Sol-Dó-Mi-Lá, 4 cordas)
 * - Cavaquinho: afinação padrão D4 G4 B4 D5 (Ré-Sol-Si-Ré, 4 cordas — a mais comum em Portugal e no Brasil)
 */
export type Instrument = 'guitarra' | 'ukulele' | 'cavaquinho';

export const DEFAULT_INSTRUMENT: Instrument = 'guitarra';

export interface InstrumentInfo {
  id: Instrument;
  label: string;
  shortLabel: string;
  /** Notas MIDI das cordas soltas, pela ordem do diagrama (esquerda → direita) */
  tuningMidi: number[];
  /** Nomes das cordas soltas (solfejo), pela ordem do diagrama */
  stringNames: string[];
}

export const INSTRUMENTS: Record<Instrument, InstrumentInfo> = {
  guitarra: {
    id: 'guitarra',
    label: 'Guitarra',
    shortLabel: 'Guit.',
    tuningMidi: [40, 45, 50, 55, 59, 64],
    stringNames: ['Mi', 'Lá', 'Ré', 'Sol', 'Si', 'Mi'],
  },
  ukulele: {
    id: 'ukulele',
    label: 'Ukulele',
    shortLabel: 'Uke',
    tuningMidi: [67, 60, 64, 69],
    stringNames: ['Sol', 'Dó', 'Mi', 'Lá'],
  },
  cavaquinho: {
    id: 'cavaquinho',
    label: 'Cavaquinho',
    shortLabel: 'Cavaq.',
    tuningMidi: [62, 67, 71, 74],
    stringNames: ['Ré', 'Sol', 'Si', 'Ré'],
  },
};

export const INSTRUMENT_IDS: Instrument[] = ['guitarra', 'ukulele', 'cavaquinho'];

export function isInstrument(value: unknown): value is Instrument {
  return typeof value === 'string' && (INSTRUMENT_IDS as string[]).includes(value);
}

/**
 * Dedilhações compactas para instrumentos de 4 cordas: um dígito por corda, pela ordem do diagrama
 * (ukulele: Sol Dó Mi Lá; cavaquinho: Ré Sol Si Ré). Todas as cordas são tocadas (sem abafadas).
 * Cada desenho foi validado pelo teste `instrument-chords.test.ts`: as notas soadas pertencem ao acorde
 * e incluem a fundamental e as notas características (3ª, 7ª, 9ª...).
 */
const UKULELE_SHAPES: Record<string, string> = {
  // Maiores
  'C': '0003', 'C#': '1114', 'D': '2220', 'D#': '0331', 'E': '1402', 'F': '2010', 'F#': '3121', 'G': '0232', 'G#': '5343', 'A': '2100', 'A#': '3211', 'B': '4322',
  // Menores
  'Cm': '0333', 'C#m': '1104', 'Dm': '2210', 'D#m': '3321', 'Em': '0432', 'Fm': '1013', 'F#m': '2120', 'Gm': '0231', 'G#m': '4342', 'Am': '2000', 'A#m': '3111', 'Bm': '4222',
  // 7
  'C7': '0001', 'C#7': '1112', 'D7': '2223', 'D#7': '3334', 'E7': '1202', 'F7': '2313', 'F#7': '3424', 'G7': '0212', 'G#7': '1323', 'A7': '0100', 'A#7': '1211', 'B7': '2322',
  // m7
  'Cm7': '3333', 'C#m7': '1102', 'Dm7': '2213', 'D#m7': '3324', 'Em7': '0202', 'Fm7': '1313', 'F#m7': '2424', 'Gm7': '0211', 'G#m7': '1322', 'Am7': '0000', 'A#m7': '1111', 'Bm7': '2222',
  // maj7
  'Cmaj7': '0002', 'C#maj7': '1113', 'Dmaj7': '2224', 'D#maj7': '3335', 'Emaj7': '1302', 'Fmaj7': '2413', 'F#maj7': '3524', 'Gmaj7': '0222', 'G#maj7': '1333', 'Amaj7': '1100', 'A#maj7': '3210', 'Bmaj7': '4321',
  // 6
  'C6': '0000', 'C#6': '1111', 'D6': '2222', 'D#6': '3333', 'E6': '1102', 'F6': '2213', 'F#6': '3324', 'G6': '0202', 'G#6': '1013', 'A6': '2120', 'A#6': '0211', 'B6': '1322',
  // m6
  'Cm6': '2333', 'C#m6': '1101', 'Dm6': '2212', 'D#m6': '3323', 'Em6': '0102', 'Fm6': '1213', 'F#m6': '2320', 'Gm6': '0201', 'G#m6': '1312', 'Am6': '2020', 'A#m6': '0111', 'Bm6': '1222',
  // 9
  'C9': '3203', 'C#9': '4314', 'D9': '5605', 'D#9': '0314', 'E9': '7647', 'F9': '0310', 'F#9': '1421', 'G9': '4530', 'G#9': '1021', 'A9': '2132', 'A#9': '3045', 'B9': '4354',
  // add9
  'Cadd9': '0203', 'C#add9': '1314', 'Dadd9': '2425', 'D#add9': '0311', 'Eadd9': '1422', 'Fadd9': '0010', 'F#add9': '1121', 'Gadd9': '0252', 'G#add9': '3043', 'Aadd9': '2102', 'A#add9': '3213', 'Badd9': '4324',
  // sus2
  'Csus2': '0233', 'C#sus2': '1344', 'Dsus2': '2200', 'D#sus2': '3311', 'Esus2': '4422', 'Fsus2': '0013', 'F#sus2': '1124', 'Gsus2': '0230', 'G#sus2': '1341', 'Asus2': '2402', 'A#sus2': '3013', 'Bsus2': '4124',
  // sus4
  'Csus4': '0013', 'C#sus4': '1124', 'Dsus4': '0230', 'D#sus4': '1341', 'Esus4': '4400', 'Fsus4': '3011', 'F#sus4': '4124', 'Gsus4': '0233', 'G#sus4': '1344', 'Asus4': '2200', 'A#sus4': '3311', 'Bsus4': '4422',
  // 7sus4
  'C7sus4': '0011', 'C#7sus4': '1122', 'D7sus4': '0233', 'D#7sus4': '3344', 'E7sus4': '2200', 'F7sus4': '3311', 'F#7sus4': '4422', 'G7sus4': '0013', 'G#7sus4': '1124', 'A7sus4': '0200', 'A#7sus4': '1311', 'B7sus4': '4400',
  // dim
  'Cdim': '5323', 'C#dim': '0404', 'Ddim': '7545', 'D#dim': '2320', 'Edim': '0401', 'Fdim': '4542', 'F#dim': '2020', 'Gdim': '0131', 'G#dim': '4242', 'Adim': '5350', 'A#dim': '3101', 'Bdim': '4212',
  // dim7
  'Cdim7': '2323', 'C#dim7': '0101', 'Ddim7': '1212', 'D#dim7': '2323', 'Edim7': '0101', 'Fdim7': '1212', 'F#dim7': '2323', 'Gdim7': '0101', 'G#dim7': '1212', 'Adim7': '2323', 'A#dim7': '0101', 'Bdim7': '1212',
  // m7b5
  'Cm7b5': '3323', 'C#m7b5': '0102', 'Dm7b5': '1213', 'D#m7b5': '2324', 'Em7b5': '0201', 'Fm7b5': '1312', 'F#m7b5': '2423', 'Gm7b5': '0111', 'G#m7b5': '1222', 'Am7b5': '2333', 'A#m7b5': '1101', 'Bm7b5': '2212',
  // aug
  'Caug': '1003', 'C#aug': '2110', 'Daug': '3221', 'D#aug': '0332', 'Eaug': '1003', 'Faug': '2110', 'F#aug': '3221', 'Gaug': '0332', 'G#aug': '1003', 'Aaug': '2110', 'A#aug': '3221', 'Baug': '0332',
};

const CAVAQUINHO_SHAPES: Record<string, string> = {
  // Maiores
  'C': '2012', 'C#': '3123', 'D': '0234', 'D#': '5345', 'E': '2102', 'F': '3213', 'F#': '4324', 'G': '0000', 'G#': '1111', 'A': '2222', 'A#': '3333', 'B': '4444',
  // Menores
  'Cm': '1011', 'C#m': '2122', 'Dm': '0233', 'D#m': '1344', 'Em': '2002', 'Fm': '3113', 'F#m': '4224', 'Gm': '5335', 'G#m': '1101', 'Am': '2212', 'A#m': '3323', 'Bm': '4434',
  // 7
  'C7': '2312', 'C#7': '3423', 'D7': '0214', 'D#7': '1021', 'E7': '0102', 'F7': '1213', 'F#7': '2324', 'G7': '0003', 'G#7': '1114', 'A7': '2225', 'A#7': '3336', 'B7': '1201',
  // m7
  'Cm7': '1311', 'C#m7': '2422', 'Dm7': '0213', 'D#m7': '1324', 'Em7': '0002', 'Fm7': '1113', 'F#m7': '2224', 'Gm7': '3335', 'G#m7': '1104', 'Am7': '5557', 'A#m7': '6668', 'Bm7': '0200',
  // maj7
  'Cmaj7': '2412', 'C#maj7': '3523', 'Dmaj7': '0224', 'D#maj7': '0031', 'Emaj7': '1102', 'Fmaj7': '3212', 'F#maj7': '3324', 'Gmaj7': '0004', 'G#maj7': '5546', 'Amaj7': '6657', 'A#maj7': '7768', 'Bmaj7': '1301',
  // 6
  'C6': '2212', 'C#6': '3323', 'D6': '0404', 'D#6': '1011', 'E6': '2122', 'F6': '0233', 'F#6': '4344', 'G6': '0002', 'G#6': '1113', 'A6': '2224', 'A#6': '0335', 'B6': '1101',
  // m6
  'Cm6': '1211', 'C#m6': '2322', 'Dm6': '0203', 'D#m6': '4544', 'Em6': '2022', 'Fm6': '0113', 'F#m6': '4244', 'Gm6': '0355', 'G#m6': '1103', 'Am6': '2214', 'A#m6': '3325', 'Bm6': '0100',
  // 9
  'C9': '0312', 'C#9': '1423', 'D9': '0554', 'D#9': '1023', 'E9': '2134', 'F9': '3245', 'F#9': '4356', 'G9': '3205', 'G#9': '6578', 'A9': '5607',
  // add9
  'Cadd9': '0012', 'C#add9': '1123', 'Dadd9': '2234', 'D#add9': '3043', 'Eadd9': '2104', 'Fadd9': '7067', 'F#add9': '6678', 'Gadd9': '0205', 'Aadd9': '7607', 'A#add9': '0310', 'Badd9': '1421',
  // sus2
  'Csus2': '0010', 'C#sus2': '1121', 'Dsus2': '0232', 'D#sus2': '3343', 'Esus2': '2404', 'Fsus2': '3013', 'F#sus2': '4124', 'Gsus2': '0235', 'G#sus2': '6346', 'Asus2': '2202', 'A#sus2': '3313', 'Bsus2': '4424',
  // sus4
  'Csus4': '3013', 'C#sus4': '4124', 'Dsus4': '0235', 'D#sus4': '6346', 'Esus4': '2202', 'Fsus4': '3313', 'F#sus4': '4424', 'Gsus4': '0010', 'G#sus4': '1121', 'Asus4': '0232', 'A#sus4': '3343', 'Bsus4': '2404',
  // 7sus4
  'C7sus4': '3313', 'C#7sus4': '4424', 'D7sus4': '0010', 'D#7sus4': '1121', 'E7sus4': '0202', 'F7sus4': '1313', 'F#7sus4': '2404', 'G7sus4': '0013', 'G#7sus4': '1124', 'A7sus4': '0235', 'A#7sus4': '3346', 'B7sus4': '2202',
  // dim
  'Cdim': '4544', 'C#dim': '2022', 'Ddim': '0133', 'D#dim': '4244', 'Edim': '5355', 'Fdim': '3103', 'F#dim': '4214', 'Gdim': '5325', 'G#dim': '0100', 'Adim': '1211', 'A#dim': '2322', 'Bdim': '0403',
  // dim7
  'Cdim7': '1214', 'C#dim7': '2325', 'Ddim7': '0103', 'D#dim7': '1214', 'Edim7': '2325', 'Fdim7': '0103', 'F#dim7': '1214', 'Gdim7': '2325', 'G#dim7': '0103', 'Adim7': '1214', 'A#dim7': '2325', 'Bdim7': '0103',
  // m7b5
  'Cm7b5': '1314', 'C#m7b5': '2425', 'Dm7b5': '0113', 'D#m7b5': '1224', 'Em7b5': '0355', 'Fm7b5': '1103', 'F#m7b5': '2214', 'Gm7b5': '3325', 'G#m7b5': '0104', 'Am7b5': '5547', 'A#m7b5': '6658', 'Bm7b5': '0203',
  // aug
  'Caug': '2112', 'C#aug': '3223', 'Daug': '0334', 'D#aug': '1001', 'Eaug': '2112', 'Faug': '3223', 'F#aug': '0334', 'Gaug': '1001', 'G#aug': '2112', 'Aaug': '3223', 'A#aug': '0334', 'Baug': '1001',
};

const SHARP_TO_FLAT: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };

/**
 * Calcula dedos, pestana e casa base de um desenho de 4 cordas (apenas indicativo para o diagrama).
 */
function buildDefinition(name: string, frets: number[]): ChordDefinition {
  const fretted = frets.filter((f) => f > 0);
  const minFret = fretted.length ? Math.min(...fretted) : 0;
  const maxFret = fretted.length ? Math.max(...fretted) : 0;
  const baseFret = maxFret <= 4 ? 1 : minFret;
  const last = frets.length - 1;

  // Pestana: a casa mais baixa repete-se em várias cordas e estende-se até à 1ª corda sem cordas soltas pelo meio
  let barre: ChordDefinition['barre'];
  if (minFret > 0 && frets[last] === minFret) {
    const fromString = frets.indexOf(minFret);
    const coversRange = frets.slice(fromString).every((f) => f >= minFret);
    if (fromString < last && coversRange) {
      barre = { fret: minFret, fromString, toString: last };
    }
  }

  const fingers = frets.map(() => 0);
  const notes = frets
    .map((fret, stringIndex) => ({ fret, stringIndex }))
    .filter(({ fret, stringIndex }) => fret > 0 && !(barre && stringIndex >= barre.fromString && fret === barre.fret))
    .sort((a, b) => a.fret - b.fret || a.stringIndex - b.stringIndex);

  if (barre) {
    for (let i = barre.fromString; i <= barre.toString; i++) {
      if (frets[i] === barre.fret) fingers[i] = 1;
    }
  }

  // Com 3+ dedos começa no indicador; com 1-2 dedos respeita "um dedo por casa" (ex: Dó = 0003 → dedo 3)
  const anchor = barre ? barre.fret : notes.length >= 3 ? (notes[0]?.fret ?? 1) : baseFret;
  let previous = barre ? 1 : 0;
  notes.forEach(({ fret, stringIndex }, i) => {
    const remaining = notes.length - i - 1;
    const desired = Math.max(previous + 1, fret - anchor + 1);
    const finger = Math.min(desired, 4 - remaining);
    fingers[stringIndex] = Math.max(1, finger);
    previous = fingers[stringIndex];
  });

  return { name, frets, fingers, baseFret, ...(barre ? { barre } : {}) };
}

function buildTable(shapes: Record<string, string>): Record<string, ChordDefinition> {
  const table: Record<string, ChordDefinition> = {};
  for (const [name, shape] of Object.entries(shapes)) {
    const frets = shape.split('').map(Number);
    table[name] = buildDefinition(name, frets);

    // Enarmónicos: Db = C#, Eb = D#, Gb = F#, Ab = G#, Bb = A#
    const sharpRoot = name.match(/^([A-G]#)(.*)$/);
    if (sharpRoot && SHARP_TO_FLAT[sharpRoot[1]]) {
      const flatName = `${SHARP_TO_FLAT[sharpRoot[1]]}${sharpRoot[2]}`;
      table[flatName] = buildDefinition(flatName, frets);
    }
  }
  return table;
}

export const UKULELE_CHORDS: Record<string, ChordDefinition> = buildTable(UKULELE_SHAPES);
export const CAVAQUINHO_CHORDS: Record<string, ChordDefinition> = buildTable(CAVAQUINHO_SHAPES);

export function getChordTable(instrument: Instrument): Record<string, ChordDefinition> {
  if (instrument === 'ukulele') return UKULELE_CHORDS;
  if (instrument === 'cavaquinho') return CAVAQUINHO_CHORDS;
  return GUITAR_CHORDS;
}

/**
 * Obtém a definição do acorde para o instrumento escolhido, com as mesmas regras de normalização
 * e aproximação da guitarra (solfejo português, enarmónicos, extensões). Nos instrumentos de 4 cordas,
 * os slash chords (ex: Sol/Si) mostram o desenho do acorde principal.
 */
export function getInstrumentChordDefinition(rawChord: string, instrument: Instrument = DEFAULT_INSTRUMENT): ChordDefinition | null {
  if (instrument === 'guitarra') return getChordDefinition(rawChord);
  return findChordInTable(getChordTable(instrument), rawChord);
}
