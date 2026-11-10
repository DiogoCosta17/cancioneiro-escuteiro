/**
 * Restauro de cópias de segurança (JSON exportado pelo painel de administração).
 *
 * Módulo puro (sem React nem Supabase): validação estrita do ficheiro, cálculo do plano
 * (criar / atualizar / sem alterações) e aplicação através de um adaptador injetado.
 *
 * Semântica do restauro:
 * - Upsert por id: músicas primeiro, depois eventos, depois os cânticos de cada evento.
 * - NUNCA apaga nada: registos que existam na base de dados e não estejam na cópia mantêm-se.
 * - Itens sem alterações não são reenviados (evita ruído no histórico de atividade).
 */

export const BACKUP_VERSION = '1.0';
export const BACKUP_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const MAX_SONGS = 10000;
const MAX_EVENTS = 5000;
const MAX_EVENT_SONGS_PER_EVENT = 500;
const MAX_TITLE_LENGTH = 500;
const MAX_CONTENT_LENGTH = 200_000;
const MAX_TEXT_LENGTH = 2000;
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 100;
const MAX_ERRORS = 25;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Campos aceites (tudo o resto é rejeitado). created_by/updated_at são aceites mas ignorados no restauro.
const TOP_KEYS = new Set(['version', 'exported_at', 'exported_by', 'total_songs', 'total_events', 'songs', 'events']);
const SONG_KEYS = new Set([
  'id', 'title', 'artist', 'content', 'tags', 'original_key', 'capo', 'youtube_url',
  'created_by', 'created_at', 'updated_at',
  // Coluna antiga ainda presente em produção (a migração 007 não foi aplicada): aceite mas nunca escrita
  'category',
]);
const EVENT_KEYS = new Set([
  'id', 'title', 'date', 'location', 'reader_1', 'psalmist', 'reader_2', 'prayers', 'gospel_acclamation', 'created_at', 'event_songs',
]);
const EVENT_SONG_KEYS = new Set([
  'id', 'event_id', 'song_id', 'moment_name', 'order_index', 'created_at',
  // Migração 021: tom, capo e notas do cântico no evento
  'transpose_semitones', 'capo', 'notes',
]);

export interface BackupSong {
  id: string;
  title: string;
  artist: string | null;
  content: string;
  tags: string[];
  original_key: string;
  capo: number | null;
  youtube_url: string | null;
  created_at: string | null;
}

export interface BackupEventSong {
  id: string;
  event_id: string;
  song_id: string;
  moment_name: string | null;
  order_index: number;
  /** Migração 021 (null = sem escolha própria ou cópia antiga) */
  transpose_semitones: number | null;
  capo: number | null;
  notes: string | null;
}

export interface BackupEvent {
  id: string;
  title: string;
  date: string;
  location: string | null;
  reader_1: string | null;
  psalmist: string | null;
  reader_2: string | null;
  prayers: string | null;
  gospel_acclamation: string | null;
  created_at: string | null;
  event_songs: BackupEventSong[];
}

export interface Backup {
  version: string;
  exported_at: string | null;
  exported_by: string | null;
  songs: BackupSong[];
  events: BackupEvent[];
}

export type BackupParseResult =
  | { ok: true; backup: Backup }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

class ErrorCollector {
  errors: string[] = [];
  private overflow = 0;
  add(path: string, message: string) {
    if (this.errors.length < MAX_ERRORS) this.errors.push(`${path}: ${message}`);
    else this.overflow++;
  }
  get count() {
    return this.errors.length + this.overflow;
  }
  finish(): string[] {
    return this.overflow > 0 ? [...this.errors, `… e mais ${this.overflow} erro(s).`] : this.errors;
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function isValidDateOnly(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

function checkUnknownKeys(obj: Record<string, unknown>, allowed: Set<string>, path: string, errs: ErrorCollector) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) errs.add(path, `campo desconhecido "${key}"`);
  }
}

