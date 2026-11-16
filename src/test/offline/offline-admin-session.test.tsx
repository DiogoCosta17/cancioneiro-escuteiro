import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth, ADMIN_PROFILE_STORAGE_KEY } from '../../hooks/useAuth';
import type { Admin } from '../../lib/types';
import * as supabaseModule from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
    },
  },
  isSupabaseConfigured: true,
}));

describe('Sessão de dirigente sem rede (perfil guardado no dispositivo)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

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
