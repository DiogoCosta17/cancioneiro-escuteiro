import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RouteErrorBoundary } from '../../components/common/RouteErrorBoundary';
import { Layout } from '../../components/layout/Layout';
import { 
  saveCachedSongs, 
  getCachedSongs, 
  getCachedSong, 
  saveCachedSong, 
  deleteCachedSong, 
  saveCachedEventDetails, 
  getCachedEventDetails, 
  saveRecentlyViewedSong, 
  getRecentlyViewedSongs 
} from '../../lib/offline-storage';
import { useSongs } from '../../hooks/useSongs';
import { useEvents, useEvent } from '../../hooks/useEvents';
import { AuthProvider, useAuth, ADMIN_PROFILE_STORAGE_KEY } from '../../hooks/useAuth';
import { SongListProvider } from '../../hooks/useSongList';
import type { Song, Event, EventSong, Admin } from '../../lib/types';
import { supabase } from '../../lib/supabase';

// Mock child components that can throw on demand
function FaultyRoute({ crash = false, message = 'Falha crítica no ecrã' }: { crash?: boolean; message?: string }) {
  if (crash) {
    throw new Error(message);
  }
  return <div data-testid="healthy-route">Conteúdo Saudável da Rota</div>;
}

function NonErrorThrower({ throwValue }: { throwValue: any }): React.JSX.Element {
  throw throwValue;
}

function AlternateHealthyRoute() {
  return <div data-testid="alternate-route">Página de Destino Alternativa</div>;
}