function readId(obj: Record<string, unknown>, key: string, path: string, errs: ErrorCollector): string {
  const v = obj[key];
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    errs.add(`${path}.${key}`, 'tem de ser um identificador (UUID) válido');
    return '';
  }
  return v.toLowerCase();
}

function readRequiredText(obj: Record<string, unknown>, key: string, path: string, errs: ErrorCollector, max: number): string {
  const v = obj[key];
  if (typeof v !== 'string' || !v.trim()) {
    errs.add(`${path}.${key}`, 'tem de ser texto não vazio');
    return '';
  }
  if (v.length > max) errs.add(`${path}.${key}`, `excede ${max} caracteres`);
  return v;
}

function readOptionalText(obj: Record<string, unknown>, key: string, path: string, errs: ErrorCollector, max = MAX_TEXT_LENGTH): string | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    errs.add(`${path}.${key}`, 'tem de ser texto ou null');
    return null;
  }
  if (v.length > max) errs.add(`${path}.${key}`, `excede ${max} caracteres`);
  return v;
}

function readOptionalTimestamp(obj: Record<string, unknown>, key: string, path: string, errs: ErrorCollector): string | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
    errs.add(`${path}.${key}`, 'tem de ser uma data/hora válida ou null');
    return null;
  }
  return v;
}

function validateSong(raw: unknown, path: string, errs: ErrorCollector): BackupSong | null {
  if (!isPlainObject(raw)) {
    errs.add(path, 'tem de ser um objeto');
    return null;
  }
  checkUnknownKeys(raw, SONG_KEYS, path, errs);

  const id = readId(raw, 'id', path, errs);
  const title = readRequiredText(raw, 'title', path, errs, MAX_TITLE_LENGTH);

  let content = '';
  if (typeof raw.content !== 'string') errs.add(`${path}.content`, 'tem de ser texto');
  else if (raw.content.length > MAX_CONTENT_LENGTH) errs.add(`${path}.content`, `excede ${MAX_CONTENT_LENGTH} caracteres`);
  else content = raw.content;

  const original_key = readRequiredText(raw, 'original_key', path, errs, 10);

  let tags: string[] = [];
  if (raw.tags !== null && raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || raw.tags.some(t => typeof t !== 'string')) {
      errs.add(`${path}.tags`, 'tem de ser uma lista de textos');
    } else if (raw.tags.length > MAX_TAGS || raw.tags.some((t: string) => t.length > MAX_TAG_LENGTH)) {
      errs.add(`${path}.tags`, 'demasiadas etiquetas ou etiqueta demasiado longa');
    } else {
      tags = raw.tags as string[];
    }
  }

  let capo: number | null = null;
  if (raw.capo !== null && raw.capo !== undefined) {
    if (typeof raw.capo !== 'number' || !Number.isInteger(raw.capo) || raw.capo < 0 || raw.capo > 12) {
      errs.add(`${path}.capo`, 'tem de ser um número inteiro entre 0 e 12, ou null');
    } else {
      capo = raw.capo > 0 ? raw.capo : null;
    }
  }

  const artist = readOptionalText(raw, 'artist', path, errs, MAX_TITLE_LENGTH);
  const youtube_url = readOptionalText(raw, 'youtube_url', path, errs);
  const created_at = readOptionalTimestamp(raw, 'created_at', path, errs);
  readOptionalTimestamp(raw, 'updated_at', path, errs);
  if (raw.created_by !== undefined && raw.created_by !== null && (typeof raw.created_by !== 'string' || !UUID_RE.test(raw.created_by))) {
    errs.add(`${path}.created_by`, 'tem de ser um UUID ou null');
  }

  return { id, title, artist, content, tags, original_key, capo, youtube_url, created_at };
}

