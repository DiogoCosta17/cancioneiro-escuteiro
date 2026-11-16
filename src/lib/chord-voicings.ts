/**
 * Posições alternativas de acordes (várias maneiras de tocar o mesmo acorde), para qualquer instrumento.
 *
 * A primeira posição é sempre a da tabela feita à mão (a que a app mostrava antes); as restantes são
 * calculadas a partir das notas do acorde e da afinação do instrumento, e só são aceites se:
 * - todas as notas tocadas pertencerem ao acorde e as notas características estiverem presentes;
 * - forem tocáveis com 4 dedos (ou pestana + 3 dedos) num espaço de 4 casas;
 * - na guitarra, a nota mais grave for a fundamental (ou o baixo indicado, ex.: Ré/Fá#).
 */
import { parseChord } from './chords';
import { ChordDefinition, normalizeChordName } from './guitar-chords';
import { Instrument, INSTRUMENTS, buildChordDefinition, getInstrumentChordDefinition } from './instrument-chords';

/** Intervalos (meios-tons a partir da fundamental): notas permitidas e notas obrigatórias no desenho. */
export const CHORD_QUALITIES: Record<string, { tones: number[]; required: number[] }> = {
  '': { tones: [0, 4, 7], required: [0, 4] },
  m: { tones: [0, 3, 7], required: [0, 3] },
  '7': { tones: [0, 4, 7, 10], required: [0, 4, 10] },
  m7: { tones: [0, 3, 7, 10], required: [0, 3, 10] },
  maj7: { tones: [0, 4, 7, 11], required: [0, 4, 11] },
  '6': { tones: [0, 4, 7, 9], required: [0, 4, 9] },
  m6: { tones: [0, 3, 7, 9], required: [0, 3, 9] },
  // Nas cifras portuguesas e brasileiras "C9" é quase sempre Cadd9 (a tabela da guitarra também o trata
  // assim): aceita-se a 9.ª com ou sem a 7.ª menor.
  '9': { tones: [0, 4, 7, 2, 10], required: [0, 4, 2] },
  add9: { tones: [0, 4, 7, 2], required: [0, 4, 2] },
  m9: { tones: [0, 3, 7, 2, 10], required: [0, 3, 2] },
  madd9: { tones: [0, 3, 7, 2], required: [0, 3, 2] },
  sus2: { tones: [0, 2, 7], required: [0, 2, 7] },
  sus4: { tones: [0, 5, 7], required: [0, 5, 7] },
  '7sus4': { tones: [0, 5, 7, 10], required: [0, 5, 10] },
  dim: { tones: [0, 3, 6], required: [0, 3, 6] },
  dim7: { tones: [0, 3, 6, 9], required: [0, 3, 6, 9] },
  m7b5: { tones: [0, 3, 6, 10], required: [0, 3, 6, 10] },
  aug: { tones: [0, 4, 8], required: [0, 4, 8] },
};

const QUALITY_ALIASES: Record<string, string> = {
  min: 'm',
  min7: 'm7',
  '°': 'dim',
  'º': 'dim',
  '°7': 'dim7',
  'º7': 'dim7',
  'm7(b5)': 'm7b5',
  'm7(5-)': 'm7b5',
  'm7(-5)': 'm7b5',
  'm7-5': 'm7b5',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  '+': 'aug',
  '5+': 'aug',
  '#5': 'aug',
  '(#5)': 'aug',
};

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const MAX_VOICINGS = 8;

export interface ParsedVoicingChord {
  rootPc: number;
  quality: string;
  /** Nota do baixo de um slash chord (ex.: Ré/Fá# → Fá#), ou null */
  bassPc: number | null;
}

