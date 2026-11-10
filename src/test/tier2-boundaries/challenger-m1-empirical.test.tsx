import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import {
  saveRecentlyViewedSong,
  getRecentlyViewedSongs,
  saveCachedEventDetails,
  getCachedEventDetails,
} from '../../lib/offline-storage';
import { AuthProvider, useAuth, ADMIN_PROFILE_STORAGE_KEY } from '../../hooks/useAuth';
import type { Song, Event, EventSong, Admin } from '../../lib/types';
import * as supabaseModule from '../../lib/supabase';

// Mock Supabase module to allow precise control over responses and network failures
vi.mock('../../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        getUser: vi.fn(),
      },
    },
    isSupabaseConfigured: true,
  };
});

describe('Challenger M1 Empirical Stress Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Service Worker & PWA Configuration Empirical Verification
  // =========================================================================
  describe('1. Service Worker & Workbox Runtime Caching Verification', () => {
    const swPath = path.resolve(process.cwd(), 'dist/sw.js');

    it('generated dist/sw.js exists and contains Workbox registration code', () => {
      expect(fs.existsSync(swPath)).toBe(true);
      const swContent = fs.readFileSync(swPath, 'utf-8');
      expect(swContent.length).toBeGreaterThan(100);
      expect(swContent).toContain('registerRoute');
    });

    it('does not cache Supabase REST responses in the service worker (offline data lives in IndexedDB)', () => {
      const swContent = fs.readFileSync(swPath, 'utf-8');

      // Uma cache NetworkFirst da API devolvia dados antigos como frescos em redes lentas
      expect(swContent).not.toContain('supabase-api-cache');
      // (o chunk "vendor-supabase-*.js" é pré-cache normal; o que não pode existir é uma rota para o domínio)
      expect(swContent).not.toMatch(/supabase\\?\.co/);
      expect(swContent).not.toContain('NetworkFirst');
    });

    it('configures asset caching for images and web fonts', () => {
      const swContent = fs.readFileSync(swPath, 'utf-8');

      // Images cache: StaleWhileRevalidate
      expect(swContent).toContain('images-assets-cache');
      expect(swContent).toContain('StaleWhileRevalidate');

      // Fonts cache: CacheFirst
      expect(swContent).toContain('google-fonts-cache');
      expect(swContent).toContain('CacheFirst');
    });

    it('configures SPA offline navigation fallback to index.html', () => {
      const swContent = fs.readFileSync(swPath, 'utf-8');
      expect(swContent).toContain('NavigationRoute');
      expect(swContent).toContain('index.html');
    });
  });

  // =========================================================================
  // 2. Recently Viewed Songs History Empirical Stress Test
  // =========================================================================
  describe('2. Recently Viewed Songs History Stress Test', () => {
    const makeSong = (id: string, title: string, artist?: string): Song => ({
      id,
      title,
      artist: artist || null,
      content: '[C]La la la',
      tags: ['geral'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    it('saves multiple songs and maintains MRU order (newest first)', () => {
      saveRecentlyViewedSong(makeSong('s1', 'Primeiro Cântico'));
      saveRecentlyViewedSong(makeSong('s2', 'Segundo Cântico'));
      saveRecentlyViewedSong(makeSong('s3', 'Terceiro Cântico'));

      const list = getRecentlyViewedSongs();
      expect(list.length).toBe(3);
      expect(list[0].id).toBe('s3');
      expect(list[1].id).toBe('s2');
      expect(list[2].id).toBe('s1');
    });

    it('re-viewing an existing song moves it to index 0 without duplicating', () => {
      saveRecentlyViewedSong(makeSong('s1', 'Cântico 1'));
      saveRecentlyViewedSong(makeSong('s2', 'Cântico 2'));
      saveRecentlyViewedSong(makeSong('s3', 'Cântico 3'));

      // Re-view song 1
      saveRecentlyViewedSong(makeSong('s1', 'Cântico 1'));

      const list = getRecentlyViewedSongs();
      expect(list.length).toBe(3);
      expect(list[0].id).toBe('s1');
      expect(list[1].id).toBe('s3');
      expect(list[2].id).toBe('s2');
    });

    it('strictly enforces the max 30 entry limit under heavy load', () => {
      // Add 40 distinct songs
      for (let i = 1; i <= 40; i++) {
        saveRecentlyViewedSong(makeSong(`song-${i}`, `Cântico ${i}`));
      }

      const list = getRecentlyViewedSongs();
      expect(list.length).toBe(30);

      // Most recent should be song-40 at index 0
      expect(list[0].id).toBe('song-40');
      // Oldest retained should be song-11 at index 29 (40 - 30 + 1 = 11)
      expect(list[29].id).toBe('song-11');

      // The first 10 songs (song-1 through song-10) should have been pruned
      for (let i = 1; i <= 10; i++) {
        expect(list.some(s => s.id === `song-${i}`)).toBe(false);
      }
    });

    it('safely handles invalid, null, undefined or empty song inputs', () => {
      // Calling with null/undefined must not throw
      expect(() => saveRecentlyViewedSong(null as any)).not.toThrow();
      expect(() => saveRecentlyViewedSong(undefined as any)).not.toThrow();
      expect(() => saveRecentlyViewedSong({} as any)).not.toThrow();
      expect(() => saveRecentlyViewedSong({ id: '' } as any)).not.toThrow();

      expect(getRecentlyViewedSongs()).toEqual([]);

      // Song with missing title or artist
      const partialSong: any = { id: 'partial-1' };
      saveRecentlyViewedSong(partialSong);

      const list = getRecentlyViewedSongs();
      expect(list.length).toBe(1);
      expect(list[0].id).toBe('partial-1');
      expect(list[0].title).toBe('');
      expect(list[0].artist).toBeUndefined();
    });

    it('recovers gracefully from corrupted localStorage data in scout_recently_viewed', () => {
      // 1. Broken JSON syntax
      localStorage.setItem('scout_recently_viewed', '{malformed-json');
      expect(getRecentlyViewedSongs()).toEqual([]);

      // 2. Primitive JSON value
      localStorage.setItem('scout_recently_viewed', '12345');
      expect(getRecentlyViewedSongs()).toEqual([]);

      // 3. String "null"
      localStorage.setItem('scout_recently_viewed', 'null');
      expect(getRecentlyViewedSongs()).toEqual([]);

      // 4. Array containing non-object or incomplete items
      localStorage.setItem(
        'scout_recently_viewed',
        JSON.stringify([
          null,
          undefined,
          123,
          'string',
          {},
          { id: 123 }, // id not string
          { id: 'ok-1', title: 999 }, // title not string
          { id: 'ok-2', title: 'Cântico Válido', viewedAt: 123456 },
        ])
      );

      const recovered = getRecentlyViewedSongs();
      expect(recovered.length).toBe(1);
      expect(recovered[0].id).toBe('ok-2');
      expect(recovered[0].title).toBe('Cântico Válido');
    });

    it('handles localStorage QuotaExceededError without crashing', () => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn().mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => saveRecentlyViewedSong(makeSong('quota-song', 'Música'))).not.toThrow();

      Storage.prototype.setItem = originalSetItem;
      warnSpy.mockRestore();
    });
  });

  // =========================================================================
  // 3. Event Details Caching Empirical Stress Test
  // =========================================================================
  describe('3. Event Details Caching Stress Test', () => {
    const sampleEvent: Event = {
      id: 'event-m1',
      title: 'Acampamento de Patrulha',
      date: '2026-06-20T10:00:00Z',
      location: 'Serra de Sintra',
      created_at: '2026-01-01T00:00:00Z',
    };

    const sampleEventSongs: EventSong[] = [
      {
        id: 'es-1',
        event_id: 'event-m1',
        song_id: 'song-1',
        moment_name: 'Fogo de Conselho',
        order_index: 0,
        song: {
          id: 'song-1',
          title: 'Hino da Flor de Lis',
          artist: 'CNE',
          content: '[C]Avante',
          tags: ['escutismo'],
          original_key: 'C',
          created_by: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      },
    ];

    it('saves and retrieves event details with event songs', async () => {
      await saveCachedEventDetails(sampleEvent, sampleEventSongs);
      const cached = await getCachedEventDetails('event-m1');

      expect(cached).not.toBeNull();
      expect(cached?.event.id).toBe('event-m1');
      expect(cached?.event.title).toBe('Acampamento de Patrulha');
      expect(cached?.eventSongs.length).toBe(1);
      expect(cached?.eventSongs[0].moment_name).toBe('Fogo de Conselho');
      expect(cached?.cachedAt).toBeGreaterThan(0);
    });

    it('returns null for non-existent or invalid event IDs', async () => {
      const resultEmpty = await getCachedEventDetails('');
      expect(resultEmpty).toBeNull();

      const resultNotFound = await getCachedEventDetails('non-existent-event-id');
      expect(resultNotFound).toBeNull();
    });

    it('handles corrupted localStorage event details gracefully', async () => {
      localStorage.setItem('cancioneiro_cached_event_detail_bad-event', '{broken-json');
      const result = await getCachedEventDetails('bad-event');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // 4. Offline Admin Session Resilience Empirical Stress Test
  // =========================================================================
  describe('4. Offline Admin Session Resilience Stress Test', () => {
    const mockAdminProfile: Admin = {
      id: 'admin-123',
      user_id: 'admin-123',
      name: 'Chefe de Agrupamento',
      email: 'chefe@escutas.pt',
      role: 'super_admin',
      created_at: '2026-01-01T00:00:00Z',
    };

    const mockAdminUser = {
      id: 'admin-123',
      email: 'chefe@escutas.pt',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    };

    function AuthTestConsumer() {
      const { user, adminProfile, isAdmin, loading, logout } = useAuth();
      return (
        <div>
          <span data-testid="loading-status">{loading ? 'loading' : 'ready'}</span>
          <span data-testid="is-admin">{isAdmin ? 'yes' : 'no'}</span>
          <span data-testid="admin-name">{adminProfile?.name || 'none'}</span>
          <span data-testid="admin-role">{adminProfile?.role || 'none'}</span>
          <span data-testid="user-id">{user?.id || 'anonymous'}</span>
          <button data-testid="logout-btn" onClick={() => logout()}>
            Sair
          </button>
        </div>
      );
    }

    it('initializes adminProfile immediately from local cache preventing offline UI flicker', async () => {
      // Pre-seed local cache
      localStorage.setItem(
        ADMIN_PROFILE_STORAGE_KEY,
        JSON.stringify({
          profile: mockAdminProfile,
          userId: 'admin-123',
          timestamp: Date.now(),
        })
      );

      // Setup getSession to return the logged-in user
      const mockSupabase = supabaseModule.supabase as any;
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockAdminUser } },
        error: null,
      });

      // Mock from('admins') to hang or fail (simulating offline timeout)
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockRejectedValue(new Error('Failed to fetch (offline simulation)')),
          }),
        }),
      });

      render(
        <AuthProvider>
          <AuthTestConsumer />
        </AuthProvider>
      );

      // Before async resolves: adminProfile should already be present from cache!
      expect(screen.getByTestId('is-admin')).toHaveTextContent('yes');
      expect(screen.getByTestId('admin-name')).toHaveTextContent('Chefe de Agrupamento');
      expect(screen.getByTestId('admin-role')).toHaveTextContent('super_admin');

      // Wait for async auth resolution
      await act(async () => {
        await Promise.resolve();
      });

      // After network failure/offline error: admin privileges MUST still be retained!
      expect(screen.getByTestId('is-admin')).toHaveTextContent('yes');
      expect(screen.getByTestId('admin-name')).toHaveTextContent('Chefe de Agrupamento');
      expect(screen.getByTestId('admin-role')).toHaveTextContent('super_admin');
    });

    it('does NOT grant admin rights if a DIFFERENT user logs in than the cached admin', async () => {
      // Cache belongs to admin-123
      localStorage.setItem(
        ADMIN_PROFILE_STORAGE_KEY,
        JSON.stringify({
          profile: mockAdminProfile,
          userId: 'admin-123',
          timestamp: Date.now(),
        })
      );

      const regularUser = {
        id: 'regular-user-456',
        email: 'pioneiro@escutas.pt',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2026-01-01T00:00:00Z',
      };

      const mockSupabase = supabaseModule.supabase as any;
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: regularUser } },
        error: null,
      });

      // Query returns null (not an admin)
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      render(
        <AuthProvider>
          <AuthTestConsumer />
        </AuthProvider>
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Must NOT inherit admin rights
      expect(screen.getByTestId('is-admin')).toHaveTextContent('no');
      expect(screen.getByTestId('admin-name')).toHaveTextContent('none');
    });

    it('clears admin cache and permissions upon explicit logout', async () => {
      localStorage.setItem(
        ADMIN_PROFILE_STORAGE_KEY,
        JSON.stringify({
          profile: mockAdminProfile,
          userId: 'admin-123',
          timestamp: Date.now(),
        })
      );

      const mockSupabase = supabaseModule.supabase as any;
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockAdminUser } },
        error: null,
      });
      mockSupabase.auth.signOut.mockResolvedValue({ error: null });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockAdminProfile, error: null }),
          }),
        }),
      });

      render(
        <AuthProvider>
          <AuthTestConsumer />
        </AuthProvider>
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByTestId('is-admin')).toHaveTextContent('yes');

      // Click logout
      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      // Admin rights and cache should be purged
      expect(screen.getByTestId('is-admin')).toHaveTextContent('no');
      expect(localStorage.getItem(ADMIN_PROFILE_STORAGE_KEY)).toBeNull();
    });
  });

  // =========================================================================
  // 5. Hooks Offline Resilience & History Integration
  // =========================================================================
  describe('5. Hooks Offline Resilience & History Integration', () => {
    it('getSong offline retrieves from cache and records into recently viewed songs', async () => {
      const testSong: Song = {
        id: 'offline-song-99',
        title: 'Cântico do Fogo',
        artist: 'Chefe João',
        content: '[D]Fogo, arde [A]bem',
        tags: ['fogo'],
        original_key: 'D',
        created_by: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const { saveCachedSongs } = await import('../../lib/offline-storage');
      await saveCachedSongs([testSong]);

      // Mock supabase to return error on fetchSongs
      const mockSupabase = supabaseModule.supabase as any;
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockRejectedValue(new Error('Network offline')),
        }),
      });

      // Set offline mode
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      const { useSongs } = await import('../../hooks/useSongs');

      let capturedSong: any = null;
      let onComplete: () => void;
      const completedPromise = new Promise<void>((resolve) => {
        onComplete = resolve;
      });

      function SongConsumer() {
        const { getSong } = useSongs();
        return (
          <button
            data-testid="load-song-btn"
            onClick={async () => {
              capturedSong = await getSong('offline-song-99');
              onComplete();
            }}
          >
            Carregar
          </button>
        );
      }

      render(<SongConsumer />);

      await act(async () => {
        screen.getByTestId('load-song-btn').click();
        await completedPromise;
      });

      expect(capturedSong).not.toBeNull();
      expect(capturedSong?.id).toBe('offline-song-99');
      expect(capturedSong?.title).toBe('Cântico do Fogo');

      // Verify it was recorded in recently viewed history!
      const recentlyViewed = getRecentlyViewedSongs();
      expect(recentlyViewed.length).toBe(1);
      expect(recentlyViewed[0].id).toBe('offline-song-99');
      expect(recentlyViewed[0].title).toBe('Cântico do Fogo');

      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
    });
  });

  // =========================================================================
  // 6. RouteErrorBoundary Key Reset on Pathname Change
  // =========================================================================
  describe('6. RouteErrorBoundary Navigation Reset', () => {
    it('resets error state when navigating to another route via key={location.pathname}', async () => {
      const { MemoryRouter, Routes, Route, Link, Outlet } = await import('react-router-dom');
      const { RouteErrorBoundary } = await import('../../components/common/RouteErrorBoundary');

      function BrokenRoute(): React.JSX.Element {
        throw new Error('Erro na rota danificada');
      }

      function SafeRoute() {
        return <div data-testid="safe-view">Vista Segura da Página Inicial</div>;
      }

      function LayoutShell() {
        return (
          <div>
            <nav>
              <Link data-testid="home-link" to="/safe">
                Início
              </Link>
            </nav>
            <main>
              <RouteErrorBoundary>
                <Outlet />
              </RouteErrorBoundary>
            </main>
          </div>
        );
      }

      // Suppress expected console.error from error boundary catch
      const originalConsoleError = console.error;
      console.error = vi.fn();

      render(
        <MemoryRouter initialEntries={['/broken']}>
          <Routes>
            <Route element={<LayoutShell />}>
              <Route path="/broken" element={<BrokenRoute />} />
              <Route path="/safe" element={<SafeRoute />} />
            </Route>
          </Routes>
        </MemoryRouter>
      );

      // Verify boundary caught error and shows scout recovery screen
      expect(screen.getByText('Dificuldade ao carregar este ecrã')).toBeInTheDocument();
      expect(screen.getByText(/Erro na rota danificada/)).toBeInTheDocument();

      // Navigate to safe route
      await act(async () => {
        screen.getByTestId('home-link').click();
      });

      // Boundary key changed with pathname -> successfully recovered and rendered safe route!
      expect(screen.getByTestId('safe-view')).toBeInTheDocument();
      expect(screen.queryByText('Dificuldade ao carregar este ecrã')).not.toBeInTheDocument();

      console.error = originalConsoleError;
    });
  });
});

