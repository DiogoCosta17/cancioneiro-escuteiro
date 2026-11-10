export interface Song {
  id: string;
  title: string;
  artist?: string | null;
  content: string;
  tags: string[];
  original_key: string;
  capo?: number | null;
  youtube_url?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Admin {
  id: string;
  user_id?: string | null;
  name: string;
  email: string;
  role: 'super_admin' | 'editor';
  invited_by?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  confirmed_at?: string | null;
  invited_at?: string | null;
  songs_count?: number;
}

export interface SongSuggestion {
  id: string;
  title: string;
  youtube_url: string | null;
  chords_url: string | null;
  notes: string | null;
  suggested_by_name: string | null;
  status: 'pending' | 'implemented';
  created_at: string;
  implemented_at: string | null;
  implemented_by: string | null;
}

export interface SongSuggestionFormData {
  title: string;
  youtube_url?: string;
  chords_url?: string;
  notes?: string;
  suggested_by_name?: string;
}

export interface Event {
  id: string;
  title: string;
  date: string;
  location: string | null;
  reader_1?: string | null;
  psalmist?: string | null;
  reader_2?: string | null;
  prayers?: string | null;
  /** Versículo do Aleluia (aclamação ao Evangelho), migração 020. */
  gospel_acclamation?: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  user_name: string;
  user_email: string;
  action: string;
  entity_type: 'song' | 'event' | 'suggestion' | 'admin';
  entity_id?: string | null;
  entity_title: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface EventSong {
  id: string;
  event_id: string;
  song_id: string;
  moment_name: string | null;
  order_index: number;
  /** Tom escolhido para este evento: transposição face ao original (0–11), migração 021 */
  transpose_semitones?: number | null;
  /** Casa do capo escolhida para este evento (0–11), migração 021 */
  capo?: number | null;
  /** Nota para os músicos (ex.: "as mulheres fazem a 2.ª voz"), migração 021 */
  notes?: string | null;
  song?: Song | null; // Joined data (can be null if deleted)
}

export interface ChordToken {
  chord: string | null;
  text: string;
}

export interface ParsedLine {
  tokens: ChordToken[];
  isBlank: boolean;
  sectionHeader?: string | null;
}

export interface SongFormData {
  title: string;
  artist: string;
  content: string;
  tags: string[];
  original_key: string;
  capo?: number | null;
  youtube_url?: string;
}

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export interface KeyOption {
  value: string;
  label: string;
}

export const MAJOR_KEYS: KeyOption[] = [
  { value: 'C', label: 'C (Dó Maior)' },
  { value: 'C#', label: 'C# (Dó# Maior)' },
  { value: 'Db', label: 'Db (Réb Maior)' },
  { value: 'D', label: 'D (Ré Maior)' },
  { value: 'D#', label: 'D# (Ré# Maior)' },
  { value: 'Eb', label: 'Eb (Mib Maior)' },
  { value: 'E', label: 'E (Mi Maior)' },
  { value: 'F', label: 'F (Fá Maior)' },
  { value: 'F#', label: 'F# (Fá# Maior)' },
  { value: 'Gb', label: 'Gb (Solb Maior)' },
  { value: 'G', label: 'G (Sol Maior)' },
  { value: 'G#', label: 'G# (Sol# Maior)' },
  { value: 'Ab', label: 'Ab (Láb Maior)' },
  { value: 'A', label: 'A (Lá Maior)' },
  { value: 'A#', label: 'A# (Lá# Maior)' },
  { value: 'Bb', label: 'Bb (Sib Maior)' },
  { value: 'B', label: 'B (Si Maior)' },
];

export const MINOR_KEYS: KeyOption[] = [
  { value: 'Am', label: 'Am (Lá menor)' },
  { value: 'A#m', label: 'A#m (Lá# menor)' },
  { value: 'Bbm', label: 'Bbm (Sib menor)' },
  { value: 'Bm', label: 'Bm (Si menor)' },
  { value: 'Cm', label: 'Cm (Dó menor)' },
  { value: 'C#m', label: 'C#m (Dó# menor)' },
  { value: 'Dm', label: 'Dm (Ré menor)' },
  { value: 'D#m', label: 'D#m (Ré# menor)' },
  { value: 'Ebm', label: 'Ebm (Mib menor)' },
  { value: 'Em', label: 'Em (Mi menor)' },
  { value: 'Fm', label: 'Fm (Fá menor)' },
  { value: 'F#m', label: 'F#m (Fá# menor)' },
  { value: 'Gm', label: 'Gm (Sol menor)' },
  { value: 'G#m', label: 'G#m (Sol# menor)' },
  { value: 'Abm', label: 'Abm (Láb menor)' },
];

export const ALL_KEYS = [
  ...MAJOR_KEYS.map(k => k.value),
  ...MINOR_KEYS.map(k => k.value),
];