describe('Challenger M1: Empirical Resilience, Error Boundaries & Offline Stress Suite', () => {
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    console.error = vi.fn();
    console.warn = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
    console.warn = originalWarn;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CHALLENGE 1: Child Route Errors & RouteErrorBoundary Containment
  // =========================================================================
  describe('Challenge 1: Route Error Containment and Header Interactivity', () => {
    it('catches runtime exception inside child route, keeps Header alive and interactive, and recovers when navigating away', async () => {
      render(
        <MemoryRouter initialEntries={['/crashed']}>
          <SongListProvider>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route path="crashed" element={<FaultyRoute crash={true} message="Erro grave ao renderizar música" />} />
                  <Route path="recuperado" element={<AlternateHealthyRoute />} />
                </Route>
              </Routes>
            </AuthProvider>
          </SongListProvider>
        </MemoryRouter>
      );

      // 1. Verify RouteErrorBoundary caught the crash and shows the fallback UI
      expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
      expect(screen.getByText('Dificuldade ao carregar este ecrã')).toBeInTheDocument();
      expect(screen.getByText(/Erro grave ao renderizar música/)).toBeInTheDocument();

      // 2. Verify Header and its navigation links are still mounted in the document
      const appTitle = screen.getByText('Cancioneiro');
      expect(appTitle).toBeInTheDocument();
      const inicioLink = screen.getByText('Início');
      expect(inicioLink).toBeInTheDocument();

      // 3. Verify RouteErrorBoundary buttons exist
      const retryBtn = screen.getByRole('button', { name: /Tentar de Novo/i });
      const backBtn = screen.getByRole('button', { name: /Voltar Atrás/i });
      expect(retryBtn).toBeInTheDocument();
      expect(backBtn).toBeInTheDocument();

      // 4. Test recovery via navigation: clicking a header link to a healthy page
      // Because key={location.pathname}, navigating automatically resets the ErrorBoundary
      fireEvent.click(inicioLink);
      expect(screen.queryByText('Aviso de Navegação')).toBeNull();
    });

    it('handles non-Error thrown objects (string, object, null) without crashing the error boundary', () => {
      // Test throw "string error"
      const { unmount: unmount1 } = render(
        <MemoryRouter>
          <RouteErrorBoundary>
            <NonErrorThrower throwValue="Exceção em formato de string crua" />
          </RouteErrorBoundary>
        </MemoryRouter>
      );
      expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
      expect(screen.getByText('Dificuldade ao carregar este ecrã')).toBeInTheDocument();
      unmount1();

      // Test throw object { reason: 'custom error' }
      const { unmount: unmount2 } = render(
        <MemoryRouter>
          <RouteErrorBoundary>
            <NonErrorThrower throwValue={{ reason: 'objeto de erro personalizado' }} />
          </RouteErrorBoundary>
        </MemoryRouter>
      );
      expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
      unmount2();

      // Test throw null
      const { unmount: unmount3 } = render(
        <MemoryRouter>
          <RouteErrorBoundary>
            <NonErrorThrower throwValue={null} />
          </RouteErrorBoundary>
        </MemoryRouter>
      );
      expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
      unmount3();
    });

    it('resets error state when clicking "Tentar de Novo"', () => {
      let shouldThrow = true;
      function FlakyChild() {
        if (shouldThrow) {
          throw new Error('Falha passageira');
        }
        return <div data-testid="flaky-success">Agora funcionou!</div>;
      }

      render(
        <MemoryRouter>
          <RouteErrorBoundary>
            <FlakyChild />
          </RouteErrorBoundary>
        </MemoryRouter>
      );

      expect(screen.getByText('Dificuldade ao carregar este ecrã')).toBeInTheDocument();

      // Now heal the child and click Tentar de Novo
      shouldThrow = false;
      const retryBtn = screen.getByRole('button', { name: /Tentar de Novo/i });
      fireEvent.click(retryBtn);

      expect(screen.getByTestId('flaky-success')).toBeInTheDocument();
      expect(screen.getByText('Agora funcionou!')).toBeInTheDocument();
      expect(screen.queryByText('Dificuldade ao carregar este ecrã')).toBeNull();
    });

    it('navigates back when window.history.state.idx > 0 or goes to root when at root history entry', () => {
      const originalHistoryState = window.history.state;

      // 1. Test when history state idx > 0
      window.history.replaceState({ idx: 2 }, '');
      const { unmount } = render(
        <MemoryRouter initialEntries={['/primeira', '/segunda']}>
          <RouteErrorBoundary>
            <FaultyRoute crash={true} />
          </RouteErrorBoundary>
        </MemoryRouter>
      );

      const backBtn = screen.getByRole('button', { name: /Voltar Atrás/i });
      expect(backBtn).toBeInTheDocument();
      fireEvent.click(backBtn);
      unmount();

      // 2. Test when history state is null (default fresh open)
      window.history.replaceState(null, '');
      render(
        <MemoryRouter initialEntries={['/erro-isolado']}>
          <RouteErrorBoundary>
            <FaultyRoute crash={true} />
          </RouteErrorBoundary>
        </MemoryRouter>
      );
      const backBtnRoot = screen.getByRole('button', { name: /Voltar Atrás/i });
      fireEvent.click(backBtnRoot);

      // Also test "Ir para a Página Inicial"
      const homeBtn = screen.getByRole('button', { name: /Ir para a Página Inicial/i });
      fireEvent.click(homeBtn);

      // Restore history state
      window.history.replaceState(originalHistoryState, '');
    });
  });

  // =========================================================================
  // CHALLENGE 2: IndexedDB Blocked, Disabled, or Failing -> LocalStorage Fallback
  // =========================================================================
  describe('Challenge 2: IndexedDB Blocked or Disabled -> LocalStorage Fallback', () => {
    const sampleSongs: Song[] = [
      {
        id: 's-alpha',
        title: 'Canção da Alvorada',
        artist: 'Patrulha Águia',
        content: '[G]O sol já desponta',
        tags: ['alvorada'],
        original_key: 'G',
        created_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      {
        id: 's-beta',
        title: 'Bênção da Noite',
        artist: 'Clã',
        content: '[D]A noite caiu',
        tags: ['noite'],
        original_key: 'D',
        created_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];

    const sampleEvent: Event = {
      id: 'evt-acampamento-2026',
      title: 'Grande Acampamento de Verão',
      date: '2026-07-20T09:00:00Z',
      location: 'Serra da Estrela',
      created_at: '2026-01-01',
    };

    const sampleEventSongs: EventSong[] = [
      {
        id: 'es-1',
        event_id: 'evt-acampamento-2026',
        song_id: 's-alpha',
        moment_name: 'Alvorada',
        order_index: 1,
        song: sampleSongs[0],
      },
    ];

    it('falls back to localStorage when window.indexedDB throws SecurityError on open', async () => {
      const originalIndexedDB = window.indexedDB;
      // @ts-expect-error test mock
      window.indexedDB = {
        open: vi.fn().mockImplementation(() => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }),
      };

      try {
        // 1. Save songs should not throw; it logs a warning and stores in localStorage
        await expect(saveCachedSongs(sampleSongs)).resolves.not.toThrow();

        // 2. Get songs should read from localStorage fallback
        const loadedSongs = await getCachedSongs();
        expect(loadedSongs.length).toBe(2);
        // Alphabetical order: Bênção da Noite before Canção da Alvorada
        expect(loadedSongs[0].title).toBe('Bênção da Noite');
        expect(loadedSongs[1].title).toBe('Canção da Alvorada');

        // 3. Get single song by ID
        const single = await getCachedSong('s-alpha');
        expect(single).not.toBeNull();
        expect(single?.title).toBe('Canção da Alvorada');

        // 4. Update single song
        await saveCachedSong({ ...sampleSongs[0], title: 'Canção da Alvorada Modificada' });
        const updated = await getCachedSong('s-alpha');
        expect(updated?.title).toBe('Canção da Alvorada Modificada');

        // 5. Delete single song
        await deleteCachedSong('s-alpha');
        const remaining = await getCachedSongs();
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe('s-beta');
      } finally {
        window.indexedDB = originalIndexedDB;
      }
    });

    it('saves and retrieves event details via localStorage fallback when IndexedDB is blocked', async () => {
      const originalIndexedDB = window.indexedDB;
      // @ts-expect-error test mock
      window.indexedDB = {
        open: vi.fn().mockImplementation(() => {
          throw new DOMException('IndexedDB is disabled', 'UnknownError');
        }),
      };

      try {
        await expect(saveCachedEventDetails(sampleEvent, sampleEventSongs)).resolves.not.toThrow();

        const cached = await getCachedEventDetails('evt-acampamento-2026');
        expect(cached).not.toBeNull();
        expect(cached?.event.id).toBe('evt-acampamento-2026');
        expect(cached?.event.title).toBe('Grande Acampamento de Verão');
        expect(cached?.eventSongs.length).toBe(1);
        expect(cached?.eventSongs[0].song?.title).toBe('Canção da Alvorada');
        expect(typeof cached?.cachedAt).toBe('number');

        // Defensive checks: null/empty inputs
        await expect(saveCachedEventDetails(null as any, [])).resolves.not.toThrow();
        const nonExistent = await getCachedEventDetails('nao-existe');
        expect(nonExistent).toBeNull();
        const emptyQuery = await getCachedEventDetails('');
        expect(emptyQuery).toBeNull();
      } finally {
        window.indexedDB = originalIndexedDB;
      }
    });

    it('survives corrupted JSON in localStorage for event details and recently viewed', async () => {
      // Corrupt event detail key
      localStorage.setItem('cancioneiro_cached_event_detail_corrupt-id', '{corrupt-json-here');
      const corruptedEvent = await getCachedEventDetails('corrupt-id');
      expect(corruptedEvent).toBeNull();

      // Corrupt recently viewed key
      localStorage.setItem('scout_recently_viewed', 'not-valid-json');
      const corruptedRecently = getRecentlyViewedSongs();
      expect(corruptedRecently).toEqual([]);

      // Non-array recently viewed key
      localStorage.setItem('scout_recently_viewed', '{"foo": "bar"}');
      const nonArrayRecently = getRecentlyViewedSongs();
      expect(nonArrayRecently).toEqual([]);
    });

    it('manages recently viewed songs with LRU ordering, 30-entry cap, and quota resilience', () => {
      // 1. Add 35 songs
      for (let i = 1; i <= 35; i++) {
        saveRecentlyViewedSong({
          id: `song-${i}`,
          title: `Música Número ${i}`,
          content: 'Letra',
          tags: [],
          original_key: 'C',
          created_by: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        });
      }

      const history = getRecentlyViewedSongs();
      // Must be capped at exactly 30 entries
      expect(history.length).toBe(30);
      // Most recent should be song-35
      expect(history[0].id).toBe('song-35');
      // Oldest retained should be song-6 (songs 1 to 5 dropped)
      expect(history[29].id).toBe('song-6');

      // 2. Re-visiting song-10 should move it to the very top (index 0)
      saveRecentlyViewedSong({
        id: 'song-10',
        title: 'Música Número 10',
        content: 'Letra',
        tags: [],
        original_key: 'C',
        created_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const updatedHistory = getRecentlyViewedSongs();
      expect(updatedHistory.length).toBe(30);
      expect(updatedHistory[0].id).toBe('song-10');

      // 3. Defensive check: null/undefined song
      expect(() => saveRecentlyViewedSong(null as any)).not.toThrow();
      expect(() => saveRecentlyViewedSong({ id: '' } as any)).not.toThrow();

      // 4. QuotaExceeded resilience
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn().mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

      // Must not throw uncaught error
      expect(() => {
        saveRecentlyViewedSong({
          id: 'song-quota',
          title: 'Música Quota',
          content: 'Letra',
          tags: [],
          original_key: 'C',
          created_by: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        });
      }).not.toThrow();

      Storage.prototype.setItem = originalSetItem;
    });
  });

  // =========================================================================
  // CHALLENGE 3: Supabase Network Request Hangs or Times Out
  // =========================================================================
  describe('Challenge 3: Supabase Network Request Hangs and Timeout Fallback', () => {
    it('withTimeout rejects reliably when a Promise hangs longer than specified ms', async () => {
      // Direct stress verification of timeout logic
      async function withTimeout<T>(
        promiseOrFactory: PromiseLike<T> | (() => PromiseLike<T>),
        ms = 100,
        errorMessage = 'Tempo limite excedido'
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

      // Test 1: Hanging promise
      const hungPromise = new Promise((resolve) => setTimeout(resolve, 5000));
      await expect(withTimeout(hungPromise, 50, 'Timeout disparado!')).rejects.toThrow('Timeout disparado!');

      // Test 2: Fast resolving promise
      const fastPromise = Promise.resolve('dados rápidos');
      await expect(withTimeout(fastPromise, 500)).resolves.toBe('dados rápidos');

      // Test 3: Rejecting promise before timeout
      const failingPromise = Promise.reject(new Error('Erro nativo'));
      await expect(withTimeout(failingPromise, 500)).rejects.toThrow('Erro nativo');

      // Test 4: Factory function argument
      await expect(withTimeout(() => Promise.resolve(42), 100)).resolves.toBe(42);
    });

    it('useSongs serves cached songs when Supabase network query times out or fails', async () => {
      // 1. Pre-seed offline cache with songs
      const preCachedSongs: Song[] = [
        {
          id: 'cached-1',
          title: 'Hino da Flor de Lis (Offline)',
          artist: 'B.P.',
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
          artist: 'B.P.',
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
});