function validateEventSong(raw: unknown, path: string, eventId: string, errs: ErrorCollector): BackupEventSong | null {
  if (!isPlainObject(raw)) {
    errs.add(path, 'tem de ser um objeto');
    return null;
  }
  checkUnknownKeys(raw, EVENT_SONG_KEYS, path, errs);
  const id = readId(raw, 'id', path, errs);
  const event_id = readId(raw, 'event_id', path, errs);
  const song_id = readId(raw, 'song_id', path, errs);
  if (event_id && eventId && event_id !== eventId) {
    errs.add(`${path}.event_id`, 'não corresponde ao evento onde está incluído');
  }
  const moment_name = readOptionalText(raw, 'moment_name', path, errs, 200);
  let order_index = 0;
  if (typeof raw.order_index !== 'number' || !Number.isInteger(raw.order_index) || raw.order_index < 0 || raw.order_index > 100000) {
    errs.add(`${path}.order_index`, 'tem de ser um número inteiro não negativo');
  } else {
    order_index = raw.order_index;
  }
  readOptionalTimestamp(raw, 'created_at', path, errs);
  const transpose_semitones = readOptionalFret(raw, 'transpose_semitones', path, errs);
  const capo = readOptionalFret(raw, 'capo', path, errs);
  const notes = readOptionalText(raw, 'notes', path, errs, 500);
  return { id, event_id, song_id, moment_name, order_index, transpose_semitones, capo, notes };
}

function readOptionalFret(obj: Record<string, unknown>, key: string, path: string, errs: ErrorCollector): number | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 11) {
    errs.add(`${path}.${key}`, 'tem de ser um número inteiro de 0 a 11 ou null');
    return null;
  }
  return v;
}

function validateEvent(raw: unknown, path: string, errs: ErrorCollector): BackupEvent | null {
  if (!isPlainObject(raw)) {
    errs.add(path, 'tem de ser um objeto');
    return null;
  }
  checkUnknownKeys(raw, EVENT_KEYS, path, errs);
  const id = readId(raw, 'id', path, errs);
  const title = readRequiredText(raw, 'title', path, errs, MAX_TITLE_LENGTH);

  let date = '';
  if (typeof raw.date !== 'string' || !isValidDateOnly(raw.date)) {
    errs.add(`${path}.date`, "tem de ser uma data válida no formato 'AAAA-MM-DD'");
  } else {
    date = raw.date;
  }

  const location = readOptionalText(raw, 'location', path, errs);
  const reader_1 = readOptionalText(raw, 'reader_1', path, errs);
  const psalmist = readOptionalText(raw, 'psalmist', path, errs);
  const reader_2 = readOptionalText(raw, 'reader_2', path, errs);
  const prayers = readOptionalText(raw, 'prayers', path, errs, 20000);
  const gospel_acclamation = readOptionalText(raw, 'gospel_acclamation', path, errs, 600);
  const created_at = readOptionalTimestamp(raw, 'created_at', path, errs);

  const event_songs: BackupEventSong[] = [];
  if (!Array.isArray(raw.event_songs)) {
    errs.add(`${path}.event_songs`, 'tem de ser uma lista');
  } else if (raw.event_songs.length > MAX_EVENT_SONGS_PER_EVENT) {
    errs.add(`${path}.event_songs`, `tem mais de ${MAX_EVENT_SONGS_PER_EVENT} cânticos`);
  } else {
    raw.event_songs.forEach((es, i) => {
      const parsed = validateEventSong(es, `${path}.event_songs[${i}]`, id, errs);
      if (parsed) event_songs.push(parsed);
    });
  }

  return { id, title, date, location, reader_1, psalmist, reader_2, prayers, gospel_acclamation, created_at, event_songs };
}

