import { describe, it, expect, beforeEach } from 'vitest';
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
} from '../../lib/offline-storage';
import type { Song, Event } from '../../lib/types';

describe('Tier 1: Offline Storage & Caching Layer (offline-storage.ts)', () => {
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
      artist: 'Pe. Hugo',
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
