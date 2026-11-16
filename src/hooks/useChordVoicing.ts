import { useCallback, useSyncExternalStore } from 'react';
import { Instrument, isInstrument } from '../lib/instrument-chords';

/**
 * Posição escolhida para cada acorde (ex.: Fá sem pestana), por instrumento, guardada no dispositivo.
 * Formato: { guitarra: { "<chave do acorde>": "<casas por corda>" } }. Sem entrada = posição habitual.
 */
export const CHORD_VOICINGS_STORAGE_KEY = 'cancioneiro_chord_voicings_v1';
const VOICINGS_CHANGE_EVENT = 'cancioneiro:chord-voicings-change';
const MAX_ENTRIES_PER_INSTRUMENT = 400;
const SIGNATURE_RE = /^-?\d{1,2}(?:,-?\d{1,2}){3,5}$/;

type VoicingChoices = Partial<Record<Instrument, Record<string, string>>>;

// Usado quando o localStorage não está acessível ou cheio (modo privado / dados bloqueados)
let memoryChoices: VoicingChoices = {};
let storageWriteFailed = false;
let cachedRaw: string | null | undefined;
let cachedChoices: VoicingChoices = {};

export function sanitizeVoicingChoices(value: unknown): VoicingChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: VoicingChoices = {};
  for (const [instrument, entries] of Object.entries(value as Record<string, unknown>)) {
    if (!isInstrument(instrument) || !entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const clean: Record<string, string> = {};
    for (const [key, signature] of Object.entries(entries as Record<string, unknown>).slice(-MAX_ENTRIES_PER_INSTRUMENT)) {
      if (key.length <= 40 && typeof signature === 'string' && SIGNATURE_RE.test(signature)) clean[key] = signature;
    }
    result[instrument] = clean;
  }
  return result;
}

export function getVoicingChoices(): VoicingChoices {
  if (storageWriteFailed) return memoryChoices;
  let raw: string | null;
  try {
    raw = localStorage.getItem(CHORD_VOICINGS_STORAGE_KEY);
  } catch {
    return memoryChoices;
  }
  // A mesma referência enquanto o valor guardado não muda (exigido pelo useSyncExternalStore)
  if (raw === cachedRaw) return cachedChoices;
  cachedRaw = raw;
  try {
    cachedChoices = raw ? sanitizeVoicingChoices(JSON.parse(raw)) : {};
  } catch {
    cachedChoices = {};
  }
  return cachedChoices;
}

/** Guarda a posição escolhida; `null` volta à posição habitual. */
export function setVoicingChoice(instrument: Instrument, chordKey: string, signature: string | null): void {
  if (!isInstrument(instrument) || !chordKey) return;
  const current = getVoicingChoices();
  const forInstrument = { ...current[instrument] };
  delete forInstrument[chordKey];
  if (signature !== null) {
    if (!SIGNATURE_RE.test(signature)) return;
    forInstrument[chordKey] = signature;
  }
  const next = sanitizeVoicingChoices({ ...current, [instrument]: forInstrument });
  memoryChoices = next;
  try {
    localStorage.setItem(CHORD_VOICINGS_STORAGE_KEY, JSON.stringify(next));
    storageWriteFailed = false;
  } catch {
    // Sem localStorage a escolha fica só nesta sessão (memoryChoices)
    storageWriteFailed = true;
  }
  if (typeof window !== 'undefined') {
    // Atualiza todos os diagramas no mesmo separador (o evento 'storage' só chega aos outros)
    window.dispatchEvent(new Event(VOICINGS_CHANGE_EVENT));
  }
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CHORD_VOICINGS_STORAGE_KEY) onChange();
  };
  window.addEventListener(VOICINGS_CHANGE_EVENT, onChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(VOICINGS_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', handleStorage);
  };
}

const EMPTY: VoicingChoices = {};

/** Só para testes: esquece o estado em memória entre testes. */
export function resetVoicingChoicesMemoryForTests(): void {
  memoryChoices = {};
  storageWriteFailed = false;
  cachedRaw = undefined;
  cachedChoices = {};
}

/** Posição guardada para um acorde num instrumento (assinatura das casas), ou null. */
export function useChordVoicingChoice(
  instrument: Instrument,
  chordKey: string
): { signature: string | null; setSignature: (signature: string | null) => void } {
  const choices = useSyncExternalStore(subscribe, getVoicingChoices, () => EMPTY);
  const signature = choices[instrument]?.[chordKey] ?? null;
  const setSignature = useCallback(
    (next: string | null) => setVoicingChoice(instrument, chordKey, next),
    [instrument, chordKey]
  );
  return { signature, setSignature };
}
