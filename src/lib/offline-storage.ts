import { Song, Event, EventSong } from './types';

const DB_NAME = 'cancioneiro_offline_db';
const DB_VERSION = 2;
const STORE_SONGS = 'songs';
const STORE_EVENTS = 'events';
const STORE_EVENT_DETAILS = 'event_details';
const STORE_META = 'metadata';

const LOCAL_STORAGE_SONGS_KEY = 'cancioneiro_cached_songs';
const LOCAL_STORAGE_EVENTS_KEY = 'cancioneiro_cached_events';
const LOCAL_STORAGE_EVENT_DETAILS_PREFIX = 'cancioneiro_cached_event_detail_';
const LOCAL_STORAGE_RECENTLY_VIEWED = 'scout_recently_viewed';
const LOCAL_STORAGE_LAST_SYNC = 'cancioneiro_last_sync_time';

export interface EventDetailCache {
  event: Event;
  eventSongs: EventSong[];
  cachedAt: number;
}

export interface RecentlyViewedSong {
  id: string;
  title: string;
  artist?: string;
  viewedAt: number;
}

function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB indisponível'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SONGS)) {
        db.createObjectStore(STORE_SONGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_EVENT_DETAILS)) {
        db.createObjectStore(STORE_EVENT_DETAILS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ==========================================
// CÂNTICOS (SONGS) CACHE
// ==========================================

export async function saveCachedSongs(songs: Song[]): Promise<void> {
  // 1. Tentar IndexedDB primeiro
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_SONGS, STORE_META], 'readwrite');
    const songStore = tx.objectStore(STORE_SONGS);
    const metaStore = tx.objectStore(STORE_META);

    // Limpar loja anterior e inserir novas
    await new Promise<void>((resolve, reject) => {
      const clearReq = songStore.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => reject(clearReq.error);
    });

    for (const song of songs) {
      songStore.put(song);
    }

    const now = new Date().toISOString();
    metaStore.put({ key: 'last_sync_songs', value: now, count: songs.length });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Erro ao guardar cânticos no IndexedDB, a usar fallback localStorage:', err);
  }

  // 2. Sempre manter também cópia rápida em localStorage como garantia
  try {
    localStorage.setItem(LOCAL_STORAGE_SONGS_KEY, JSON.stringify(songs));
    localStorage.setItem(LOCAL_STORAGE_LAST_SYNC, new Date().toISOString());
  } catch (e) {
    // quota exceeded se o storage estiver cheio
    console.warn('LocalStorage quota limit ao guardar cânticos:', e);
  }
}

export async function getCachedSongs(): Promise<Song[]> {
  // 1. Tentar carregar do IndexedDB
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SONGS, 'readonly');
    const store = tx.objectStore(STORE_SONGS);

    const songs = await new Promise<Song[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as Song[]) || []);
      req.onerror = () => reject(req.error);
    });

    if (songs && songs.length > 0) {
      return songs.sort((a, b) => a.title.localeCompare(b.title));
    }
  } catch (err) {
    console.warn('Erro ao ler do IndexedDB, a tentar fallback localStorage:', err);
  }

  // 2. Fallback para localStorage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SONGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a: Song, b: Song) => a.title.localeCompare(b.title));
      }
    }
  } catch (e) {
    console.warn('Erro ao ler do localStorage:', e);
  }

  return [];
}

