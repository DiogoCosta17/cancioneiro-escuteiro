export interface TunerStringInfo {
  index: number;
  note: string;
  solfege: string;
  shortLabel: string;
  freq: number;
  midi: number;
}

export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;

export const TUNER_STRINGS: TunerStringInfo[] = [
  { index: 0, note: 'E2', solfege: 'Mi (6ª corda - grave)', shortLabel: '6ª Mi', freq: 82.41, midi: 40 },
  { index: 1, note: 'A2', solfege: 'Lá (5ª corda)', shortLabel: '5ª Lá', freq: 110.00, midi: 45 },
  { index: 2, note: 'D3', solfege: 'Ré (4ª corda)', shortLabel: '4ª Ré', freq: 146.83, midi: 50 },
  { index: 3, note: 'G3', solfege: 'Sol (3ª corda)', shortLabel: '3ª Sol', freq: 196.00, midi: 55 },
  { index: 4, note: 'B3', solfege: 'Si (2ª corda)', shortLabel: '2ª Si', freq: 246.94, midi: 59 },
  { index: 5, note: 'E4', solfege: 'Mi (1ª corda - aguda)', shortLabel: '1ª Mi', freq: 329.63, midi: 64 },
];

let sharedAudioContext: AudioContext | null = null;

/**
 * Devolve o AudioContext partilhado da aplicação (criado sob pedido e retomado se estiver suspenso).
 * Retorna `null` em ambientes sem Web Audio (ex: testes, navegadores antigos).
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  try {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

function pluckFrequency(ctx: AudioContext, freq: number, startTime: number, duration = 1.85, gainLevel = 0.22): void {
  try {
    const oscTriangle = ctx.createOscillator();
    const oscSine = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gainNode = ctx.createGain();

    oscTriangle.type = 'triangle';
    oscTriangle.frequency.setValueAtTime(freq, startTime);

    // 2nd harmonic warmth
    oscSine.type = 'sine';
    oscSine.frequency.setValueAtTime(freq * 2, startTime);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.3, startTime);
    harmonicGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration * 0.5);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 6, 4500), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 280), startTime + duration * 0.85);
    filter.Q.setValueAtTime(1.2, startTime);

    gainNode.gain.setValueAtTime(0.001, startTime);
    gainNode.gain.linearRampToValueAtTime(gainLevel, startTime + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    oscTriangle.connect(filter);
    oscSine.connect(harmonicGain);
    harmonicGain.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscTriangle.start(startTime);
    oscSine.start(startTime);
    oscTriangle.stop(startTime + duration + 0.05);
    oscSine.stop(startTime + duration + 0.05);
  } catch {
    // Graceful no-op in restricted/mock audio environments
  }
}

/** Converte uma nota MIDI em frequência (Hz), com Lá4 = 440 Hz. */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Toca um acorde de qualquer instrumento de cordas usando Web Audio API (dedilhado suave pelas cordas ativas).
 * `frets` e `tuningMidi` têm um elemento por corda, pela ordem do diagrama (ex: ukulele Sol-Dó-Mi-Lá = [67, 60, 64, 69]).
 * `-1` = abafada (mute), `0` = solta, `>0` = traste absoluto.
 */
export function playInstrumentChord(frets: number[], tuningMidi: readonly number[]): boolean {
  if (!Array.isArray(frets) || !Array.isArray(tuningMidi) || frets.length === 0 || frets.length !== tuningMidi.length) {
    return false;
  }
  const ctx = getAudioContext();
  if (!ctx) return false;

  const now = ctx.currentTime;
  let activeIndex = 0;
  // Instrumentos de 4 cordas (mais agudos) soam melhor com um dedilhado ligeiramente mais rápido
  const strumStep = frets.length <= 4 ? 0.03 : 0.035;
  const gainLevel = frets.length <= 4 ? 0.2 : 0.18;

  frets.forEach((fret, stringIdx) => {
    if (fret < 0) return; // corda abafada (-1)
    const openMidi = tuningMidi[stringIdx];
    if (typeof openMidi !== 'number') return;

    const freq = Number(midiToFrequency(openMidi + fret).toFixed(2));
    pluckFrequency(ctx, freq, now + activeIndex * strumStep, 1.8, gainLevel);
    activeIndex++;
  });

  return activeIndex > 0;
}

/**
 * Toca um acorde de guitarra usando Web Audio API (dedilhado suave pelas cordas ativas).
 * `frets` tem 6 elementos (6ª corda Mi grave até 1ª corda Mi aguda).
 * `-1` = abafada (mute), `0` = solta, `>0` = traste absoluto.
 */
export function playGuitarChord(frets: number[], _baseFret = 1): boolean {
  if (!Array.isArray(frets) || frets.length !== 6) return false;
  return playInstrumentChord(frets, OPEN_STRING_MIDI);
}

/**
 * Toca uma única corda solta de referência (0 = 6ª corda Mi grave .. 5 = 1ª corda Mi aguda).
 */
export function playSingleString(stringIndex: number): boolean {
  const stringInfo = TUNER_STRINGS[stringIndex];
  if (!stringInfo) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  pluckFrequency(ctx, stringInfo.freq, ctx.currentTime, 2.4, 0.28);
  return true;
}

/**
 * Toca um sinal sonoro suave (estilo GuitarTuna) quando uma corda fica afinada.
 */
