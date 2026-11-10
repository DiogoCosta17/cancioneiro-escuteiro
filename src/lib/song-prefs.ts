/**
 * Preferências por música guardadas neste dispositivo (tom/transposição e capo).
 * Cada música do alinhamento mantém o seu próprio tom, mesmo no modo palco.
 */

export const SONG_PREFS_STORAGE_KEY = 'cancioneiro_song_prefs_v1';

// Limite de músicas guardadas (as mais antigas são descartadas primeiro)
const MAX_ENTRIES = 300;

export interface SongPrefs {
  /** Meios-tons de transposição (0–11) */
  semitones: number;
  /** Casa do capo escolhida (0 = sem capo, 1–11) */
  capo: number;
}

interface StoredSongPrefs extends SongPrefs {
  updatedAt: number;
}

type SongPrefsMap = Record<string, StoredSongPrefs>;

function normalizeSemitones(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return ((Math.round(value) % 12) + 12) % 12;
}

function normalizeCapo(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 11) return null;
  return rounded;
}

function readAll(): SongPrefsMap {
  try {
    const raw = localStorage.getItem(SONG_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SongPrefsMap;
  } catch {
    return {};
  }
}

function writeAll(map: SongPrefsMap): void {
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(SONG_PREFS_STORAGE_KEY);
    } else {
      localStorage.setItem(SONG_PREFS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // Armazenamento indisponível (modo privado, quota cheia): ignora silenciosamente
  }
}

/** Lê as preferências guardadas de uma música (ou `null` se não houver/forem inválidas). */
export function loadSongPrefs(songId: string): SongPrefs | null {
  if (!songId) return null;
  const entry = readAll()[songId];
  if (!entry || typeof entry !== 'object') return null;
  const semitones = normalizeSemitones(entry.semitones);
  const capo = normalizeCapo(entry.capo);
  if (semitones === null || capo === null) return null;
  return { semitones, capo };
}

/** Apaga as preferências guardadas de uma música. */
export function clearSongPrefs(songId: string): void {
  if (!songId) return;
  const map = readAll();
  if (!(songId in map)) return;
  delete map[songId];
  writeAll(map);
}

/**
 * Guarda as preferências de uma música. Se coincidirem com o original
 * (sem transposição e capo da própria música), apaga a entrada em vez de guardar.
 */
export function saveSongPrefs(songId: string, prefs: SongPrefs, baseCapo: number = 0): void {
  if (!songId) return;
  const semitones = normalizeSemitones(prefs.semitones);
  const capo = normalizeCapo(prefs.capo);
  if (semitones === null || capo === null) return;

  if (semitones === 0 && capo === (normalizeCapo(baseCapo) ?? 0)) {
    clearSongPrefs(songId);
    return;
  }

  const map = readAll();
  const existing = map[songId];
  if (existing && existing.semitones === semitones && existing.capo === capo) return;

  map[songId] = { semitones, capo, updatedAt: Date.now() };

  const ids = Object.keys(map);
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => (map[a]?.updatedAt || 0) - (map[b]?.updatedAt || 0))
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach((id) => delete map[id]);
  }

  writeAll(map);
}
