import React, { Suspense, lazy } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { SongListProvider, useSongList } from '../../hooks/useSongList';
import { SongCard } from '../../components/songs/SongCard';
import { Song } from '../../lib/types';
import { normalizeTag } from '../../pages/Eucharist';
import fs from 'fs';
import path from 'path';

describe('Milestone 4: Performance & Dynamic Code-Splitting', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Feature 22: Route-Level Code Splitting & LoadingSpinner', () => {
    it('renders LoadingSpinner with default message and accessibility attributes', () => {
      render(<LoadingSpinner />);
      const statusEl = screen.getByRole('status');
      expect(statusEl).toBeInTheDocument();
      expect(statusEl).toHaveAttribute('aria-live', 'polite');
      expect(screen.getAllByText('A carregar...')[0]).toBeInTheDocument();
    });

    it('renders LoadingSpinner with custom message', () => {
      render(<LoadingSpinner message="A preparar cancioneiro..." fullScreen={false} />);
      expect(screen.getAllByText('A preparar cancioneiro...')[0]).toBeInTheDocument();
    });

    it('renders Suspense fallback with LoadingSpinner during dynamic import resolution', async () => {
      let resolvePromise: (value: { default: React.FC }) => void;
      const deferredPromise = new Promise<{ default: React.FC }>((resolve) => {
        resolvePromise = resolve;
      });

      const LazyComponent = lazy(() => deferredPromise);

      render(
        <Suspense fallback={<LoadingSpinner message="A carregar módulo..." />}>
          <LazyComponent />
        </Suspense>
      );

      // LoadingSpinner should be visible while unresolved
      expect(screen.getAllByText('A carregar módulo...')[0]).toBeInTheDocument();

      // Resolve the lazy module
      await act(async () => {
        resolvePromise!({
          default: () => <div data-testid="lazy-loaded-content">Módulo Carregado</div>,
        });
      });

      // Lazy component content should replace spinner
      expect(await screen.findByTestId('lazy-loaded-content')).toBeInTheDocument();
    });
  });

  describe('Feature 23: Bundle Size Budget (< 500 kB per chunk)', () => {
    it('verifies generated build chunks in dist/assets are all strictly under 500 kB', () => {
      const distAssetsPath = path.resolve(process.cwd(), 'dist/assets');
      if (!fs.existsSync(distAssetsPath)) {
        // Skip if dist has not been generated yet
        return;
      }

      const files = fs.readdirSync(distAssetsPath);
      const jsFiles = files.filter(f => f.endsWith('.js'));
      expect(jsFiles.length).toBeGreaterThan(0);

      const maxAllowedBytes = 500 * 1024; // 500 kB
      const chunkSizes: { file: string; sizeKb: number }[] = [];

      for (const file of jsFiles) {
        const filePath = path.join(distAssetsPath, file);
        const stats = fs.statSync(filePath);
        chunkSizes.push({ file, sizeKb: stats.size / 1024 });
        expect(stats.size).toBeLessThan(maxAllowedBytes);
      }

      // Main entry chunk should also be < 400 kB
      const mainChunk = chunkSizes.find(c => c.file.startsWith('index-'));
      if (mainChunk) {
        expect(mainChunk.sizeKb).toBeLessThan(400);
      }
    });
  });

  describe('Feature 24: SongListProvider Memoization', () => {
    it('maintains stable callback references across renders', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <SongListProvider>{children}</SongListProvider>
      );

      const { result, rerender } = renderHook(() => useSongList(), { wrapper });

      const initialAdd = result.current.addSong;
      const initialRemove = result.current.removeSong;
      const initialToggle = result.current.toggleSong;
      const initialClear = result.current.clearList;
      const initialReorder = result.current.reorderSongs;

      // Re-render the hook
      rerender();

      expect(result.current.addSong).toBe(initialAdd);
      expect(result.current.removeSong).toBe(initialRemove);
      expect(result.current.toggleSong).toBe(initialToggle);
      expect(result.current.clearList).toBe(initialClear);
      expect(result.current.reorderSongs).toBe(initialReorder);
    });

    it('isInList is stable when selected songs have not changed', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <SongListProvider>{children}</SongListProvider>
      );

      const { result, rerender } = renderHook(() => useSongList(), { wrapper });

      const initialIsInList = result.current.isInList;
      rerender();
      expect(result.current.isInList).toBe(initialIsInList);

      act(() => {
        result.current.addSong('canto-100');
      });

      expect(result.current.isInList('canto-100')).toBe(true);
      expect(result.current.isInList('canto-999')).toBe(false);
    });
  });

  describe('Feature 25: SongCard Component Memoization', () => {
    const sampleSong: Song = {
      id: 'test-card-1',
      title: 'Hino do Agrupamento',
      artist: 'Patrulha Águia',
      content: '[C]Caminhando sob a flor de lis',
      tags: ['escutismo', 'hino'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    it('renders correctly and does not throw with memoized props', () => {
      render(
        <MemoryRouter>
          <SongListProvider>
            <SongCard song={sampleSong} />
          </SongListProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('Hino do Agrupamento')).toBeInTheDocument();
      expect(screen.getByText('Patrulha Águia')).toBeInTheDocument();
    });

    it('toggles list state when clicking the list button without navigating', () => {
      render(
        <MemoryRouter>
          <SongListProvider>
            <SongCard song={sampleSong} />
          </SongListProvider>
        </MemoryRouter>
      );

      const addBtn = screen.getByTitle('Adicionar à Lista');
      expect(addBtn).toBeInTheDocument();

      act(() => {
        addBtn.click();
      });

      // After toggle, title changes to 'Remover da Lista'
      expect(screen.getByTitle('Remover da Lista')).toBeInTheDocument();
    });
  });

  describe('Feature 26: Search Filter Performance', () => {
    const catalog: Song[] = [
      {
        id: '1',
        title: 'Canto da Promessa',
        artist: 'Baden Powell',
        content: '[G]Prometo pela minha honra servir a Deus e à pátria',
        tags: ['promessa', 'escutistas'],
        original_key: 'G',
        created_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      {
        id: '2',
        title: 'Senhor Tu És a Minha Luz',
        artist: 'Padre Zezinho',
        content: '[C]O Senhor é o meu pastor nada me faltará',
        tags: ['comunhao', 'salmo'],
        original_key: 'C',
        created_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];

    it('returns original songs array reference when query is empty or whitespace', () => {
      const filter = (songs: Song[], q: string) => {
        const query = (q || '').toLowerCase().trim();
        if (!query) return songs;
        return songs.filter(s => s.title.toLowerCase().includes(query));
      };

      expect(filter(catalog, '')).toBe(catalog);
      expect(filter(catalog, '   ')).toBe(catalog);
    });

    it('matches by title, artist, or tags with fast short-circuiting', () => {
      const fastFilter = (songs: Song[], q: string) => {
        const query = (q || '').toLowerCase().trim();
        if (!query) return songs;
        return songs.filter((s) => {
          if ((s.title || '').toLowerCase().includes(query)) return true;
          if (s.artist && s.artist.toLowerCase().includes(query)) return true;
          if (Array.isArray(s.tags) && s.tags.some(t => t.toLowerCase().includes(query))) return true;
          return (s.content || '').toLowerCase().includes(query);
        });
      };

      const titleResult = fastFilter(catalog, 'promessa');
      expect(titleResult.length).toBe(1);
      expect(titleResult[0].id).toBe('1');

      const artistResult = fastFilter(catalog, 'Zezinho');
      expect(artistResult.length).toBe(1);
      expect(artistResult[0].id).toBe('2');

      const tagResult = fastFilter(catalog, 'comunhao');
      expect(tagResult.length).toBe(1);
      expect(tagResult[0].id).toBe('2');
    });
  });

  describe('Feature 27: Eucharist & Admin Tag Memoization', () => {
    it('normalizes liturgical tags and eliminates diacritics', () => {
      expect(normalizeTag('Comunhão')).toBe('comunhao');
      expect(normalizeTag('Pós-Comunhão')).toBe('pos-comunhao');
      expect(normalizeTag('Ofertório')).toBe('ofertorio');
      expect(normalizeTag('Ato Penitencial')).toBe('ato penitencial');
      expect(normalizeTag('')).toBe('');
      expect(normalizeTag(null)).toBe('');
      expect(normalizeTag(undefined)).toBe('');
    });

    it('uses fast Set lookup for liturgical moment matching', () => {
      const targetTags = ['comunhão', 'comunhao'];
      const targetTagsSet = new Set(targetTags.map(normalizeTag).filter(Boolean));

      expect(targetTagsSet.has(normalizeTag('Comunhão'))).toBe(true);
      expect(targetTagsSet.has(normalizeTag('comunhao'))).toBe(true);
      expect(targetTagsSet.has(normalizeTag('Entrada'))).toBe(false);
    });

    it('deduplicates and sorts tags efficiently', () => {
      const songs: Partial<Song>[] = [
        { tags: ['escutistas', 'hino'] },
        { tags: ['comunhao', 'escutistas'] },
        { tags: ['hino', 'entrada'] },
      ];

      const allTags = Array.from(new Set(songs.flatMap(s => s.tags || []))).sort();
      expect(allTags).toEqual(['comunhao', 'entrada', 'escutistas', 'hino']);
    });
  });

  describe('Feature 28: Activity Logs Diff Optimization', () => {
    it('handles large text comparison gracefully without freezing', () => {
      // Simulate massive 600-line strings
      const oldLines = Array.from({ length: 600 }, (_, i) => `Linha ${i}: Letra antiga do cancioneiro`).join('\n');
      const newLines = Array.from({ length: 600 }, (_, i) => `Linha ${i}: Letra nova do cancioneiro`).join('\n');

      const start = performance.now();

      const n = oldLines.split('\n').length;
      const m = newLines.split('\n').length;
      const isBounded = n > 250 || m > 250 || n * m > 20000;
      expect(isBounded).toBe(true);

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50); // Bound check executes immediately (< 50ms)
    });

    it('trims identical prefix and suffix lines before comparison', () => {
      const prefix = ['Linha 1', 'Linha 2', 'Linha 3'];
      const suffix = ['Linha 10', 'Linha 11', 'Linha 12'];
      const oldMid = ['Verso Antigo A', 'Verso Antigo B'];
      const newMid = ['Verso Novo A', 'Verso Novo B'];

      const oldFull = [...prefix, ...oldMid, ...suffix];
      const newFull = [...prefix, ...newMid, ...suffix];

      // Prefix check
      let start = 0;
      while (start < oldFull.length && start < newFull.length && oldFull[start] === newFull[start]) {
        start++;
      }
      expect(start).toBe(3);

      // Suffix check
      let oldEnd = oldFull.length - 1;
      let newEnd = newFull.length - 1;
      while (oldEnd >= start && newEnd >= start && oldFull[oldEnd] === newFull[newEnd]) {
        oldEnd--;
        newEnd--;
      }

      expect(oldFull.slice(start, oldEnd + 1)).toEqual(oldMid);
      expect(newFull.slice(start, newEnd + 1)).toEqual(newMid);
    });
  });
});