export function playTunedChime(): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.09);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
    return true;
  } catch {
    return false;
  }
}

export interface PitchAnalysisResult {
  /** Frequência detetada em Hz */
  detectedFreq: number;
  /** Corda alvo mais próxima (ou fixada manualmente) */
  targetString: TunerStringInfo;
  /** Desvio em cents (-100 cents = -1 semitom, 0 = afinada, +100 cents = +1 semitom) */
  cents: number;
  /** Desvio limitado a [-50, 50] para posicionamento visual da agulha */
  clampedCents: number;
  /** Estado da afinação */
  status: 'in-tune' | 'flat' | 'sharp';
}

/**
 * Deteta a frequência fundamental (Hz) de um sinal de áudio no domínio do tempo
 * usando Autocorrelação Normalizada (NSDF / McLeod Pitch Method) com interpolação parabólica.
 * Retorna `null` se o sinal for silêncio/ruído ou fora da gama da guitarra (55 Hz – 500 Hz).
 */
export function detectPitchAutocorrelation(
  buffer: Float32Array,
  sampleRate: number,
  minRms = 0.012
): number | null {
  const n = buffer.length;
  if (n < 256 || sampleRate <= 0) return null;

  // 1. Verificar energia RMS (Noise Gate)
  let sumSquares = 0;
  for (let i = 0; i < n; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumSquares / n);
  if (rms < minRms) return null;

  // 2. Limites de atraso (lag) para guitarra acústica/clássica (~55 Hz a ~500 Hz)
  const minFreq = 55;
  const maxFreq = 500;
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / minFreq));
  if (minLag >= maxLag) return null;

  const windowSize = Math.min(1024, n - maxLag - 1);
  if (windowSize < 128) return null;

  const nsdf = new Float32Array(maxLag + 2);
  for (let tau = minLag - 1; tau <= maxLag + 1; tau++) {
    let acf = 0;
    let divisor = 0;
    for (let i = 0; i < windowSize; i++) {
      const a = buffer[i];
      const b = buffer[i + tau];
      acf += a * b;
      divisor += a * a + b * b;
    }
    nsdf[tau] = divisor > 0 ? (2 * acf) / divisor : 0;
  }

  // 3. Encontrar picos positivos após a primeira descida de correlação
  let startTau = minLag;
  while (startTau < maxLag && nsdf[startTau] > 0.4 && nsdf[startTau] >= nsdf[startTau + 1]) {
    startTau++;
  }

  let globalMax = 0;
  const peaks: { tau: number; val: number }[] = [];

  for (let tau = startTau; tau <= maxLag; tau++) {
    const prev = nsdf[tau - 1];
    const curr = nsdf[tau];
    const next = nsdf[tau + 1];
    if (curr > 0.55 && curr >= prev && curr > next) {
      peaks.push({ tau, val: curr });
      if (curr > globalMax) {
        globalMax = curr;
      }
    }
  }

  if (peaks.length === 0 || globalMax < 0.62) return null;

  // Selecionar o primeiro pico forte (>= 85% do máximo global) para evitar erro de sub-oitava
  const threshold = globalMax * 0.85;
  const chosenPeak = peaks.find((p) => p.val >= threshold) ?? peaks[0];
  const bestTau = chosenPeak.tau;

  // 4. Interpolação parabólica para precisão sub-amostra
  const y1 = nsdf[bestTau - 1];
  const y2 = nsdf[bestTau];
  const y3 = nsdf[bestTau + 1];
  const denom = 2 * (2 * y2 - y1 - y3);
  const shift = denom !== 0 ? (y3 - y1) / denom : 0;
  const refinedLag = bestTau + (Math.abs(shift) < 1 ? shift : 0);

  const frequency = sampleRate / refinedLag;
  if (frequency < minFreq || frequency > maxFreq) return null;

  return Number(frequency.toFixed(2));
}

/**
 * Analisa uma frequência em Hz e identifica a corda da guitarra mais próxima (Modo Automático)
 * ou calcula o desvio em relação a uma corda fixada manualmente (`lockedStringIndex`).
 */
export function analyzeGuitarPitch(
  detectedFreq: number,
  lockedStringIndex: number | null = null
): PitchAnalysisResult {
  let targetString = TUNER_STRINGS[0];

  if (
    lockedStringIndex !== null &&
    lockedStringIndex >= 0 &&
    lockedStringIndex < TUNER_STRINGS.length
  ) {
    targetString = TUNER_STRINGS[lockedStringIndex];
  } else {
    // Modo Automático (estilo GuitarTuna): menor distância logarítmica em cents
    let minAbsCents = Infinity;
    for (const str of TUNER_STRINGS) {
      const distCents = Math.abs(1200 * Math.log2(detectedFreq / str.freq));
      if (distCents < minAbsCents) {
        minAbsCents = distCents;
        targetString = str;
      }
    }
  }

  const rawCents = 1200 * Math.log2(detectedFreq / targetString.freq);
  const cents = Math.round(rawCents * 10) / 10;
  const clampedCents = Math.max(-50, Math.min(50, Math.round(rawCents)));

  const status: 'in-tune' | 'flat' | 'sharp' =
    Math.abs(cents) <= 5 ? 'in-tune' : cents < -5 ? 'flat' : 'sharp';

  return {
    detectedFreq: Number(detectedFreq.toFixed(1)),
    targetString,
    cents,
    clampedCents,
    status,
  };
}
