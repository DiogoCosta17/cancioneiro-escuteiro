import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_INSTRUMENT, Instrument, isInstrument } from '../lib/instrument-chords';

export const INSTRUMENT_STORAGE_KEY = 'cancioneiro_instrument_v1';
const INSTRUMENT_CHANGE_EVENT = 'cancioneiro:instrument-change';

// Valor em memória usado apenas quando o localStorage não está acessível (modo privado / dados bloqueados)
let memoryInstrument: Instrument | null = null;

export function getStoredInstrument(): Instrument {
  try {
    const saved = localStorage.getItem(INSTRUMENT_STORAGE_KEY);
    return isInstrument(saved) ? saved : DEFAULT_INSTRUMENT;
  } catch {
    return memoryInstrument ?? DEFAULT_INSTRUMENT;
  }
}

export function setStoredInstrument(instrument: Instrument): void {
  if (!isInstrument(instrument)) return;
  memoryInstrument = instrument;
  try {
    localStorage.setItem(INSTRUMENT_STORAGE_KEY, instrument);
  } catch {
    // Ignorar: a escolha mantém-se apenas nesta sessão
  }
  if (typeof window !== 'undefined') {
    // Notifica todos os componentes no mesmo separador (o evento 'storage' só chega aos outros separadores)
    window.dispatchEvent(new Event(INSTRUMENT_CHANGE_EVENT));
  }
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === INSTRUMENT_STORAGE_KEY) onChange();
  };

  window.addEventListener(INSTRUMENT_CHANGE_EVENT, onChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(INSTRUMENT_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Instrumento preferido para os diagramas e sons dos acordes (Guitarra / Ukulele / Cavaquinho).
 * A escolha é guardada no localStorage e sincronizada entre todos os componentes e separadores.
 */
export function useInstrument(): { instrument: Instrument; setInstrument: (instrument: Instrument) => void } {
  const instrument = useSyncExternalStore(subscribe, getStoredInstrument, () => DEFAULT_INSTRUMENT);
  const setInstrument = useCallback((next: Instrument) => setStoredInstrument(next), []);
  return { instrument, setInstrument };
}
