import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Song, SongFormData } from '../lib/types';
import { fetchAllRows } from '../lib/fetch-all-rows';
import { 
  getCachedSongs, 
  saveCachedSongs, 
  getCachedSong, 
  saveCachedSong, 
  deleteCachedSong,
  saveRecentlyViewedSong,
  markAsCachedCopy
} from '../lib/offline-storage';

// Cache em memória ao nível do módulo para carregamento síncrono e preservação do DOM em transições de página
let memoryCachedSongs: Song[] = [];
let memoryLoaded = false;

// Pedido de rede partilhado entre todas as instâncias do hook (CommandPalette, Home, Song, ...)
// para não descarregar a tabela completa de cânticos várias vezes em cada navegação.
let inflightSongsRequest: Promise<Song[] | null> | null = null;
let lastNetworkFetchAt = 0;
const SONGS_REFRESH_INTERVAL_MS = 60 * 1000;

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

function requestSongsFromNetwork(): Promise<Song[] | null> {
  if (!inflightSongsRequest) {
    inflightSongsRequest = (async () => {
      if (!supabase) throw new Error('Supabase não inicializado');

      // Todas as páginas (o Supabase limita a 1000 linhas por pedido); o tempo limite aplica-se à
      // primeira página. A ordem por título é feita no cliente (a paginação usa a coluna única `id`).
      const rows = await fetchAllRows<Song>('songs', '*', {
        firstPageTimeoutMs: 3500,
        timeoutMessage: 'Tempo limite ao carregar lista de músicas',
      });

      const freshSongs = [...rows].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      memoryCachedSongs = freshSongs;
      memoryLoaded = true;
      lastNetworkFetchAt = Date.now();
      // Guardar silenciosamente na cache offline (IndexedDB + localStorage)
      saveCachedSongs(freshSongs).catch(console.warn);
      return freshSongs;
    })().finally(() => {
      inflightSongsRequest = null;
    });
  }
  return inflightSongsRequest;
}

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>(memoryCachedSongs);
  const [loading, setLoading] = useState(!memoryLoaded && memoryCachedSongs.length === 0);
  const [error, setError] = useState<Error | null>(null);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const isMounted = useRef(true);
  const songsRef = useRef(songs);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  // 1. Carregamento inicial instantâneo a partir da cache offline
  useEffect(() => {
    isMounted.current = true;

    async function initFromCache() {
      if (memoryCachedSongs.length > 0) {
        setSongs(memoryCachedSongs);
        setLoading(false);
        return;
      }

      try {
        const cached = await getCachedSongs();
        if (cached && cached.length > 0 && isMounted.current) {
          memoryCachedSongs = cached;
          memoryLoaded = true;
          setSongs(cached);
          setLoading(false);
        }
      } catch (e) {
        console.warn('Erro ao carregar cânticos da cache:', e);
      }
    }

    initFromCache();

    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchSongs = useCallback(async (force = false) => {
    // Lista obtida da rede há pouco tempo: reutilizar a memória em vez de voltar a descarregar tudo
    if (!force && lastNetworkFetchAt > 0 && Date.now() - lastNetworkFetchAt < SONGS_REFRESH_INTERVAL_MS) {
      if (isMounted.current) {
        setSongs(memoryCachedSongs);
        setError(null);
        setIsOfflineData(false);
        setLoading(false);
      }
      return;
    }

    try {
      const freshSongs = await requestSongsFromNetwork();

      if (freshSongs && isMounted.current) {
        setSongs(freshSongs);
        setError(null);
        setIsOfflineData(false);
      }
    } catch (err) {
      console.warn('Falha na rede ou offline ao obter cânticos:', err);
      // Tentar recuperar da cache se o estado ainda estiver vazio
      const cached = await getCachedSongs();
      if (cached && cached.length > 0 && isMounted.current) {
        memoryCachedSongs = cached;
        memoryLoaded = true;
        setSongs(cached);
        setIsOfflineData(true);
        setError(null); // Não mostrar erro fatal porque temos os dados offline!
      } else if (isMounted.current && memoryCachedSongs.length === 0) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar músicas'));
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchSongs();

    // Sincronizar automaticamente quando a rede voltar
    const handleOnline = () => {
      fetchSongs(true);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [fetchSongs]);

  const getSong = useCallback(async (id: string): Promise<Song | null> => {
    if (!id) return null;

    // 1. Tentar primeiro na memória
    const foundInMemory = memoryCachedSongs.find(s => s.id === id) || songsRef.current.find(s => s.id === id);
    if (foundInMemory) {
      // Se tivermos na memória e não houver rede, devolve logo
      if (!navigator.onLine) {
        saveRecentlyViewedSong(foundInMemory);
        return markAsCachedCopy(foundInMemory);
      }
    }

    // 2. Se houver rede, tentar obter a versão mais recente do Supabase com timeout resiliente
    if (navigator.onLine && supabase) {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('songs')
            .select('*')
            .eq('id', id)
            .single(),
          3500,
          'Tempo limite ao carregar música'
        );

        if (!error && data) {
          const freshSong = data as Song;
          saveCachedSong(freshSong).catch(console.warn);
          saveRecentlyViewedSong(freshSong);
          return freshSong;
        }
      } catch (err) {
        console.warn('Erro ao obter música online, a tentar cache offline:', err);
      }
    }

    // 3. Fallback para IndexedDB / LocalStorage
    try {
      const cached = await getCachedSong(id);
      if (cached) {
        saveRecentlyViewedSong(cached);
        return markAsCachedCopy(cached);
      }
    } catch (e) {
      console.warn('Erro ao ler música da cache offline:', e);
    }

    if (foundInMemory) {
      saveRecentlyViewedSong(foundInMemory);
      return markAsCachedCopy(foundInMemory);
    }

    return null;
  }, []);

  const createSong = useCallback(async (data: SongFormData): Promise<{ data: Song | null; error: Error | null }> => {
    if (!supabase) throw new Error('Supabase not initialized');
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const insertPayload: Record<string, any> = {
        ...data,
        capo: data.capo ? Number(data.capo) : null,
        created_by: user?.id || null
      };

      let { data: newSong, error } = await supabase
        .from('songs')
        .insert([insertPayload])
        .select()
        .single();

      // Fallback gracioso se a migração 014 (coluna capo) ainda não tiver sido executada no Supabase
      if (error && error.message && error.message.includes('capo')) {
        console.warn("Aviso: coluna 'capo' ainda não detetada no Supabase. A guardar sem campo capo...");
        delete insertPayload.capo;
        const retry = await supabase
          .from('songs')
          .insert([insertPayload])
          .select()
          .single();
        newSong = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      const created = newSong as Song;
      setSongs(prev => {
        const updated = [...prev, created].sort((a, b) => a.title.localeCompare(b.title));
        memoryCachedSongs = updated;
        saveCachedSongs(updated).catch(console.warn);
        return updated;
      });
      return { data: created, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Erro ao criar música') };
    }
  }, []);

  /**
   * Atualiza uma música. Com `expectedUpdatedAt` (o `updated_at` exato da cópia que foi aberta no editor)
   * a gravação é otimista: só se aplica se a linha não mudou entretanto; caso contrário devolve um erro
   * de conflito e nada é gravado (evita sobrescrever edições mais recentes de outra pessoa).
   */
  const updateSong = useCallback(async (
    id: string,
    data: SongFormData,
    expectedUpdatedAt?: string | null
  ): Promise<{ data: Song | null; error: Error | null }> => {
    if (!supabase) throw new Error('Supabase not initialized');
    try {
      const updatePayload: Record<string, any> = {
        ...data,
        capo: data.capo ? Number(data.capo) : null,
      };

      const runUpdate = async () => {
        let query = supabase!
          .from('songs')
          .update(updatePayload)
          .eq('id', id);
        // Usa exatamente a string devolvida pelo Supabase (timestamptz com microssegundos)
        if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);
        return query.select();
      };

      let { data: rows, error } = await runUpdate();

      // Fallback gracioso se a migração 014 (coluna capo) ainda não tiver sido executada no Supabase
      if (error && error.message && error.message.includes('capo')) {
        console.warn("Aviso: coluna 'capo' ainda não detetada no Supabase. A atualizar sem campo capo...");
        delete updatePayload.capo;
        const retry = await runUpdate();
        rows = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      const updatedSong = Array.isArray(rows) ? rows[0] : rows;
      if (!updatedSong) {
        throw new Error(
          expectedUpdatedAt
            ? 'Esta música foi alterada por outra pessoa entretanto. Recarrega a página para veres a versão mais recente (guarda antes uma cópia do teu texto, se precisares).'
            : 'Não foi possível atualizar a música (já não existe ou sem permissão).'
        );
      }
      const updated = updatedSong as Song;
      setSongs(prev => {
        const newSongs = prev.map(s => s.id === id ? updated : s);
        const sorted = newSongs.sort((a, b) => a.title.localeCompare(b.title));
        memoryCachedSongs = sorted;
        saveCachedSongs(sorted).catch(console.warn);
        return sorted;
      });
      
      return { data: updated, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Erro ao atualizar música') };
    }
  }, []);

  const deleteSong = useCallback(async (id: string): Promise<{ error: Error | null }> => {
    if (!supabase) throw new Error('Supabase not initialized');
    try {
      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setSongs(prev => {
        const filtered = prev.filter(s => s.id !== id);
        memoryCachedSongs = filtered;
        saveCachedSongs(filtered).catch(console.warn);
        deleteCachedSong(id).catch(console.warn);
        return filtered;
      });
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Erro ao apagar música') };
    }
  }, []);

  const searchSongs = useCallback((query: string): Song[] => {
    if (!query || !query.trim()) return songs;
    
    const lowerQuery = query.toLowerCase().trim();
    return songs.filter(song => {
      if (!song) return false;
      const title = (song.title || '').toLowerCase();
      if (title.includes(lowerQuery)) return true;

      const artist = (song.artist || '').toLowerCase();
      if (artist && artist.includes(lowerQuery)) return true;

      const tagsMatch = Array.isArray(song.tags) && song.tags.some(t => typeof t === 'string' && t.toLowerCase().includes(lowerQuery));
      if (tagsMatch) return true;

      const content = (song.content || '').toLowerCase();
      return content.includes(lowerQuery);
    });
  }, [songs]);

  return {
    songs,
    loading,
    error,
    isOfflineData,
    fetchSongs,
    getSong,
    createSong,
    updateSong,
    deleteSong,
    searchSongs,
  };
}
