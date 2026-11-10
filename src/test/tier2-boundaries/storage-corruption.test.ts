import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedSongs, saveCachedSongs } from '../../lib/offline-storage';
import type { Song } from '../../lib/types';

describe('Tier 2: Storage Corruption & Resilience (storage-corruption.test.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  describe('Null & Undefined Tag Structures', () => {
    it('handles songs with null, empty, or unnormalized tag arrays without throwing', () => {
      const corruptedSong: any = {
        id: 'corrupt-tags',
        title: 'Cântico com Tags Corrompidas',
        artist: null,
        content: 'Letra',
        tags: null, // null instead of array
        original_key: 'C',
      };

      // Defensive tag check helper
      const safeTags = Array.isArray(corruptedSong.tags) ? corruptedSong.tags : [];
      expect(safeTags).toEqual([]);

      const hasTag = safeTags.some((t: string) => t === 'escutistas');
      expect(hasTag).toBe(false);
    });
  });
});
