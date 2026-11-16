import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { waitFor, renderHook, act } from '@testing-library/react';
import { saveCachedSongs, saveCachedEventDetails, getRecentlyViewedSongs } from '../../lib/offline-storage';
import { useSongs } from '../../hooks/useSongs';
import { useEvents, useEvent } from '../../hooks/useEvents';
import { AuthProvider, useAuth, ADMIN_PROFILE_STORAGE_KEY } from '../../hooks/useAuth';
import type { Song, Event, EventSong, Admin } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { setMockOnline } from '../setup';

// O Supabase falha ou nunca responde: os hooks têm de servir a cópia local sem ficar presos a carregar
describe('Hooks sem rede (Supabase falha ou não responde)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('useSongs serves cached songs when Supabase network query times out or fails', async () => {
    // 1. Pre-seed offline cache with songs
    const preCachedSongs: Song[] = [
      {
        id: 'cached-1',
        title: 'Hino da Flor de Lis (Offline)',
        artist: 'Grupo de Teste',
        content: '[C]Flor de lis',
        tags: ['escutistas'],
        original_key: 'C',
        created_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];
    await saveCachedSongs(preCachedSongs);

    // 2. Mock supabase to fail/timeout immediately on fetch
    vi.spyOn(supabase!, 'from').mockImplementation((table: string): any => {
      if (table === 'songs') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockRejectedValue(new Error('Tempo limite ao carregar lista de músicas')),
          }),
        };
      }
      return {} as any;
    });

    // 3. Render hook
    const { result } = renderHook(() => useSongs());

    await waitFor(() => {
      expect(result.current.songs.length).toBe(1);
      expect(result.current.songs[0].title).toBe('Hino da Flor de Lis (Offline)');
      expect(result.current.isOfflineData).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });

  it('useSongs getSong returns cached song and saves to recently viewed when offline or network fails', async () => {
    const sampleSong: Song = {
      id: 'song-offline-get',
      title: 'Cântico do Adeus',
      artist: 'CNE',
      content: '[C]Adeus amigos',
      tags: ['despedida'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    await saveCachedSongs([sampleSong]);

    // Mock supabase to throw network error on all song queries
    vi.spyOn(supabase!, 'from').mockImplementation((table: string): any => {
      if (table === 'songs') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockRejectedValue(new Error('Network timeout on list')),
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockRejectedValue(new Error('Network timeout on single')),
            }),
          }),
        };
      }
      return {} as any;
    });

    const { result } = renderHook(() => useSongs());

    // Call getSong
    let fetched: any = null;
    await act(async () => {
      fetched = await result.current.getSong('song-offline-get');
    });

    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Cântico do Adeus');

    // Verify it was recorded into recently viewed
    const recently = getRecentlyViewedSongs();
    expect(recently.some(s => s.id === 'song-offline-get')).toBe(true);
  });

  it('useSongs getSong com o browser sem rede usa a cópia local e nem tenta o Supabase', async () => {
    await saveCachedSongs([
      {
        id: 'song-sem-rede',
        title: 'Cântico Guardado',
        artist: null,
        content: '[D]Sempre em frente',
        tags: [],
        original_key: 'D',
        created_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]);
    const single = vi.fn();
    vi.spyOn(supabase!, 'from').mockImplementation((): any => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockRejectedValue(new Error('offline')),
        eq: vi.fn().mockReturnValue({ single }),
      }),
    }));

    setMockOnline(false);
    try {
      const { result } = renderHook(() => useSongs());
      let fetched: Song | null = null;
      await act(async () => {
        fetched = await result.current.getSong('song-sem-rede');
      });

      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe('Cântico Guardado');
      expect(single).not.toHaveBeenCalled();
      expect(getRecentlyViewedSongs()[0].id).toBe('song-sem-rede');
    } finally {
      setMockOnline(true);
    }
  });

  it('useEvents serves cached events when Supabase fetchEvents hangs and times out', async () => {
    // 1. Seed offline events cache
    const cachedEvents: Event[] = [
      {
        id: 'evt-cached-1',
        title: 'Conselho de Guias (Offline)',
        date: '2026-04-10T15:00:00Z',
        location: 'Sede Mafra',
        created_at: '2026-01-01',
      },
    ];
    localStorage.setItem('cancioneiro_cached_events', JSON.stringify(cachedEvents));

    // 2. Mock supabase hanging
    vi.spyOn(supabase!, 'from').mockImplementation((table: string): any => {
      if (table === 'events') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue(new Promise(() => {})), // hangs
          }),
        };
      }
      return {} as any;
    });

    const { result } = renderHook(() => useEvents());

    // On mount, useEvents immediately reads from cache:
    await waitFor(() => {
      expect(result.current.events.length).toBe(1);
      expect(result.current.events[0].title).toBe('Conselho de Guias (Offline)');
    });
  });

  it('useEvent serves cached event details immediately on mount without blank delay', async () => {
    const cachedEvent: Event = {
      id: 'evt-detalhe-1',
      title: 'Missa do Agrupamento',
      date: '2026-05-01T10:00:00Z',
      location: 'Igreja',
      created_at: '2026-01-01',
    };
    const cachedSongs: EventSong[] = [
      {
        id: 'es-100',
        event_id: 'evt-detalhe-1',
        song_id: 's-100',
        moment_name: 'Entrada',
        order_index: 1,
        song: {
          id: 's-100',
          title: 'Cântico de Entrada',
          content: '[C]Entremos com alegria',
          tags: ['entrada'],
          original_key: 'C',
          created_by: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      },
    ];

    // Save into cache
    await saveCachedEventDetails(cachedEvent, cachedSongs);

    // Mock supabase to hang forever
    vi.spyOn(supabase!, 'from').mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue(new Promise(() => {})), // hangs
          order: vi.fn().mockReturnValue(new Promise(() => {})), // hangs
        }),
      }),
    } as any));

    const { result } = renderHook(() => useEvent('evt-detalhe-1'));

    // Should load from cache immediately
    await waitFor(() => {
      expect(result.current.event).not.toBeNull();
      expect(result.current.event?.title).toBe('Missa do Agrupamento');
      expect(result.current.eventSongs.length).toBe(1);
      expect(result.current.eventSongs[0].moment_name).toBe('Entrada');
    });
  });

  it('useAuth preserves cached admin profile when Supabase admin check hangs or errors', async () => {
    const cachedAdminProfile: Admin = {
      id: 'admin-offline-id',
      user_id: 'user-offline-123',
      name: 'Chefe de Agrupamento',
      email: 'chefe@mafra488.pt',
      role: 'super_admin',
      created_at: '2026-01-01',
    };

    // Seed cached profile
    localStorage.setItem(
      ADMIN_PROFILE_STORAGE_KEY,
      JSON.stringify({
        profile: cachedAdminProfile,
        userId: 'user-offline-123',
        timestamp: Date.now(),
      })
    );

    // Mock session returning the same user
    vi.spyOn(supabase!.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-offline-123', email: 'chefe@mafra488.pt' } as any,
        } as any,
      },
      error: null,
    });

    // Mock admins table query hanging
    vi.spyOn(supabase!, 'from').mockImplementation((table: string): any => {
      if (table === 'admins') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockReturnValue(new Promise(() => {})), // hangs
            }),
          }),
        };
      }
      return {} as any;
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    // Profile should be loaded synchronously on mount from storage
    expect(result.current.adminProfile).not.toBeNull();
    expect(result.current.adminProfile?.name).toBe('Chefe de Agrupamento');
    expect(result.current.isAdmin).toBe(true);
  });

  it('useSongs recovers from an indefinite network hang via 3500ms timeout and serves cached songs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const preCachedSongs: Song[] = [
      {
        id: 'timeout-cached-1',
        title: 'Cântico do Monte (Cache)',
        artist: 'Grupo de Teste',
        content: '[C]No monte',
        tags: ['fogo'],
        original_key: 'C',
        created_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];
    await saveCachedSongs(preCachedSongs);

    // Hanging query that never resolves
    vi.spyOn(supabase!, 'from').mockImplementation((table: string): any => {
      if (table === 'songs') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue(new Promise(() => {})), // indefinite hang
          }),
        };
      }
      return {} as any;
    });

    const { result } = renderHook(() => useSongs());

    // Advance timers past 3500ms and flush microtasks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.songs.length).toBe(1);
    expect(result.current.songs[0].title).toBe('Cântico do Monte (Cache)');
    expect(result.current.isOfflineData).toBe(true);
    expect(result.current.error).toBeNull();

    vi.useRealTimers();
  });
});
