import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  saveCachedSongs,
  getCachedSongs,
  saveCachedSong,
  getCachedSong,
  deleteCachedSong,
  saveCachedEvents,
  getCachedEvents,
  getLastSyncTime,
  saveCachedEventDetails,
  getCachedEventDetails,
  saveRecentlyViewedSong,
  getRecentlyViewedSongs,
} from '../../lib/offline-storage';
import type { Song, Event, EventSong } from '../../lib/types';

// Cada teste começa com o localStorage e a IndexedDB vazios
beforeEach(() => {
  localStorage.clear();
  window.indexedDB = new IDBFactory();
});

describe('Cache offline de músicas e eventos', () => {
  const sampleSongs: Song[] = [
    {
      id: 'song-1',
      title: 'Bênção da Flor de Lis',
      artist: 'CNE',
      content: '[C]Partir ao nascer do [G]sol',
      tags: ['escutistas', 'promessa'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'song-2',
      title: 'Avante Escuteiros',
      artist: 'Autor Exemplo',
      content: '[D]Sempre alerta para [A]servir',
      tags: ['escutistas'],
      original_key: 'D',
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const sampleEvents: Event[] = [
    {
      id: 'event-1',
      title: 'Missa de Promessas 2026',
      date: '2026-05-15T10:00:00Z',
      location: 'Igreja Matriz de Mafra',
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  describe('Songs Cache Operations', () => {
    it('saves and retrieves songs from storage, sorted by title', async () => {
      await saveCachedSongs(sampleSongs);
      const retrieved = await getCachedSongs();

      expect(retrieved.length).toBe(2);
      // Sorted alphabetically: 'Avante Escuteiros' comes before 'Bênção da Flor de Lis'
      expect(retrieved[0].title).toBe('Avante Escuteiros');
      expect(retrieved[1].title).toBe('Bênção da Flor de Lis');
    });

    it('retrieves a single song by ID', async () => {
      await saveCachedSongs(sampleSongs);
      const song = await getCachedSong('song-1');

      expect(song).not.toBeNull();
      expect(song?.title).toBe('Bênção da Flor de Lis');
      expect(song?.artist).toBe('CNE');
    });

    it('returns null when querying a non-existent song ID', async () => {
      await saveCachedSongs(sampleSongs);
      const nonExistent = await getCachedSong('non-existent-id');
      expect(nonExistent).toBeNull();
    });

    it('saves/updates an individual song and updates the cache', async () => {
      await saveCachedSongs(sampleSongs);

      const updatedSong: Song = {
        ...sampleSongs[0],
        title: 'Bênção da Flor de Lis (Versão Nova)',
      };
      await saveCachedSong(updatedSong);

      const retrieved = await getCachedSong('song-1');
      expect(retrieved?.title).toBe('Bênção da Flor de Lis (Versão Nova)');
    });

    it('deletes a song from the cache', async () => {
      await saveCachedSongs(sampleSongs);
      await deleteCachedSong('song-1');

      const retrieved = await getCachedSong('song-1');
      expect(retrieved).toBeNull();

      const all = await getCachedSongs();
      expect(all.length).toBe(1);
      expect(all[0].id).toBe('song-2');
    });

    it('removes a deleted song from cached event details', async () => {
      await saveCachedSongs(sampleSongs);
      await saveCachedEventDetails(sampleEvents[0], [
        { id: 'es-1', event_id: 'event-1', song_id: 'song-1', moment_name: 'Entrada', order_index: 0, song: sampleSongs[0] },
        { id: 'es-2', event_id: 'event-1', song_id: 'song-2', moment_name: 'Saída', order_index: 1, song: sampleSongs[1] },
      ]);

      await deleteCachedSong('song-1');

      const details = await getCachedEventDetails('event-1');
      expect(details?.eventSongs.map(es => es.song_id)).toEqual(['song-2']);
    });
  });

  describe('Events Cache Operations', () => {
    it('saves and retrieves cached events', async () => {
      await saveCachedEvents(sampleEvents);
      const retrieved = await getCachedEvents();

      expect(retrieved.length).toBe(1);
      expect(retrieved[0].id).toBe('event-1');
      expect(retrieved[0].title).toBe('Missa de Promessas 2026');
    });
  });

  describe('Sync Metadata & Fallback', () => {
    it('records sync timestamp upon saving', async () => {
      await saveCachedSongs(sampleSongs);
      const syncTime = getLastSyncTime();
      expect(syncTime).not.toBeNull();
      expect(new Date(syncTime!).getTime()).toBeGreaterThan(0);
    });

    it('falls back gracefully to localStorage when IndexedDB getAll returns empty or fails', async () => {
      // Put directly in localStorage
      localStorage.setItem('cancioneiro_cached_songs', JSON.stringify(sampleSongs));

      // Mock IndexedDB open failure to force fallback
      const originalIndexedDB = window.indexedDB;
      // @ts-expect-error test simulation
      delete window.indexedDB;

      try {
        const retrieved = await getCachedSongs();
        expect(retrieved.length).toBe(2);
        expect(retrieved[0].id).toBe('song-2');
      } finally {
        window.indexedDB = originalIndexedDB;
      }
    });
  });
});

describe('IndexedDB bloqueado: usa o localStorage', () => {
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
});

describe('Músicas vistas recentemente', () => {
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

describe('Cache dos detalhes de um evento', () => {
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

describe('Dados corrompidos e falta de espaço', () => {
  describe('Corrupt JSON in LocalStorage', () => {
    it('getCachedSongs recovers gracefully when localStorage contains malformed JSON', async () => {
      // Put broken JSON directly into localStorage
      localStorage.setItem('cancioneiro_cached_songs', '{broken-json-not-valid');

      // Mock console.warn to suppress expected log
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Must not throw an unhandled exception
      const songs = await getCachedSongs();
      expect(Array.isArray(songs)).toBe(true);
      expect(songs).toEqual([]);

      warnSpy.mockRestore();
    });

    it('getCachedSongs recovers when localStorage contains a non-array JSON primitive (number or boolean)', async () => {
      localStorage.setItem('cancioneiro_cached_songs', '12345');

      const songs = await getCachedSongs();
      expect(Array.isArray(songs)).toBe(true);
      expect(songs).toEqual([]);
    });

    it('getCachedSongs recovers when localStorage contains "null"', async () => {
      localStorage.setItem('cancioneiro_cached_songs', 'null');

      const songs = await getCachedSongs();
      expect(Array.isArray(songs)).toBe(true);
      expect(songs).toEqual([]);
    });
  });

  describe('Storage Quota Exceeded Resilience', () => {
    it('saveCachedSongs does not throw uncaught error when localStorage quota is exceeded', async () => {
      const originalSetItem = Storage.prototype.setItem;
      const quotaError = new DOMException('QuotaExceededError: The quota has been exceeded.', 'QuotaExceededError');

      Storage.prototype.setItem = vi.fn().mockImplementation(() => {
        throw quotaError;
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sampleSongs: Song[] = [
        {
          id: 'quota-test',
          title: 'Música Teste de Quota',
          artist: null,
          content: '[C]Letra',
          tags: [],
          original_key: 'C',
          created_by: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ];

      // Should complete without throwing an unhandled rejection
      await expect(saveCachedSongs(sampleSongs)).resolves.not.toThrow();

      Storage.prototype.setItem = originalSetItem;
      warnSpy.mockRestore();
    });
  });
});
