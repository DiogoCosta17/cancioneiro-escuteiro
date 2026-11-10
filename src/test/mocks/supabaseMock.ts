import { vi } from 'vitest';
import type { Song, Event } from '../../lib/types';

export function createMockSupabase(initialSongs: Song[] = [], initialEvents: Event[] = []) {
  let songs = [...initialSongs];
  let events = [...initialEvents];

  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(() => Promise.resolve({ data: songs, error: null })),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => Promise.resolve({ data: songs[0] || null, error: null })),
    insert: vi.fn().mockImplementation((records: any[]) => {
      const inserted = records.map((r, i) => ({ id: r.id || `gen-id-${i}`, ...r }));
      songs.push(...inserted);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: inserted[0], error: null }),
        }),
      };
    }),
    update: vi.fn().mockImplementation((updatePayload: any) => ({
      eq: vi.fn().mockImplementation((_col: string, id: string) => {
        const idx = songs.findIndex((s) => s.id === id);
        if (idx !== -1) {
          songs[idx] = { ...songs[idx], ...updatePayload };
        }
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: songs[idx] || null, error: null }),
          }),
        };
      }),
    })),
    delete: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockImplementation((_col: string, id: string) => {
        songs = songs.filter((s) => s.id !== id);
        return Promise.resolve({ error: null });
      }),
    })),
  };

  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'songs') return mockQueryBuilder;
      if (table === 'events') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: events, error: null }),
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: events[0] || null, error: null }),
            }),
          }),
        };
      }
      return mockQueryBuilder;
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'mock-user-1', email: 'chefe@escutas.pt' } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'mock-user-1' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: 'mock-user-1' } }, error: null }),
    },
    _getSongs: () => songs,
    _setSongs: (newSongs: Song[]) => { songs = [...newSongs]; },
  };

  return client;
}