/** Valida estritamente o conteúdo (já convertido de JSON) de uma cópia de segurança. */
export function validateBackup(raw: unknown): BackupParseResult {
  const errs = new ErrorCollector();
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['O ficheiro não contém um objeto JSON de cópia de segurança.'] };
  }
  checkUnknownKeys(raw, TOP_KEYS, 'ficheiro', errs);

  if (raw.version !== BACKUP_VERSION) {
    errs.add('version', `versão não suportada (esperada "${BACKUP_VERSION}")`);
  }
  if (!Array.isArray(raw.songs)) errs.add('songs', 'tem de ser uma lista');
  if (!Array.isArray(raw.events)) errs.add('events', 'tem de ser uma lista');
  if (errs.count > 0) return { ok: false, errors: errs.finish() };

  const rawSongs = raw.songs as unknown[];
  const rawEvents = raw.events as unknown[];
  if (rawSongs.length > MAX_SONGS) errs.add('songs', `mais de ${MAX_SONGS} músicas`);
  if (rawEvents.length > MAX_EVENTS) errs.add('events', `mais de ${MAX_EVENTS} eventos`);
  if (errs.count > 0) return { ok: false, errors: errs.finish() };

  // Totais declarados têm de bater certo (deteta ficheiros truncados ou editados à mão)
  if (raw.total_songs !== undefined && raw.total_songs !== rawSongs.length) {
    errs.add('total_songs', `indica ${String(raw.total_songs)} mas o ficheiro tem ${rawSongs.length} músicas`);
  }
  if (raw.total_events !== undefined && raw.total_events !== rawEvents.length) {
    errs.add('total_events', `indica ${String(raw.total_events)} mas o ficheiro tem ${rawEvents.length} eventos`);
  }
  if (raw.exported_at !== undefined && raw.exported_at !== null && (typeof raw.exported_at !== 'string' || Number.isNaN(Date.parse(raw.exported_at)))) {
    errs.add('exported_at', 'tem de ser uma data/hora válida');
  }
  if (raw.exported_by !== undefined && raw.exported_by !== null && typeof raw.exported_by !== 'string') {
    errs.add('exported_by', 'tem de ser texto');
  }

  const songs: BackupSong[] = [];
  rawSongs.forEach((s, i) => {
    const parsed = validateSong(s, `songs[${i}]`, errs);
    if (parsed) songs.push(parsed);
  });
  const events: BackupEvent[] = [];
  rawEvents.forEach((e, i) => {
    const parsed = validateEvent(e, `events[${i}]`, errs);
    if (parsed) events.push(parsed);
  });

  // Ids repetidos tornariam o upsert ambíguo
  const checkDuplicates = (ids: string[], label: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) continue;
      if (seen.has(id)) errs.add(label, `id repetido ${id}`);
      seen.add(id);
    }
  };
  checkDuplicates(songs.map(s => s.id), 'songs');
  checkDuplicates(events.map(e => e.id), 'events');
  checkDuplicates(events.flatMap(e => e.event_songs.map(es => es.id)), 'event_songs');

  if (errs.count > 0) return { ok: false, errors: errs.finish() };

  return {
    ok: true,
    backup: {
      version: BACKUP_VERSION,
      exported_at: typeof raw.exported_at === 'string' ? raw.exported_at : null,
      exported_by: typeof raw.exported_by === 'string' ? raw.exported_by : null,
      songs,
      events,
    },
  };
}

/** Lê o texto de um ficheiro de cópia de segurança (com limite de tamanho) e valida-o. */
export function parseBackupText(text: string, byteSize: number = text.length): BackupParseResult {
  if (byteSize > BACKUP_MAX_BYTES) {
    return { ok: false, errors: [`O ficheiro excede o limite de ${BACKUP_MAX_BYTES / (1024 * 1024)} MB.`] };
  }
  if (!text || !text.trim()) {
    return { ok: false, errors: ['O ficheiro está vazio.'] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['O ficheiro não é JSON válido.'] };
  }
  return validateBackup(raw);
}

// ---------------------------------------------------------------------------
// Plano (dry-run)
// ---------------------------------------------------------------------------

export type PlanStatus = 'create' | 'update' | 'unchanged';

export interface CurrentSong {
  id: string;
  title?: string | null;
  artist?: string | null;
  content?: string | null;
  tags?: string[] | null;
  original_key?: string | null;
  capo?: number | null;
  youtube_url?: string | null;
}

export interface CurrentEvent {
  id: string;
  title?: string | null;
  date?: string | null;
  location?: string | null;
  reader_1?: string | null;
  psalmist?: string | null;
  reader_2?: string | null;
  prayers?: string | null;
  gospel_acclamation?: string | null;
}

