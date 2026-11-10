import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { YouTubePlayer, getYouTubeVideoId } from '../../components/songs/YouTubePlayer';
import { SongView } from '../../components/songs/SongView';
import { normalizeTag } from '../../pages/Eucharist';
import { SongListProvider, useSongList } from '../../hooks/useSongList';
import EventPrint from '../../pages/EventPrint';
import { convertToChordPro, isChordLine, isChordToken } from '../../lib/chordpro-converter';
import type { Song, Event, EventSong } from '../../lib/types';

const mockUseEvent = vi.fn();
vi.mock('../../hooks/useEvents', () => ({
  useEvent: (...args: any[]) => mockUseEvent(...args),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    adminProfile: null,
    isAdmin: false,
    loading: false,
    logout: vi.fn(),
  }),
}));

describe('Milestone 2: Data Resilience & Strict Null Handling', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  // =========================================================================
  // Feature 12: YouTube Shorts & Clean Embedding
  // =========================================================================
  describe('Feature 12: YouTube Shorts & Clean Embedding (getYouTubeVideoId & YouTubePlayer)', () => {
    it('extracts video ID from /shorts/ URLs with or without extra query params', () => {
      expect(getYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(getYouTubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ?feature=share')).toBe('dQw4w9WgXcQ');
      expect(getYouTubeVideoId('http://m.youtube.com/shorts/12345678901')).toBe('12345678901');
    });

    it('extracts video ID from standard watch and youtu.be URLs with surrounding whitespace', () => {
      expect(getYouTubeVideoId('  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
      expect(getYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(getYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('accepts raw 11-character video IDs directly', () => {
      expect(getYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(getYouTubeVideoId('  abc_123-XYZ  ')).toBe('abc_123-XYZ');
    });

    it('returns null safely for invalid, null, undefined, or empty URLs without throwing', () => {
      expect(getYouTubeVideoId(null)).toBeNull();
      expect(getYouTubeVideoId(undefined)).toBeNull();
      expect(getYouTubeVideoId('')).toBeNull();
      expect(getYouTubeVideoId('   ')).toBeNull();
      expect(getYouTubeVideoId('not-a-url')).toBeNull();
      expect(getYouTubeVideoId('https://spotify.com/track/123')).toBeNull();
      expect(getYouTubeVideoId(42 as any)).toBeNull();
    });

    it('renders iframe with embed URL for /shorts/ video', () => {
      render(<YouTubePlayer url="https://www.youtube.com/shorts/dQw4w9WgXcQ" />);
      const iframe = screen.getByTitle('Vídeo da Música');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
    });

    it('renders external link fallback for valid non-YouTube HTTP URLs', () => {
      render(<YouTubePlayer url="https://vimeo.com/12345678" />);
      const link = screen.getByRole('link', { name: /Ouvir Música/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://vimeo.com/12345678');
    });

    it('returns null and does not render anything for empty, null, or garbage URLs', () => {
      const { container: c1 } = render(<YouTubePlayer url="" />);
      expect(c1).toBeEmptyDOMElement();

      const { container: c2 } = render(<YouTubePlayer url={null} />);
      expect(c2).toBeEmptyDOMElement();

      const { container: c3 } = render(<YouTubePlayer url="javascript:alert(1)" />);
      expect(c3).toBeEmptyDOMElement();
    });
  });

  // =========================================================================
  // Feature 13: Responsive Video Layout Shield in SongView
  // =========================================================================
  describe('Feature 13: Responsive Video Layout Shield (SongView.tsx)', () => {
    const baseSong: Song = {
      id: 'song-v1',
      title: 'Hino da Promessa',
      artist: 'Mafra 488',
      content: '{Refrão}\n[C]Prometo pela [G]minha honra',
      tags: ['escutistas'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    it('uses 12-column full layout when youtube_url is missing, empty, or whitespace', () => {
      const songWithoutVideo: Song = {
        ...baseSong,
        youtube_url: '   ',
      };

      const { container } = render(
        <MemoryRouter>
          <SongListProvider>
            <SongView song={songWithoutVideo} />
          </SongListProvider>
        </MemoryRouter>
      );

      const mainCol = container.querySelector('.lg\\:col-span-12');
      expect(mainCol).toBeInTheDocument();
      expect(container.querySelector('.lg\\:col-span-8')).toBeNull();
      expect(container.querySelector('.lg\\:col-span-4')).toBeNull();
    });

    it('uses 12-column full layout when youtube_url is invalid and cannot be embedded', () => {
      const songWithInvalidVideo: Song = {
        ...baseSong,
        youtube_url: 'not-a-valid-url-or-id',
      };

      const { container } = render(
        <MemoryRouter>
          <SongListProvider>
            <SongView song={songWithInvalidVideo} />
          </SongListProvider>
        </MemoryRouter>
      );

      const mainCol = container.querySelector('.lg\\:col-span-12');
      expect(mainCol).toBeInTheDocument();
      expect(container.querySelector('.lg\\:col-span-4')).toBeNull();
    });

    it('allocates 8-column main and 4-column side layout when valid youtube URL is provided', () => {
      const songWithVideo: Song = {
        ...baseSong,
        youtube_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      };

      const { container } = render(
        <MemoryRouter>
          <SongListProvider>
            <SongView song={songWithVideo} />
          </SongListProvider>
        </MemoryRouter>
      );

      expect(container.querySelector('.lg\\:col-span-8')).toBeInTheDocument();
      expect(container.querySelector('.lg\\:col-span-4')).toBeInTheDocument();
      expect(screen.getByText('ÁUDIO / VÍDEO')).toBeInTheDocument();
    });

    it('handles song with missing optional fields without runtime exceptions', () => {
      const sparseSong: any = {
        id: 'sparse-1',
        title: 'Cântico Sem Detalhes',
        artist: null,
        content: '[D]Letra simples',
        tags: null,
        original_key: null,
        youtube_url: null,
        capo: null,
      };

      render(
        <MemoryRouter>
          <SongListProvider>
            <SongView song={sparseSong} />
          </SongListProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('Cântico Sem Detalhes')).toBeInTheDocument();
      expect(screen.getByText(/Letra simples/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Feature 11: Safe Song List Deserialization in useSongList
  // =========================================================================
  describe('Feature 11: Safe Song List Deserialization (useSongList.tsx)', () => {
    it('initializes to empty array when localStorage contains corrupted JSON', () => {
      localStorage.setItem('scout_song_list', '{"broken json: true');

      const { result } = renderHook(() => useSongList(), {
        wrapper: ({ children }) => <SongListProvider>{children}</SongListProvider>,
      });

      expect(result.current.selectedSongIds).toEqual([]);
    });

    it('initializes to empty array when localStorage contains primitive or non-array JSON', () => {
      localStorage.setItem('scout_song_list', '12345');

      const { result } = renderHook(() => useSongList(), {
        wrapper: ({ children }) => <SongListProvider>{children}</SongListProvider>,
      });

      expect(result.current.selectedSongIds).toEqual([]);
    });

    it('filters out non-string and empty items from stored song list', () => {
      localStorage.setItem('scout_song_list', JSON.stringify(['valid-1', null, 42, '   ', 'valid-2']));

      const { result } = renderHook(() => useSongList(), {
        wrapper: ({ children }) => <SongListProvider>{children}</SongListProvider>,
      });

      expect(result.current.selectedSongIds).toEqual(['valid-1', 'valid-2']);
    });

    it('prevents adding non-string or whitespace-only IDs', () => {
      const { result } = renderHook(() => useSongList(), {
        wrapper: ({ children }) => <SongListProvider>{children}</SongListProvider>,
      });

      act(() => {
        result.current.addSong('' as any);
        result.current.addSong('   ' as any);
        result.current.addSong(null as any);
        result.current.addSong(123 as any);
      });

      expect(result.current.selectedSongIds).toEqual([]);

      act(() => {
        result.current.addSong('valid-song');
      });

      expect(result.current.selectedSongIds).toEqual(['valid-song']);
    });

    it('isInList returns false for null, undefined, or non-string inputs safely', () => {
      const { result } = renderHook(() => useSongList(), {
        wrapper: ({ children }) => <SongListProvider>{children}</SongListProvider>,
      });

      expect(result.current.isInList(null as any)).toBe(false);
      expect(result.current.isInList(undefined as any)).toBe(false);
      expect(result.current.isInList('' as any)).toBe(false);
    });
  });

  // =========================================================================
  // Feature 10: Tag Normalization Safety
  // =========================================================================
  describe('Feature 10: Tag Normalization Safety (normalizeTag)', () => {
    it('normalizes diacritics and special characters correctly', () => {
      expect(normalizeTag('Comunhão')).toBe('comunhao');
      expect(normalizeTag('Pós-Comunhão')).toBe('pos-comunhao');
      expect(normalizeTag('Ofertório')).toBe('ofertorio');
      expect(normalizeTag('Bênção')).toBe('bencao');
      expect(normalizeTag('  Ato Penitencial  ')).toBe('ato penitencial');
    });

    it('returns empty string safely when passed null, undefined, numbers, or objects', () => {
      expect(normalizeTag(null)).toBe('');
      expect(normalizeTag(undefined)).toBe('');
      expect(normalizeTag(12345)).toBe('');
      expect(normalizeTag({})).toBe('');
      expect(normalizeTag([])).toBe('');
      expect(normalizeTag(false)).toBe('');
    });
  });

  // =========================================================================
  // Feature 8 & 14: EventPrint Null Song Safety & Print Header Key Display
  // =========================================================================
  describe('Feature 8 & 14: EventPrint Null Song Safety and Print Header Key Display', () => {
    const validSong1: Song = {
      id: 'song-e1',
      title: 'Hino da Flor de Lis',
      artist: 'Baden-Powell',
      content: '[C]A flor de lis nos guia',
      tags: ['escutistas'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const validSong2: Song = {
      id: 'song-e2',
      title: 'Avante Escuteiros',
      artist: null,
      content: '[G]Sempre alerta',
      tags: ['marcha'],
      original_key: 'G',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const mockEventData: Event = {
      id: 'event-m2',
      title: 'Missa de Compromisso 2026',
      date: '2026-05-17T10:00:00Z',
      location: 'Basílica de Mafra',
      created_at: '2026-01-01',
    };

    it('renders EventPrint successfully when songs include null, undefined, and deleted references', async () => {
      const eventSongsWithNulls: EventSong[] = [
        {
          id: 'es-1',
          event_id: 'event-m2',
          song_id: 'song-e1',
          moment_name: 'Entrada',
          order_index: 0,
          song: validSong1,
        },
        {
          id: 'es-null',
          event_id: 'event-m2',
          song_id: 'song-deleted',
          moment_name: 'Salmo',
          order_index: 1,
          song: null as any, // Null joined song
        },
        {
          id: 'es-undefined',
          event_id: 'event-m2',
          song_id: 'song-deleted-2',
          moment_name: 'Aleluia',
          order_index: 2,
          song: undefined, // Undefined joined song
        },
        {
          id: 'es-2',
          event_id: 'event-m2',
          song_id: 'song-e2',
          moment_name: 'Final',
          order_index: 3,
          song: validSong2,
        },
      ];

      mockUseEvent.mockReturnValue({
        event: mockEventData,
        eventSongs: eventSongsWithNulls,
        loading: false,
        error: null,
      });

      render(
        <MemoryRouter initialEntries={['/evento/event-m2/print']}>
          <Routes>
            <Route path="/evento/:id/print" element={<EventPrint />} />
          </Routes>
        </MemoryRouter>
      );

      // Event title and location rendered
      expect(await screen.findByText('Missa de Compromisso 2026')).toBeInTheDocument();
      expect(screen.getByText('Basílica de Mafra')).toBeInTheDocument();

      // Only valid songs rendered
      expect(screen.getByText('Hino da Flor de Lis')).toBeInTheDocument();
      expect(screen.getByText('Avante Escuteiros')).toBeInTheDocument();

      // Verified Tom badges in song headers (Feature 14)
      expect(screen.getByText('Tom: Dó')).toBeInTheDocument();
      expect(screen.getByText('Tom: Sol')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Feature 8: Strict Null Handling in ChordPro Converter & Helpers
  // =========================================================================
  describe('Strict Null/Undefined Checks across ChordPro Converter', () => {
    it('isChordLine handles null, undefined, empty, and non-string inputs safely', () => {
      expect(isChordLine(null as any)).toBe(false);
      expect(isChordLine(undefined as any)).toBe(false);
      expect(isChordLine('')).toBe(false);
      expect(isChordLine('   ')).toBe(false);
      expect(isChordLine(12345 as any)).toBe(false);
    });

    it('isChordToken handles null, undefined, and non-string inputs safely', () => {
      expect(isChordToken(null as any)).toBe(false);
      expect(isChordToken(undefined as any)).toBe(false);
      expect(isChordToken('')).toBe(false);
      expect(isChordToken(true as any)).toBe(false);
    });

    it('convertToChordPro returns empty string safely on null or undefined input', () => {
      expect(convertToChordPro(null as any)).toBe('');
      expect(convertToChordPro(undefined as any)).toBe('');
      expect(convertToChordPro('')).toBe('');
      expect(convertToChordPro(42 as any)).toBe('');
    });
  });
});
