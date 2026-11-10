/**
 * Metrónomo com agendamento "lookahead" da Web Audio API:
 * um temporizador curto apenas agenda os cliques com antecedência no relógio de áudio,
 * que é preciso ao milissegundo (os cliques não dependem da precisão do setTimeout).
 */

export const MIN_BPM = 40;
export const MAX_BPM = 220;
export const DEFAULT_BPM = 80;
export const BEATS_PER_BAR = 4;

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;
const TAP_RESET_MS = 2000;
const MAX_TAPS = 6;

export function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
}

/** Lê a diretiva ChordPro `{tempo: N}` do conteúdo da música (ou `null` se não existir/for inválida). */
export function parseTempoDirective(content: string | null | undefined): number | null {
  if (!content || typeof content !== 'string') return null;
  const match = content.match(/\{\s*tempo\s*:\s*(\d+(?:[.,]\d+)?)\s*(?:bpm)?\s*\}/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampBpm(value);
}

/** Indica se uma linha é a diretiva `{tempo: N}` (para não a mostrar como secção). */
export function isTempoDirectiveLine(line: string): boolean {
  return /^\{\s*tempo\s*:[^}]*\}$/i.test((line || '').trim());
}

/**
 * Calcula o BPM a partir dos instantes (ms) dos toques do "Tap Tempo".
 * Ignora toques anteriores a uma pausa longa; precisa de pelo menos 2 toques.
 */
export function computeTapTempo(tapTimes: number[]): number | null {
  if (!Array.isArray(tapTimes) || tapTimes.length < 2) return null;
  let startIdx = 0;
  for (let i = 1; i < tapTimes.length; i++) {
    if (tapTimes[i] - tapTimes[i - 1] > TAP_RESET_MS || tapTimes[i] <= tapTimes[i - 1]) startIdx = i;
  }
  const recent = tapTimes.slice(startIdx).slice(-MAX_TAPS);
  if (recent.length < 2) return null;
  const avgInterval = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
  if (avgInterval <= 0) return null;
  return clampBpm(60000 / avgInterval);
}

/** Acrescenta um toque à lista, descartando os antigos (para o componente guardar o estado). */
export function pushTap(tapTimes: number[], now: number): number[] {
  const last = tapTimes[tapTimes.length - 1];
  if (last !== undefined && now - last > TAP_RESET_MS) return [now];
  return [...tapTimes, now].slice(-MAX_TAPS);
}

let metronomeAudioContext: AudioContext | null = null;

function getMetronomeAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    if (!metronomeAudioContext || metronomeAudioContext.state === 'closed') {
      metronomeAudioContext = new AudioCtx();
    }
    if (metronomeAudioContext.state === 'suspended') {
      metronomeAudioContext.resume().catch(() => {});
    }
    return metronomeAudioContext;
  } catch {
    return null;
  }
}

export interface MetronomeEngineOptions {
  /** Chamado (aproximadamente) no instante em que cada tempo soa: 0 = tempo forte */
  onBeat?: (beatIndex: number) => void;
}

export class MetronomeEngine {
  private bpm = DEFAULT_BPM;
  private running = false;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private beat = 0;
  private visualTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private ctx: AudioContext | null = null;
  private readonly onBeat?: (beatIndex: number) => void;

  constructor(options: MetronomeEngineOptions = {}) {
    this.onBeat = options.onBeat;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setBpm(bpm: number): void {
    this.bpm = clampBpm(bpm);
  }

  /** Inicia o metrónomo. Deve ser chamado num gesto do utilizador (requisito do iOS). */
  start(bpm?: number): boolean {
    if (bpm !== undefined) this.setBpm(bpm);
    if (this.running) return true;
    const ctx = getMetronomeAudioContext();
    if (!ctx) return false;
    this.ctx = ctx;
    this.running = true;
    this.beat = 0;
    this.nextNoteTime = ctx.currentTime + 0.06;
    this.scheduler();
    this.timerId = setInterval(() => this.scheduler(), LOOKAHEAD_MS);
    return true;
  }

  stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.visualTimeouts.forEach((t) => clearTimeout(t));
    this.visualTimeouts.clear();
  }

  private scheduler(): void {
    const ctx = this.ctx;
    if (!this.running || !ctx) return;
    // Se o separador esteve em segundo plano, não "despeja" cliques atrasados de uma vez
    if (this.nextNoteTime < ctx.currentTime - 0.2) {
      this.nextNoteTime = ctx.currentTime + 0.05;
    }
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.scheduleClick(ctx, this.beat, this.nextNoteTime);
      this.nextNoteTime += 60 / this.bpm;
      this.beat = (this.beat + 1) % BEATS_PER_BAR;
    }
  }

  private scheduleClick(ctx: AudioContext, beatIndex: number, time: number): void {
    try {
      const isAccent = beatIndex === 0;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(isAccent ? 1600 : 1000, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(isAccent ? 0.35 : 0.2, time + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.06);
    } catch {
      // Ambiente de áudio restrito/simulado
    }

    if (this.onBeat) {
      const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
      const timeout = setTimeout(() => {
        this.visualTimeouts.delete(timeout);
        if (this.running) this.onBeat?.(beatIndex);
      }, delayMs);
      this.visualTimeouts.add(timeout);
    }
  }
}
