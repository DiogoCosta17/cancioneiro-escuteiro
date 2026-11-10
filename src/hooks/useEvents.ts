import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Event, EventSong, Song } from '../lib/types';
import { 
  getCachedEvents, 
  saveCachedEvents, 
  getCachedEventDetails, 
  saveCachedEventDetails,
  getOfflineEventRecords,
  saveEventForOffline,
  unmarkEventOffline,
  OFFLINE_EVENTS_CHANGED_EVENT,
  OfflineEventRecord,
} from '../lib/offline-storage';

async function withTimeout<T>(
  promiseOrFactory: PromiseLike<T> | (() => PromiseLike<T>),
  ms = 3500,
  errorMessage = 'Tempo limite de ligação excedido'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);
  });

  try {
    const promise = typeof promiseOrFactory === 'function' ? promiseOrFactory() : promiseOrFactory;
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Obtém da rede o evento e os seus cânticos (com o conteúdo completo de cada música). */
export async function fetchEventSnapshot(eventId: string): Promise<{ event: Event; eventSongs: EventSong[] }> {
  if (!supabase) throw new Error('Supabase indisponível');

  // Fetch event details with resilient timeout
  const { data: eventData, error: eventError } = await withTimeout(
    supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single(),
    3500,
    'Tempo limite ao carregar detalhes do evento'
  );

  if (eventError) throw eventError;

  // Fetch event songs with joined song data with resilient timeout
  const { data: songsData, error: songsError } = await withTimeout(
    supabase
      .from('event_songs')
      // '*' (e não uma lista de colunas): continua a funcionar antes de a migração 021 ser aplicada
      .select('*, songs (*)')
      .eq('event_id', eventId)
      .order('order_index', { ascending: true }),
    3500,
    'Tempo limite ao carregar cânticos do evento'
  );

  if (songsError) throw songsError;

  // Map the joined data correctly
  const formattedSongs: EventSong[] = (songsData || []).map(item => ({
    id: item.id,
    event_id: item.event_id,
    song_id: item.song_id,
    moment_name: item.moment_name,
    order_index: item.order_index,
    transpose_semitones: item.transpose_semitones ?? null,
    capo: item.capo ?? null,
    notes: item.notes ?? null,
    song: Array.isArray(item.songs) ? item.songs[0] : item.songs
  }));

  return { event: eventData as Event, eventSongs: formattedSongs };
}

export function useEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchEvents = useCallback(async () => {
    try {
      if (!supabase) throw new Error('Supabase indisponível');
      setLoading(true);
      const { data, error: supabaseError } = await withTimeout(
        supabase
          .from('events')
          .select('*')
          .order('date', { ascending: false }),
        3500,
        'Tempo limite ao carregar lista de eventos'
      );

      if (supabaseError) throw supabaseError;
      const list = data || [];
      if (isMounted.current) {
        setEvents(list);
        setError(null);
      }
      saveCachedEvents(list).catch(console.warn);
    } catch (err) {
      console.warn('Erro ao carregar eventos online, a tentar cache offline:', err);
      const cached = await getCachedEvents();
      if (isMounted.current) {
        if (cached && cached.length > 0) {
          setEvents(cached);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : 'Erro ao carregar eventos');
        }
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    // Carregar primeiro da cache se houver para renderização instantânea
    async function loadCache() {
      try {
        const cached = await getCachedEvents();
        if (cached && cached.length > 0 && isMounted.current) {
          setEvents(cached);
          setLoading(false);
        }
      } catch (e) {
        console.warn('Erro ao carregar eventos da cache:', e);
      }
    }

    loadCache();
    fetchEvents();

    return () => {
      isMounted.current = false;
    };
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}

export function useEvent(id: string | undefined) {
  const [event, setEvent] = useState<Event | null>(null);
  const [eventSongs, setEventSongs] = useState<EventSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  // Evento atualmente pedido: ignora respostas tardias de um evento anterior (navegação entre eventos)
  const currentIdRef = useRef<string | undefined>(id);

  const fetchEventData = useCallback(async (eventId: string) => {
    const isCurrent = () => isMounted.current && currentIdRef.current === eventId;
    try {
      setLoading(true);
      const { event: eventData, eventSongs: formattedSongs } = await fetchEventSnapshot(eventId);

      if (isCurrent()) {
        setEvent(eventData);
        setEventSongs(formattedSongs);
        setError(null);
      }

      // Guardar na cache offline (IndexedDB + localStorage)
      saveCachedEventDetails(eventData, formattedSongs).catch(console.warn);
    } catch (err) {
      console.warn('Erro ao carregar evento online, a recorrer à cache offline:', err);
      // Tentar recuperar da cache offline
      const cached = await getCachedEventDetails(eventId);
      if (isCurrent()) {
        if (cached && cached.event) {
          setEvent(cached.event);
          setEventSongs(cached.eventSongs || []);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : 'Erro ao carregar evento');
        }
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    currentIdRef.current = id;

    if (id) {
      // 1. Tentar carregar imediatamente da cache offline para UX instantânea sem ecrã branco
      getCachedEventDetails(id)
        .then(cached => {
          if (cached && cached.event && isMounted.current && currentIdRef.current === id) {
            setEvent(cached.event);
            setEventSongs(cached.eventSongs || []);
            setLoading(false);
          }
        })
        .catch(console.warn);

      fetchEventData(id);
    }

    return () => {
      isMounted.current = false;
    };
  }, [id, fetchEventData]);

  return { event, eventSongs, loading, error, refetch: () => id && fetchEventData(id) };
}

// ==========================================
// GUARDAR EVENTO PARA OFFLINE
// ==========================================

/** Obtém um único cântico da rede (usado quando o conteúdo não está na cache local). */
async function fetchSongFromNetwork(songId: string): Promise<Song | null> {
  if (!supabase) return null;
  const { data, error } = await withTimeout(
    supabase.from('songs').select('*').eq('id', songId).maybeSingle(),
    5000,
    'Tempo limite ao carregar cântico'
  );
  if (error) throw error;
  return (data as Song | null) || null;
}

/** Eventos disponíveis offline neste dispositivo; atualiza entre componentes e separadores. */
export function useOfflineEventRecords(): Record<string, OfflineEventRecord> {
  const [records, setRecords] = useState<Record<string, OfflineEventRecord>>(() => getOfflineEventRecords());

  useEffect(() => {
    const refresh = () => setRecords(getOfflineEventRecords());
    window.addEventListener(OFFLINE_EVENTS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(OFFLINE_EVENTS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return records;
}

/** Espera (com limite) por um service worker ativo, i.e. com a app (todos os ficheiros JS) já em cache. */
async function waitForServiceWorker(ms: number): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>(resolve => {
      timer = setTimeout(() => resolve(false), ms);
    });
    const ready = navigator.serviceWorker.ready.then(reg => Boolean(reg && reg.active));
    const result = await Promise.race([ready, timeout]);
    if (timer) clearTimeout(timer);
    return result;
  } catch {
    return false;
  }
}

export type OfflineSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useOfflineEventSave(event: Event | null, eventSongs: EventSong[]) {
  const records = useOfflineEventRecords();
  const eventId = event?.id;
  const record = eventId ? records[eventId] || null : null;
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Se a cache local tiver sido limpa, retirar a marca "Disponível offline"
  useEffect(() => {
    if (!eventId || !record) return;
    let cancelled = false;
    getCachedEventDetails(eventId)
      .then(details => {
        if (!cancelled && !details) unmarkEventOffline(eventId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, record]);

  const save = useCallback(async () => {
    if (!event || saving) return;
    setSaving(true);
    setError(null);
    setWarning(null);
    setProgress(null);

    try {
      // 1. Versão mais recente do evento (se houver rede); senão usa a que está no ecrã
      let snapshot = { event, eventSongs };
      if (typeof navigator === 'undefined' || navigator.onLine) {
        try {
          snapshot = await fetchEventSnapshot(event.id);
        } catch (err) {
          console.warn('Sem acesso à versão online do evento, a guardar a versão local:', err);
        }
      }

      // 2. Evento + conteúdo completo de cada cântico no armazenamento local (verificado)
      await saveEventForOffline(snapshot.event, snapshot.eventSongs, {
        fetchSong: fetchSongFromNetwork,
        onProgress: (done, total) => {
          if (isMounted.current) setProgress({ done, total });
        },
      });

      // 3. Carregar já os ecrãs de impressão (carregados a pedido) para ficarem prontos sem rede
      await Promise.allSettled([import('../pages/EventPrint'), import('../pages/SongPrint')]);

      // 4. Pedir ao browser para não apagar o armazenamento local (melhor esforço)
      try {
        await navigator.storage?.persist?.();
      } catch {
        // Ignorar
      }

      // 5. A app em si só abre sem rede se o service worker já tiver tudo em cache
      if (import.meta.env.PROD) {
        const swReady = await waitForServiceWorker(5000);
        if (!swReady && isMounted.current) {
          setWarning(
            'Os cânticos ficaram guardados, mas a aplicação ainda está a preparar o modo offline. Mantém-na aberta com rede mais uns segundos (ou instala-a) antes de ficares sem ligação.'
          );
        }
      }
    } catch (err) {
      console.warn('Erro ao guardar evento para offline:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Não foi possível guardar o evento para offline.');
      }
    } finally {
      if (isMounted.current) {
        setSaving(false);
        setProgress(null);
      }
    }
  }, [event, eventSongs, saving]);

  const status: OfflineSaveStatus = saving ? 'saving' : error ? 'error' : record ? 'saved' : 'idle';

  return { status, record, progress, error, warning, save };
}