export interface CurrentEventSong {
  id: string;
  event_id: string;
  song_id: string;
  moment_name?: string | null;
  order_index: number;
  transpose_semitones?: number | null;
  capo?: number | null;
  notes?: string | null;
}

export interface CurrentState {
  songs: CurrentSong[];
  events: CurrentEvent[];
  eventSongs: CurrentEventSong[];
}

export interface SongPlanItem {
  id: string;
  title: string;
  status: PlanStatus;
  changedFields: string[];
}

export interface SkippedEventSong {
  id: string;
  songId: string;
  reason: string;
}

export interface EventPlanItem {
  id: string;
  title: string;
  date: string;
  status: PlanStatus;
  changedFields: string[];
  /** Linhas de event_songs a criar/atualizar (as sem alterações não são reenviadas). */
  eventSongsToUpsert: Array<{ eventSong: BackupEventSong; status: Exclude<PlanStatus, 'unchanged'> }>;
  eventSongsCreate: number;
  eventSongsUpdate: number;
  eventSongsUnchanged: number;
  eventSongsSkipped: SkippedEventSong[];
  /** Cânticos atualmente no evento que não constam da cópia (mantidos: o restauro nunca apaga). */
  keptExtraEventSongs: number;
}

export interface StatusCounts {
  create: number;
  update: number;
  unchanged: number;
}

export interface RestorePlan {
  songs: SongPlanItem[];
  events: EventPlanItem[];
  summary: {
    songs: StatusCounts;
    events: StatusCounts;
    eventSongs: StatusCounts & { skipped: number };
  };
  warnings: string[];
  /** true se não houver nada para enviar à base de dados. */
  isNoop: boolean;
}

const SONG_FIELD_LABELS: Record<string, string> = {
  title: 'título',
  artist: 'artista',
  content: 'letra/acordes',
  tags: 'etiquetas',
  original_key: 'tom',
  capo: 'capo',
  youtube_url: 'YouTube',
};

const EVENT_FIELD_LABELS: Record<string, string> = {
  title: 'título',
  date: 'data',
  location: 'local',
  reader_1: '1ª leitura',
  psalmist: 'salmista',
  reader_2: '2ª leitura',
  prayers: 'preces',
  gospel_acclamation: 'versículo do Aleluia',
};

const normText = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const normCapo = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? v : null);
const normTags = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []);
const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

function diffSong(backup: BackupSong, current: CurrentSong): string[] {
  const changed: string[] = [];
  if (backup.title !== (current.title ?? '')) changed.push('title');
  if (normText(backup.artist) !== normText(current.artist)) changed.push('artist');
  if (backup.content !== (current.content ?? '')) changed.push('content');
  if (!sameTags(normTags(backup.tags), normTags(current.tags))) changed.push('tags');
  if (backup.original_key !== (current.original_key ?? '')) changed.push('original_key');
  if (normCapo(backup.capo) !== normCapo(current.capo)) changed.push('capo');
  if (normText(backup.youtube_url) !== normText(current.youtube_url)) changed.push('youtube_url');
  return changed.map(f => SONG_FIELD_LABELS[f] || f);
}

function diffEvent(backup: BackupEvent, current: CurrentEvent): string[] {
  const changed: string[] = [];
  if (backup.title !== (current.title ?? '')) changed.push('title');
  if (backup.date !== (current.date ?? '').slice(0, 10)) changed.push('date');
  for (const key of ['location', 'reader_1', 'psalmist', 'reader_2', 'prayers', 'gospel_acclamation'] as const) {
    if (normText(backup[key]) !== normText(current[key])) changed.push(key);
  }
  return changed.map(f => EVENT_FIELD_LABELS[f] || f);
}

