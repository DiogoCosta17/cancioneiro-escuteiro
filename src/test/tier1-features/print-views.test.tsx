import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SongPrint from '../../pages/SongPrint';
import ListPrint from '../../pages/ListPrint';
import EventPrint from '../../pages/EventPrint';
import { SongListProvider } from '../../hooks/useSongList';
import type { Song, Event, EventSong } from '../../lib/types';

// Mock useSongs hook
const mockSong1: Song = {
  id: 'song-p1',
  title: 'Hino da Flor de Lis',
  artist: 'Baden-Powell',
  content: '{Refrão}\n[C]A flor de lis nos [G]guia',
  tags: ['escutistas'],
  original_key: 'C',
  created_by: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const mockSong2: Song = {
  id: 'song-p2',
  title: 'Avante Escuteiros',
  artist: 'Pe. Hugo',
  content: '[D]Sempre alerta para [A]servir',
  tags: ['marcha'],
  original_key: 'D',
  created_by: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

vi.mock('../../hooks/useSongs', () => ({
  useSongs: () => ({
    songs: [mockSong1, mockSong2],
    loading: false,
    error: null,
    getSong: vi.fn().mockImplementation(async (id: string) => {
      if (id === 'song-p1') return mockSong1;
      if (id === 'song-p2') return mockSong2;
      return null;
    }),
  }),
}));

// Mock useEvents hook
const mockEvent: Event = {
  id: 'event-p1',
  title: 'Acampamento de Primavera 2026',
  date: '2026-04-25T09:00:00Z',
  location: 'Parque de Campismo de Santa Cruz',
  created_at: '2026-01-01',
};

const mockEventSongs: EventSong[] = [
  {
    id: 'es-1',
    event_id: 'event-p1',
    song_id: 'song-p1',
    moment_name: 'Entrada',
    order_index: 0,
    song: mockSong1,
  },
  {
    id: 'es-2',
    event_id: 'event-p1',
    song_id: 'song-p2',
    moment_name: 'Final',
    order_index: 1,
    song: mockSong2,
  },
];

vi.mock('../../hooks/useEvents', () => ({
  useEvent: () => ({
    event: mockEvent,
    eventSongs: mockEventSongs,
    loading: false,
    error: null,
  }),
}));

describe('Tier 1: Print Views (SongPrint, ListPrint, EventPrint)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.print = vi.fn();
  });

  describe('SongPrint', () => {
    it('renders single song printable sheet with title, artist, key, and chords', async () => {
      render(
        <MemoryRouter initialEntries={['/song/song-p1/print']}>
          <Routes>
            <Route path="/song/:id/print" element={<SongPrint />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Hino da Flor de Lis')).toBeInTheDocument();
      expect(screen.getByText(/Baden-Powell/)).toBeInTheDocument();
      expect(screen.getByText('Tom')).toBeInTheDocument();
      expect(screen.getByText(/A flor de lis nos/)).toBeInTheDocument();
    });

    it('triggers window.print when clicking print button', async () => {
      render(
        <MemoryRouter initialEntries={['/song/song-p1/print']}>
          <Routes>
            <Route path="/song/:id/print" element={<SongPrint />} />
          </Routes>
        </MemoryRouter>
      );

      await screen.findByText('Hino da Flor de Lis');
      const printBtn = screen.getByRole('button', { name: /Imprimir/i });
      fireEvent.click(printBtn);

      expect(window.print).toHaveBeenCalledTimes(1);
    });
  });

  describe('ListPrint', () => {
    it('displays message when song list is empty', () => {
      render(
        <MemoryRouter initialEntries={['/lista/print']}>
          <SongListProvider>
            <Routes>
              <Route path="/lista/print" element={<ListPrint />} />
            </Routes>
          </SongListProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('A tua lista está vazia.')).toBeInTheDocument();
    });

    it('renders list songs booklet when list has selected songs', async () => {
      localStorage.setItem('scout_song_list', JSON.stringify(['song-p1', 'song-p2']));

      render(
        <MemoryRouter initialEntries={['/lista/print']}>
          <SongListProvider>
            <Routes>
              <Route path="/lista/print" element={<ListPrint />} />
            </Routes>
          </SongListProvider>
        </MemoryRouter>
      );

      expect(await screen.findByText('Hino da Flor de Lis')).toBeInTheDocument();
      expect(screen.getByText('Avante Escuteiros')).toBeInTheDocument();
      expect(screen.getByText(/2 músicas/i)).toBeInTheDocument();
    });
  });

  describe('EventPrint', () => {
    it('renders event header and assigned songs', async () => {
      render(
        <MemoryRouter initialEntries={['/evento/event-p1/print']}>
          <Routes>
            <Route path="/evento/:id/print" element={<EventPrint />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Acampamento de Primavera 2026')).toBeInTheDocument();
      expect(screen.getByText('Parque de Campismo de Santa Cruz')).toBeInTheDocument();
      expect(screen.getByText('Hino da Flor de Lis')).toBeInTheDocument();
      expect(screen.getByText('Avante Escuteiros')).toBeInTheDocument();
    });
  });
});