/** Interpreta o acorde (alfabético ou solfejo) numa fundamental + qualidade conhecida, ou null. */
export function parseVoicingChord(rawChord: string): ParsedVoicingChord | null {
  if (!rawChord || typeof rawChord !== 'string') return null;
  const norm = normalizeChordName(rawChord.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, ''));
  const [main, bass] = norm.split('/');
  const match = main.match(/^([A-G][#b]?)(.*)$/);
  if (!match || PITCH_CLASS[match[1]] === undefined) return null;
  const quality = QUALITY_ALIASES[match[2]] ?? match[2];
  if (!CHORD_QUALITIES[quality]) return null;
  let bassPc: number | null = null;
  if (bass) {
    const bassMatch = bass.match(/^([A-G][#b]?)$/);
    if (!bassMatch || PITCH_CLASS[bassMatch[1]] === undefined) return null;
    bassPc = PITCH_CLASS[bassMatch[1]];
  }
  return { rootPc: PITCH_CLASS[match[1]], quality, bassPc };
}

/**
 * Chave do acorde para guardar a posição escolhida: depende só das notas (Ré♭ = Dó#, Sol = G),
 * por isso a escolha vale em todas as músicas e notações.
 */
export function chordVoicingKey(rawChord: string): string {
  const parsed = parseVoicingChord(rawChord);
  if (!parsed) return normalizeChordName(rawChord || '');
  return `${parsed.rootPc}${parsed.quality}${parsed.bassPc !== null ? `/${parsed.bassPc}` : ''}`;
}

/** Identifica um desenho pelas casas de cada corda (ex.: "-1,3,2,0,1,0"). */
export function voicingSignature(frets: number[]): string {
  return frets.join(',');
}

interface Candidate {
  frets: number[];
  score: number;
}

function differsInAtMostOneString(a: number[], b: number[]): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++diff > 1) return false;
  }
  return true;
}

/**
 * Gera desenhos tocáveis do acorde na afinação dada, ordenados do mais fácil para o mais difícil.
 * Guitarra (6 cordas): podem abafar-se as 1–2 cordas mais graves e a nota mais grave tem de ser o baixo.
 * Instrumentos de 4 cordas: tocam-se as 4 cordas.
 */
export function generateVoicings(tuningMidi: number[], parsed: ParsedVoicingChord): number[][] {
  const { tones, required } = CHORD_QUALITIES[parsed.quality];
  const tonePcs = new Set(tones.map((t) => (parsed.rootPc + t) % 12));
  const requiredPcs = required.map((t) => (parsed.rootPc + t) % 12);
  const isSixString = tuningMidi.length >= 6;
  const bassPc = isSixString ? (parsed.bassPc ?? parsed.rootPc) : null;
  if (bassPc !== null) tonePcs.add(bassPc);

  const stringCount = tuningMidi.length;
  const maxMutes = isSixString ? 2 : 0;
  const minSounding = isSixString ? 4 : stringCount;
  const candidates = new Map<string, Candidate>();

  for (let base = 1; base <= 12; base++) {
    const allowOpen = base <= 2;
    const options = tuningMidi.map((open, s) => {
      const opts: number[] = [];
      if (s < maxMutes) opts.push(-1);
      if (allowOpen && tonePcs.has(open % 12)) opts.push(0);
      for (let f = base; f < base + 4; f++) if (tonePcs.has((open + f) % 12)) opts.push(f);
      return opts;
    });

    const frets: number[] = [];
    const visit = (s: number) => {
      if (s === stringCount) {
        const candidate = evaluate(frets, tuningMidi, requiredPcs, bassPc, minSounding);
        if (candidate) {
          const key = voicingSignature(candidate.frets);
          const existing = candidates.get(key);
          if (!existing || candidate.score < existing.score) candidates.set(key, candidate);
        }
        return;
      }
      for (const f of options[s]) {
        // Só se abafam cordas a partir da mais grave (sem cordas abafadas no meio do acorde)
        if (f === -1 && s > 0 && frets[s - 1] !== -1) continue;
        frets[s] = f;
        visit(s + 1);
      }
      frets.length = s;
    };
    visit(0);
  }

  const sorted = [...candidates.values()].sort((a, b) => a.score - b.score);
  const selected: number[][] = [];
  for (const { frets } of sorted) {
    if (selected.some((other) => differsInAtMostOneString(other, frets))) continue;
    selected.push(frets);
    if (selected.length >= MAX_VOICINGS * 2) break;
  }
  return selected;
}

function evaluate(
  frets: number[],
  tuningMidi: number[],
  requiredPcs: number[],
  bassPc: number | null,
  minSounding: number
): Candidate | null {
  const sounding = frets.map((f, s) => (f < 0 ? null : (tuningMidi[s] + f) % 12));
  const soundingPcs = sounding.filter((pc): pc is number => pc !== null);
  if (soundingPcs.length < minSounding) return null;
  if (!requiredPcs.every((pc) => soundingPcs.includes(pc))) return null;
  if (bassPc !== null && soundingPcs[0] !== bassPc) return null;

  const fretted = frets.filter((f) => f > 0);
  const minFret = fretted.length ? Math.min(...fretted) : 0;
  const maxFret = fretted.length ? Math.max(...fretted) : 0;
  if (maxFret - minFret > 3) return null;
  const opens = frets.filter((f) => f === 0).length;
  // Cordas soltas só em desenhos junto à cabeça (até à 4.ª casa): "x35050" não é uma posição que se toque
  if (opens > 0 && maxFret > 4) return null;

  // Duas maneiras de pôr os dedos: um dedo por nota, ou pestana na casa mais baixa (da primeira corda
  // nessa casa até à 1.ª, sem cordas soltas ou abafadas pelo meio) + dedos nas restantes.
  // Em cada uma, dois dedos na mesma casa só em cordas próximas ("542225": 6.ª e 1.ª na 5.ª casa é impossível).
  const fingeredNotes = (withBarre: boolean) =>
    frets.map((f, s) => ({ f, s })).filter(({ f }) => f > 0 && !(withBarre && f === minFret));
  const reachable = (notes: { f: number; s: number }[]) =>
    notes.length <= 4 && !notes.some((a) => notes.some((b) => b.f === a.f && b.s - a.s > 2));

  const withoutBarre = fingeredNotes(false);
  const fromString = frets.indexOf(minFret);
  const canBarre = fretted.length > 1 && frets.slice(fromString).every((f) => f >= minFret);
  const withBarre = canBarre ? fingeredNotes(true) : [];
  const barreOk = canBarre && withBarre.length <= 3 && reachable(withBarre);

  let barre: boolean;
  let fingered: { f: number; s: number }[];
  if (reachable(withoutBarre)) {
    barre = false;
    fingered = withoutBarre;
  } else if (barreOk) {
    barre = true;
    fingered = withBarre;
  } else {
    return null;
  }
  const fingers = fingered.length + (barre ? 1 : 0);
  const stringSpread = fingered.length ? fingered[fingered.length - 1].s - fingered[0].s : 0;

  const mutes = frets.filter((f) => f < 0).length;
  const score =
    minFret * 1.2 +
    fingers +
    (barre ? 2.5 : 0) +
    mutes * 0.7 +
    (maxFret - minFret) * 0.6 +
    (barre ? stringSpread * 0.3 : 0) -
    opens * 0.4;
  return { frets: [...frets], score };
}

/**
 * O desenho toca de facto este acorde? (só notas do acorde, notas características presentes e,
 * na guitarra, o baixo certo). Não avalia a dificuldade.
 */
export function voicingMatchesChord(frets: number[], tuningMidi: number[], parsed: ParsedVoicingChord): boolean {
  const { tones, required } = CHORD_QUALITIES[parsed.quality];
  const tonePcs = new Set(tones.map((t) => (parsed.rootPc + t) % 12));
  const isSixString = tuningMidi.length >= 6;
  const bassPc = isSixString ? (parsed.bassPc ?? parsed.rootPc) : null;
  if (bassPc !== null) tonePcs.add(bassPc);
  const sounding = frets
    .map((f, s) => (f < 0 ? null : (tuningMidi[s] + f) % 12))
    .filter((pc): pc is number => pc !== null);
  if (sounding.length === 0 || sounding.some((pc) => !tonePcs.has(pc))) return false;
  if (!required.every((t) => sounding.includes((parsed.rootPc + t) % 12))) return false;
  return bassPc === null || sounding[0] === bassPc;
}

const voicingCache = new Map<string, ChordDefinition[]>();

/**
 * Todas as posições do acorde para o instrumento: primeiro a posição habitual da app (tabela feita
 * à mão), depois as alternativas calculadas. Se a posição habitual for só uma aproximação que toca
 * outro acorde (ex.: Eb7 no lugar de Ebmaj7, Lám no lugar de Lám/Sol) e houver posições certas,
 * a aproximação é substituída por elas. Lista vazia quando não há diagrama possível.
 */
export function getChordVoicings(rawChord: string, instrument: Instrument): ChordDefinition[] {
  const cacheKey = `${instrument}|${rawChord}`;
  const cached = voicingCache.get(cacheKey);
  if (cached) return cached;

  let defaultDef = getInstrumentChordDefinition(rawChord, instrument);
  if (!defaultDef) {
    const parsedChord = parseChord(rawChord);
    if (parsedChord) defaultDef = getInstrumentChordDefinition(parsedChord.root + parsedChord.suffix, instrument);
  }

  const tuning = INSTRUMENTS[instrument].tuningMidi;
  const parsed = parseVoicingChord(rawChord);
  const generated = parsed ? generateVoicings(tuning, parsed) : [];
  const defaultIsWrongChord =
    !!defaultDef && !!parsed && generated.length > 0 && !voicingMatchesChord(defaultDef.frets, tuning, parsed);

  const voicings: ChordDefinition[] = defaultDef && !defaultIsWrongChord ? [defaultDef] : [];
  if (parsed) {
    for (const frets of generated) {
      if (voicings.length >= MAX_VOICINGS) break;
      if (voicings.some((v) => differsInAtMostOneString(v.frets, frets))) continue;
      voicings.push(buildChordDefinition(rawChord, frets));
    }
  }

  voicingCache.set(cacheKey, voicings);
  return voicings;
}