/** Compara a cópia de segurança com o estado atual da base de dados, sem escrever nada. */
export function buildRestorePlan(backup: Backup, current: CurrentState): RestorePlan {
  const currentSongs = new Map(current.songs.map(s => [s.id.toLowerCase(), s]));
  const currentEvents = new Map(current.events.map(e => [e.id.toLowerCase(), e]));
  const currentEventSongs = new Map(current.eventSongs.map(es => [es.id.toLowerCase(), es]));
  const backupSongIds = new Set(backup.songs.map(s => s.id));
  const warnings: string[] = [];

  const songs: SongPlanItem[] = backup.songs.map(song => {
    const existing = currentSongs.get(song.id);
    if (!existing) return { id: song.id, title: song.title, status: 'create', changedFields: [] };
    const changedFields = diffSong(song, existing);
    return { id: song.id, title: song.title, status: changedFields.length ? 'update' : 'unchanged', changedFields };
  });

  const eventSongTotals = { create: 0, update: 0, unchanged: 0, skipped: 0 };

  const events: EventPlanItem[] = backup.events.map(event => {
    const existing = currentEvents.get(event.id);
    const toUpsert: EventPlanItem['eventSongsToUpsert'] = [];
    const skipped: SkippedEventSong[] = [];
    let esCreate = 0;
    let esUpdate = 0;
    let esUnchanged = 0;

    for (const es of event.event_songs) {
      if (!backupSongIds.has(es.song_id) && !currentSongs.has(es.song_id)) {
        skipped.push({ id: es.id, songId: es.song_id, reason: 'a música não existe na cópia nem no cancioneiro' });
        continue;
      }
      const cur = currentEventSongs.get(es.id);
      if (!cur) {
        esCreate++;
        toUpsert.push({ eventSong: es, status: 'create' });
      } else if (
        cur.event_id.toLowerCase() !== es.event_id ||
        cur.song_id.toLowerCase() !== es.song_id ||
        normText(cur.moment_name) !== normText(es.moment_name) ||
        cur.order_index !== es.order_index ||
        // Tom/capo/notas só contam quando a cópia os tem (o restauro nunca apaga valores)
        (es.transpose_semitones !== null && es.transpose_semitones !== (cur.transpose_semitones ?? null)) ||
        (es.capo !== null && es.capo !== (cur.capo ?? null)) ||
        (es.notes !== null && normText(es.notes) !== normText(cur.notes))
      ) {
        esUpdate++;
        toUpsert.push({ eventSong: es, status: 'update' });
      } else {
        esUnchanged++;
      }
    }

    const backupEsIds = new Set(event.event_songs.map(es => es.id));
    const keptExtra = existing
      ? current.eventSongs.filter(es => es.event_id.toLowerCase() === event.id && !backupEsIds.has(es.id.toLowerCase())).length
      : 0;

    eventSongTotals.create += esCreate;
    eventSongTotals.update += esUpdate;
    eventSongTotals.unchanged += esUnchanged;
    eventSongTotals.skipped += skipped.length;

    if (skipped.length > 0) {
      warnings.push(`"${event.title}": ${skipped.length} cântico(s) ignorado(s) porque a música já não existe.`);
    }
    if (keptExtra > 0 && toUpsert.length > 0) {
      warnings.push(
        `"${event.title}": tem ${keptExtra} cântico(s) atuais que não constam da cópia e que serão mantidos ` +
        '(o restauro nunca apaga). O alinhamento pode ficar com cânticos a mais — revê o evento depois.'
      );
    }

    let status: PlanStatus;
    let changedFields: string[] = [];
    if (!existing) {
      status = 'create';
    } else {
      changedFields = diffEvent(event, existing);
      if (toUpsert.length > 0) changedFields.push('cânticos');
      status = changedFields.length ? 'update' : 'unchanged';
    }

    return {
      id: event.id,
      title: event.title,
      date: event.date,
      status,
      changedFields,
      eventSongsToUpsert: toUpsert,
      eventSongsCreate: esCreate,
      eventSongsUpdate: esUpdate,
      eventSongsUnchanged: esUnchanged,
      eventSongsSkipped: skipped,
      keptExtraEventSongs: keptExtra,
    };
  });

  const count = (items: { status: PlanStatus }[]): StatusCounts => ({
    create: items.filter(i => i.status === 'create').length,
    update: items.filter(i => i.status === 'update').length,
    unchanged: items.filter(i => i.status === 'unchanged').length,
  });

  const summary = { songs: count(songs), events: count(events), eventSongs: eventSongTotals };
  const isNoop =
    summary.songs.create + summary.songs.update + summary.events.create + summary.events.update === 0 &&
    events.every(e => e.eventSongsToUpsert.length === 0);

  return { songs, events, summary, warnings, isNoop };
}