export async function getCachedSong(id: string): Promise<Song | null> {
  // 1. IndexedDB
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SONGS, 'readonly');
    const store = tx.objectStore(STORE_SONGS);

    const song = await new Promise<Song | null>((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as Song) || null);
      req.onerror = () => reject(req.error);
    });

    if (song) return song;
  } catch {
    // Ignorar e ir para fallback
  }

  // 2. LocalStorage fallback
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SONGS_KEY);
    if (raw) {
      const parsed: Song[] = JSON.parse(raw);
      const found = parsed.find(s => s.id === id);
      if (found) return found;
    }
  } catch {
    // Ignore
  }

  // 3. Cânticos guardados juntamente com eventos descarregados para offline
  // (garante a música mesmo que a loja de cânticos seja reescrita por uma sincronização parcial)
  try {
    for (const eventId of Object.keys(getOfflineEventRecords())) {
      const details = await getCachedEventDetails(eventId);
      const match = details?.eventSongs.find(es => es?.song?.id === id && hasSongContent(es.song));
      if (match?.song) return match.song;
    }
  } catch {
    // Ignore
  }

  return null;
}

export async function saveCachedSong(song: Song): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SONGS, 'readwrite');
    const store = tx.objectStore(STORE_SONGS);
    store.put(song);
  } catch {
    // Fallback
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SONGS_KEY);
    if (raw) {
      const list: Song[] = JSON.parse(raw);
      const idx = list.findIndex(s => s.id === song.id);
      if (idx >= 0) {
        list[idx] = song;
      } else {
        list.push(song);
      }
      localStorage.setItem(LOCAL_STORAGE_SONGS_KEY, JSON.stringify(list));
    }
  } catch {
    // Ignore
  }
}

// Cópias de cânticos devolvidas a partir da cache (e não de um pedido à rede). O editor usa isto
// para avisar que a cópia pode estar desatualizada. WeakSet: não impede a recolha de lixo.
const cachedCopies = new WeakSet<object>();

export function markAsCachedCopy<T extends object>(song: T): T {
  cachedCopies.add(song);
  return song;
}

export function isCachedSongCopy(song: object | null | undefined): boolean {
  return Boolean(song && cachedCopies.has(song));
}

/** Remove um cântico apagado dos detalhes de eventos em cache (IndexedDB + localStorage). */
async function removeSongFromCachedEventDetails(songId: string): Promise<void> {
  const prune = (eventSongs: EventSong[] | undefined): EventSong[] | null => {
    if (!Array.isArray(eventSongs)) return null;
    const kept = eventSongs.filter(es => es?.song_id !== songId && es?.song?.id !== songId);
    return kept.length === eventSongs.length ? null : kept;
  };

  // 1. IndexedDB: percorrer todos os detalhes guardados
  try {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORE_EVENT_DETAILS)) {
      const tx = db.transaction(STORE_EVENT_DETAILS, 'readwrite');
      const store = tx.objectStore(STORE_EVENT_DETAILS);
      const records = await new Promise<any[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      for (const record of records) {
        const kept = prune(record?.eventSongs);
        if (kept) store.put({ ...record, eventSongs: kept });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
  } catch (err) {
    console.warn('Erro ao limpar cântico apagado dos detalhes de eventos (IndexedDB):', err);
  }

  // 2. localStorage: chaves com o prefixo dos detalhes de evento
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_STORAGE_EVENT_DETAILS_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const kept = prune(parsed?.eventSongs);
      if (kept) localStorage.setItem(key, JSON.stringify({ ...parsed, eventSongs: kept }));
    }
  } catch (e) {
    console.warn('Erro ao limpar cântico apagado dos detalhes de eventos (localStorage):', e);
  }
}

export async function deleteCachedSong(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SONGS, 'readwrite');
    const store = tx.objectStore(STORE_SONGS);
    store.delete(id);
  } catch {
    // Fallback
  }

  // Os detalhes de eventos guardados offline também embebem o cântico: sem isto a página do evento
  // continuaria a mostrar (e a abrir) um cântico que já foi apagado
  await removeSongFromCachedEventDetails(id);

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SONGS_KEY);
    if (raw) {
      const list: Song[] = JSON.parse(raw);
      const filtered = list.filter(s => s.id !== id);
      localStorage.setItem(LOCAL_STORAGE_SONGS_KEY, JSON.stringify(filtered));
    }
  } catch {
    // Ignore
  }
}

