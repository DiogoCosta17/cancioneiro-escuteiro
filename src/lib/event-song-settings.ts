/**
 * Tom, capo e notas de um cântico num evento concreto (migração 021).
 *
 * Na BD (`event_songs`):
 * - `transpose_semitones` (0–11): transposição face ao tom original, igual ao `semitones` do SongView;
 * - `capo` (0–11): casa do capo a usar;
 * - `notes`: texto livre (ex.: "as mulheres fazem a 2.ª voz").
 * Ambos os valores de tom a `null` = sem escolha própria (tom e capo da música).
 */
import type { EventSong, Song } from './types';
import { getKeyName, keyPrefersFlats, transposeChord } from './chords';
import { mod12 } from './key-picker';

export const EVENT_SONG_NOTES_MAX = 500;

export interface EventKeySettings {
  /** Meios-tons de transposição face ao tom original (0–11) */
  semitones: number;
  /** Casa do capo (0 = sem capo) */
  capo: number;
}

/** Colunas da migração 021 (usadas para saber se a BD as aceita). */
export const EVENT_SONG_SETTING_COLUMNS = ['transpose_semitones', 'capo', 'notes'] as const;

export function songBaseCapo(song: Pick<Song, 'capo'> | null | undefined): number {
  const capo = song?.capo;
  return typeof capo === 'number' && capo > 0 && capo <= 11 ? Math.round(capo) : 0;
}

function readFret(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 0 && rounded <= 11 ? rounded : null;
}

/**
 * Tom e capo escolhidos para este cântico no evento, ou `null` se o evento usa o tom da música
 * (sem valores, ou valores iguais ao original).
 */
export function readEventKeySettings(
  es: Pick<EventSong, 'transpose_semitones' | 'capo'> | null | undefined,
  song: Pick<Song, 'capo'> | null | undefined
): EventKeySettings | null {
  if (!es) return null;
  const rawSemitones = readFret(es.transpose_semitones);
  const rawCapo = readFret(es.capo);
  if (rawSemitones === null && rawCapo === null) return null;
  const base = songBaseCapo(song);
  const settings = { semitones: rawSemitones ?? 0, capo: rawCapo ?? base };
  return settings.semitones === 0 && settings.capo === base ? null : settings;
}

/** Valores a gravar em `event_songs` (null quando coincidem com o original da música). */
export function toEventKeyColumns(
  settings: EventKeySettings | null,
  song: Pick<Song, 'capo'> | null | undefined
): { transpose_semitones: number | null; capo: number | null } {
  if (!settings) return { transpose_semitones: null, capo: null };
  const semitones = mod12(settings.semitones);
  const capo = readFret(settings.capo) ?? songBaseCapo(song);
  if (semitones === 0 && capo === songBaseCapo(song)) return { transpose_semitones: null, capo: null };
  return { transpose_semitones: semitones, capo };
}

export function normalizeEventSongNotes(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, EVENT_SONG_NOTES_MAX) : null;
}

/** Desloca os desenhos de acordes: transposição menos as casas de capo a mais. */
export function shapeSemitones(settings: EventKeySettings, song: Pick<Song, 'capo'> | null | undefined): number {
  return settings.semitones - (settings.capo - songBaseCapo(song));
}

/** Converte a escolha do editor (tom dos acordes + capo) em transposição. */
export function settingsFromShape(shapeOffset: number, capo: number, song: Pick<Song, 'capo'> | null | undefined): EventKeySettings {
  return { semitones: mod12(shapeOffset + capo - songBaseCapo(song)), capo };
}

/** Bemóis/sustenidos automáticos, com a mesma regra do SongView. */
export function autoPreferFlats(originalKey: string | null | undefined, effectiveSemitones: number): boolean | undefined {
  if (mod12(effectiveSemitones) === 0 || !originalKey) return undefined;
  return keyPrefersFlats(transposeChord(originalKey, effectiveSemitones, false));
}

export interface EventKeyDisplay {
  /** Deslocamento a aplicar aos acordes escritos */
  effectiveSemitones: number;
  preferFlats: boolean | undefined;
  /** Tom dos desenhos de acordes (o que o músico lê) */
  keyLabel: string;
  /** Casa do capo (0 = sem capo) */
  capo: number;
  /** Há escolha própria do evento */
  custom: boolean;
}

/** Tom e capo a mostrar/imprimir para um cântico do evento (com ou sem escolha própria). */
export function describeEventSongKey(
  es: Pick<EventSong, 'transpose_semitones' | 'capo'> | null | undefined,
  song: Pick<Song, 'capo' | 'original_key'>,
  notation: 'silabica' | 'alfabetica' = 'alfabetica'
): EventKeyDisplay {
  const settings = readEventKeySettings(es, song);
  const effectiveSemitones = settings ? shapeSemitones(settings, song) : 0;
  const preferFlats = autoPreferFlats(song.original_key, effectiveSemitones);
  return {
    effectiveSemitones,
    preferFlats,
    keyLabel: song.original_key ? getKeyName(song.original_key, effectiveSemitones, preferFlats, notation) : '',
    capo: settings ? settings.capo : songBaseCapo(song),
    custom: Boolean(settings),
  };
}

/** Texto curto para o histórico e resumos (ex.: "Sol · capo 2"). */
export function summarizeEventSong(
  es: Pick<EventSong, 'transpose_semitones' | 'capo' | 'notes'>,
  song: Pick<Song, 'capo' | 'original_key'> | null | undefined
): string {
  const parts: string[] = [];
  if (song && readEventKeySettings(es, song)) {
    const d = describeEventSongKey(es, song, 'silabica');
    parts.push(`${d.keyLabel || 'tom alterado'}${d.capo > 0 ? ` · capo ${d.capo}` : ' · sem capo'}`);
  }
  const notes = normalizeEventSongNotes(es.notes);
  if (notes) parts.push(`nota: ${notes}`);
  return parts.join(' — ');
}

/** O erro do Supabase indica que a BD ainda não tem as colunas da migração 021. */
export function isMissingSettingsColumnError(err: { message?: string } | null | undefined): boolean {
  const msg = err?.message?.toLowerCase() || '';
  return msg.includes('column') && EVENT_SONG_SETTING_COLUMNS.some(c => msg.includes(c));
}