// ---------------------------------------------------------------------------
// Aplicação
// ---------------------------------------------------------------------------

export type RestoreTable = 'songs' | 'events' | 'event_songs';

export interface RestoreAdapter {
  upsert(table: RestoreTable, rows: Record<string, unknown>[]): Promise<{ error: { message: string } | null }>;
}

export interface RestoreItemResult {
  table: RestoreTable;
  id: string;
  label: string;
  status: Exclude<PlanStatus, 'unchanged'>;
  ok: boolean;
  error?: string;
}

export interface RestoreReport {
  results: RestoreItemResult[];
  okCount: number;
  errorCount: number;
}

export function toSongRow(song: BackupSong, includeCapo = true): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    content: song.content,
    tags: song.tags,
    original_key: song.original_key,
    youtube_url: song.youtube_url,
  };
  if (includeCapo) row.capo = song.capo;
  if (song.created_at) row.created_at = song.created_at;
  return row;
}

export function toEventRow(event: BackupEvent, includeAcclamation = true): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: event.id,
    title: event.title,
    date: event.date,
    location: event.location,
    reader_1: event.reader_1,
    psalmist: event.psalmist,
    reader_2: event.reader_2,
    prayers: event.prayers,
  };
  // Enviado sempre (null quando vazio) para que o restauro também possa limpar o versículo, tal como
  // o diff o conta. BDs sem a migração 020 não têm a coluna: aí é omitido (ver applyRestorePlan)
  if (includeAcclamation) row.gospel_acclamation = event.gospel_acclamation ?? null;
  if (event.created_at) row.created_at = event.created_at;
  return row;
}

export function toEventSongRow(es: BackupEventSong): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: es.id,
    event_id: es.event_id,
    song_id: es.song_id,
    moment_name: es.moment_name,
    order_index: es.order_index,
  };
  // Só se enviam quando existem: cópias antigas (e BDs sem a migração 021) não têm estas colunas
  if (es.transpose_semitones !== null || es.capo !== null) {
    row.transpose_semitones = es.transpose_semitones;
    row.capo = es.capo;
  }
  if (es.notes) row.notes = es.notes;
  return row;
}

const CHUNK_SIZE = 50;

interface PendingItem {
  id: string;
  label: string;
  status: Exclude<PlanStatus, 'unchanged'>;
  row: () => Record<string, unknown>;
}

/**
 * Envia os itens em lotes; se um lote falhar, reenvia item a item para identificar os que falham.
 * Devolve um resultado por item.
 */
async function upsertWithFallback(
  adapter: RestoreAdapter,
  table: RestoreTable,
  items: PendingItem[],
  retryRow?: (message: string) => boolean
): Promise<RestoreItemResult[]> {
  const results: RestoreItemResult[] = [];
  const send = async (batch: PendingItem[]) => {
    let { error } = await adapter.upsert(table, batch.map(it => it.row()));
    // Permite um segundo envio com o payload reconstruído (ex.: coluna capo inexistente)
    if (error && retryRow && retryRow(error.message)) {
      ({ error } = await adapter.upsert(table, batch.map(it => it.row())));
    }
    return error;
  };

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const chunkError = await send(chunk);
    if (!chunkError) {
      chunk.forEach(it => results.push({ table, id: it.id, label: it.label, status: it.status, ok: true }));
      continue;
    }
    if (chunk.length === 1) {
      const it = chunk[0];
      results.push({ table, id: it.id, label: it.label, status: it.status, ok: false, error: chunkError.message });
      continue;
    }
    for (const it of chunk) {
      const error = await send([it]);
      results.push({
        table, id: it.id, label: it.label, status: it.status, ok: !error, ...(error ? { error: error.message } : {}),
      });
    }
  }
  return results;
}