// ==========================================
// EVENTOS (EVENTS) CACHE
// ==========================================

export async function saveCachedEvents(events: Event[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_EVENTS, 'readwrite');
    const store = tx.objectStore(STORE_EVENTS);
    store.clear();
    for (const evt of events) {
      store.put(evt);
    }
  } catch {
    // Fallback
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_EVENTS_KEY, JSON.stringify(events));
  } catch {
    // Ignore
  }
}

export async function getCachedEvents(): Promise<Event[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_EVENTS, 'readonly');
    const store = tx.objectStore(STORE_EVENTS);

    const events = await new Promise<Event[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as Event[]) || []);
      req.onerror = () => reject(req.error);
    });

    if (events && events.length > 0) return events;
  } catch {
    // Fallback
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EVENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Cache corrompida (ex.: objeto em vez de lista) não pode chegar a `events.map`
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore
  }

  return [];
}

export function getLastSyncTime(): string | null {
  try {
    return localStorage.getItem(LOCAL_STORAGE_LAST_SYNC);
  } catch {
    return null;
  }
}

// ==========================================
// DETALHES DE EVENTOS (EVENT DETAILS) CACHE
// ==========================================

export async function saveCachedEventDetails(event: Event, eventSongs: EventSong[]): Promise<void> {
  if (!event || !event.id) return;

  const payload: EventDetailCache & { id: string } = {
    id: event.id,
    event,
    eventSongs,
    cachedAt: Date.now(),
  };

  // 1. IndexedDB
  try {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORE_EVENT_DETAILS)) {
      const tx = db.transaction(STORE_EVENT_DETAILS, 'readwrite');
      const store = tx.objectStore(STORE_EVENT_DETAILS);
      store.put(payload);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  } catch (err) {
    console.warn('Erro ao guardar detalhes do evento no IndexedDB:', err);
  }

  // 2. LocalStorage fallback
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_EVENT_DETAILS_PREFIX}${event.id}`,
      JSON.stringify(payload)
    );
  } catch (e) {
    console.warn('Erro ao guardar detalhes do evento no localStorage:', e);
  }
}

export async function getCachedEventDetails(eventId: string): Promise<EventDetailCache | null> {
  if (!eventId) return null;

  // 1. IndexedDB
  try {
    const db = await openDB();
    if (db.objectStoreNames.contains(STORE_EVENT_DETAILS)) {
      const tx = db.transaction(STORE_EVENT_DETAILS, 'readonly');
      const store = tx.objectStore(STORE_EVENT_DETAILS);

      const record = await new Promise<any>((resolve, reject) => {
        const req = store.get(eventId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });

      if (record && record.event) {
        return {
          event: record.event,
          eventSongs: record.eventSongs || [],
          cachedAt: record.cachedAt || Date.now(),
        };
      }
    }
  } catch (err) {
    console.warn('Erro ao ler detalhes do evento no IndexedDB, a tentar localStorage:', err);
  }

  // 2. LocalStorage fallback
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_EVENT_DETAILS_PREFIX}${eventId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.event) {
        return {
          event: parsed.event,
          eventSongs: parsed.eventSongs || [],
          cachedAt: parsed.cachedAt || Date.now(),
        };
      }
    }
  } catch (e) {
    console.warn('Erro ao ler detalhes do evento no localStorage:', e);
  }

  return null;
}

// ==========================================
// CÂNTICOS RECENTEMENTE VISTOS (RECENTLY VIEWED)
// ==========================================

const MAX_RECENTLY_VIEWED = 30;

export function getRecentlyViewedSongs(): RecentlyViewedSong[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_RECENTLY_VIEWED);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentlyViewedSong =>
        Boolean(item && typeof item.id === 'string' && typeof item.title === 'string')
    );
  } catch (e) {
    console.warn('Erro ao ler músicas recentemente vistas:', e);
    return [];
  }
}

export function saveRecentlyViewedSong(song: Song): void {
  if (!song || !song.id) return;
  try {
    const current = getRecentlyViewedSongs();
    const filtered = current.filter(item => item.id !== song.id);
    const newEntry: RecentlyViewedSong = {
      id: song.id,
      title: song.title || '',
      artist: song.artist || undefined,
      viewedAt: Date.now(),
    };
    const updated = [newEntry, ...filtered].slice(0, MAX_RECENTLY_VIEWED);
    localStorage.setItem(LOCAL_STORAGE_RECENTLY_VIEWED, JSON.stringify(updated));
  } catch (e) {
    console.warn('Erro ao guardar música recentemente vista:', e);
  }
}

// ==========================================
// EVENTOS DESCARREGADOS PARA OFFLINE ("Guardar offline")
// ==========================================

const LOCAL_STORAGE_OFFLINE_EVENTS = 'cancioneiro_offline_events_v1';
export const OFFLINE_EVENTS_CHANGED_EVENT = 'cancioneiro:offline-events-changed';
const MAX_OFFLINE_EVENTS = 200;

export interface OfflineEventRecord {
  eventId: string;
  savedAt: number;
  songCount: number;
}

function hasSongContent(song: Song | null | undefined): song is Song {
  return Boolean(song && typeof song.id === 'string' && typeof song.content === 'string');
}

/** Eventos marcados como disponíveis offline neste dispositivo (validados). */
export function getOfflineEventRecords(): Record<string, OfflineEventRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_OFFLINE_EVENTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, OfflineEventRecord> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const rec = value as Partial<OfflineEventRecord> | null;
      if (
        rec &&
        typeof rec === 'object' &&
        rec.eventId === key &&
        typeof rec.savedAt === 'number' &&
        Number.isFinite(rec.savedAt) &&
        typeof rec.songCount === 'number'
      ) {
        result[key] = { eventId: key, savedAt: rec.savedAt, songCount: rec.songCount };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getOfflineEventRecord(eventId: string): OfflineEventRecord | null {
  return getOfflineEventRecords()[eventId] || null;
}

function writeOfflineEventRecords(records: Record<string, OfflineEventRecord>): void {
  // Limitar o número de registos (mantém os mais recentes)
  const entries = Object.values(records)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_OFFLINE_EVENTS);
  const trimmed: Record<string, OfflineEventRecord> = {};
  for (const rec of entries) trimmed[rec.eventId] = rec;
  localStorage.setItem(LOCAL_STORAGE_OFFLINE_EVENTS, JSON.stringify(trimmed));
  try {
    window.dispatchEvent(new window.Event(OFFLINE_EVENTS_CHANGED_EVENT));
  } catch {
    // Ignorar
  }
}

export function markEventOffline(record: OfflineEventRecord): void {
  const records = getOfflineEventRecords();
  records[record.eventId] = record;
  writeOfflineEventRecords(records);
}

export function unmarkEventOffline(eventId: string): void {
  try {
    const records = getOfflineEventRecords();
    if (!records[eventId]) return;
    delete records[eventId];
    writeOfflineEventRecords(records);
  } catch {
    // Ignorar
  }
}

/**
 * Insere/atualiza cânticos na cache SEM apagar os restantes (ao contrário de saveCachedSongs).
 * Espera pela conclusão da transação para que o resultado possa ser verificado.
 */
export async function upsertCachedSongs(songs: Song[]): Promise<void> {
  const valid = songs.filter(hasSongContent);
  if (valid.length === 0) return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SONGS, 'readwrite');
    const store = tx.objectStore(STORE_SONGS);
    for (const song of valid) store.put(song);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Erro ao guardar cânticos do evento no IndexedDB:', err);
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SONGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: Song[] = Array.isArray(parsed) ? parsed : [];
    const byId = new Map(list.filter(s => s && typeof s.id === 'string').map(s => [s.id, s]));
    for (const song of valid) byId.set(song.id, song);
    localStorage.setItem(LOCAL_STORAGE_SONGS_KEY, JSON.stringify(Array.from(byId.values())));
  } catch (e) {
    // Quota cheia: os detalhes do evento (com o conteúdo das músicas) continuam a servir de reserva
    console.warn('LocalStorage cheio ao guardar cânticos do evento:', e);
  }
}

export interface SaveEventOfflineOptions {
  /** Obtém da rede um cântico cujo conteúdo não esteja disponível localmente */
  fetchSong?: (id: string) => Promise<Song | null>;
  /** Progresso: cânticos processados / total */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Guarda um evento para utilização sem rede: detalhes do evento + conteúdo completo
 * de todos os seus cânticos. Verifica a leitura no fim; só marca o evento como
 * disponível offline se tudo puder ser lido de volta. Lança erro (em pt-PT) caso contrário.
 */
export async function saveEventForOffline(
  event: Event,
  eventSongs: EventSong[],
  options: SaveEventOfflineOptions = {}
): Promise<OfflineEventRecord> {
  const { fetchSong, onProgress } = options;
  if (!event || !event.id) throw new Error('Evento inválido.');

  const list = (Array.isArray(eventSongs) ? eventSongs : []).filter(
    (es): es is EventSong => Boolean(es && typeof es === 'object')
  );

  // Cânticos com música associada (entradas cuja música foi apagada ficam de fora)
  const songIds: string[] = [];
  const fromEvent = new Map<string, Song>();
  for (const es of list) {
    const id = es.song?.id;
    if (!id) continue;
    if (!fromEvent.has(id)) {
      songIds.push(id);
      fromEvent.set(id, es.song as Song);
    }
  }

  const total = songIds.length;
  onProgress?.(0, total);

  const resolved = new Map<string, Song>();
  const missing: string[] = [];
  let done = 0;

  for (const id of songIds) {
    let song: Song | null = fromEvent.get(id) || null;
    if (!hasSongContent(song)) {
      try {
        song = await getCachedSong(id);
      } catch {
        song = null;
      }
    }
    if (!hasSongContent(song) && fetchSong) {
      try {
        song = await fetchSong(id);
      } catch {
        song = null;
      }
    }
    if (hasSongContent(song)) {
      resolved.set(id, song);
    } else {
      missing.push(fromEvent.get(id)?.title || id);
    }
    done++;
    onProgress?.(done, total);
  }

  if (missing.length > 0) {
    throw new Error(
      `Não foi possível obter ${missing.length === 1 ? 'o cântico' : `${missing.length} cânticos`}: ${missing.join(', ')}. Verifica a ligação e tenta de novo.`
    );
  }

  const songs = Array.from(resolved.values());
  await upsertCachedSongs(songs);

  const completeEventSongs = list.map(es => {
    const id = es.song?.id;
    return id && resolved.has(id) ? { ...es, song: resolved.get(id) } : es;
  });
  await saveCachedEventDetails(event, completeEventSongs);

  // Verificação: o evento e o conteúdo de cada cântico têm de ser legíveis do armazenamento local
  const stored = await getCachedEventDetails(event.id);
  if (!stored || !stored.event) {
    throw new Error('Não foi possível guardar o evento neste dispositivo (armazenamento indisponível ou cheio).');
  }
  const storedIds = new Set(
    stored.eventSongs.filter(es => hasSongContent(es?.song)).map(es => (es.song as Song).id)
  );
  const notStored = songs.filter(s => !storedIds.has(s.id));
  if (notStored.length > 0) {
    throw new Error('O armazenamento do dispositivo está cheio: alguns cânticos não ficaram guardados.');
  }

  const record: OfflineEventRecord = { eventId: event.id, savedAt: Date.now(), songCount: songs.length };
  try {
    markEventOffline(record);
  } catch {
    throw new Error('Não foi possível registar o evento como disponível offline (armazenamento bloqueado).');
  }
  return record;
}