/**
 * Aplica o plano: músicas, depois eventos, depois cânticos de cada evento. Nunca apaga.
 * Cânticos de eventos cuja gravação falhou, ou que apontam para músicas que falharam, são reportados como erro.
 */
export async function applyRestorePlan(
  backup: Backup,
  plan: RestorePlan,
  adapter: RestoreAdapter,
  onProgress?: (message: string) => void
): Promise<RestoreReport> {
  const results: RestoreItemResult[] = [];
  const songsById = new Map(backup.songs.map(s => [s.id, s]));
  const eventsById = new Map(backup.events.map(e => [e.id, e]));

  // 1. Músicas
  let includeCapo = true;
  const songItems: PendingItem[] = plan.songs
    .filter(s => s.status !== 'unchanged' && songsById.has(s.id))
    .map(s => ({
      id: s.id,
      label: s.title,
      status: s.status as Exclude<PlanStatus, 'unchanged'>,
      row: () => toSongRow(songsById.get(s.id)!, includeCapo),
    }));
  if (songItems.length > 0) onProgress?.(`A restaurar ${songItems.length} música(s)...`);
  const songResults = await upsertWithFallback(adapter, 'songs', songItems, message => {
    // Base de dados sem a coluna capo (migração antiga): repetir sem esse campo
    if (includeCapo && message.toLowerCase().includes('capo')) {
      includeCapo = false;
      return true;
    }
    return false;
  });
  results.push(...songResults);
  const failedSongIds = new Set(songResults.filter(r => !r.ok).map(r => r.id));

  // 2. Eventos
  let includeAcclamation = true;
  const eventItems: PendingItem[] = plan.events
    .filter(e => e.status !== 'unchanged' && eventsById.has(e.id))
    // Eventos existentes cuja única alteração são os cânticos não precisam de ser reenviados
    .filter(e => e.status === 'create' || e.changedFields.some(f => f !== 'cânticos'))
    .map(e => ({
      id: e.id,
      label: e.title,
      status: e.status as Exclude<PlanStatus, 'unchanged'>,
      row: () => toEventRow(eventsById.get(e.id)!, includeAcclamation),
    }));
  if (eventItems.length > 0) onProgress?.(`A restaurar ${eventItems.length} evento(s)...`);
  const eventResults = await upsertWithFallback(adapter, 'events', eventItems, message => {
    // Base de dados sem a coluna gospel_acclamation (migração 020 em falta): repetir sem esse campo
    if (includeAcclamation && message.toLowerCase().includes('gospel_acclamation')) {
      includeAcclamation = false;
      return true;
    }
    return false;
  });
  results.push(...eventResults);
  const failedEventIds = new Set(eventResults.filter(r => !r.ok).map(r => r.id));

  // 3. Cânticos de cada evento
  for (const event of plan.events) {
    if (event.eventSongsToUpsert.length === 0) continue;
    onProgress?.(`A restaurar cânticos de "${event.title}"...`);
    const pending: PendingItem[] = [];
    event.eventSongsToUpsert.forEach(({ eventSong: es, status: esStatus }) => {
      const label = `${event.title} — cântico ${es.order_index + 1}`;
      if (failedEventIds.has(event.id)) {
        results.push({ table: 'event_songs', id: es.id, label, status: esStatus, ok: false, error: 'o evento não foi restaurado' });
        return;
      }
      if (failedSongIds.has(es.song_id)) {
        results.push({ table: 'event_songs', id: es.id, label, status: esStatus, ok: false, error: 'a música não foi restaurada' });
        return;
      }
      pending.push({ id: es.id, label, status: esStatus, row: () => toEventSongRow(es) });
    });
    results.push(...(await upsertWithFallback(adapter, 'event_songs', pending)));
  }

  const errorCount = results.filter(r => !r.ok).length;
  return { results, okCount: results.length - errorCount, errorCount };
}
