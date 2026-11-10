import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EventPrint from '../../pages/EventPrint';
import type { Event, EventSong, Song } from '../../lib/types';

const liveSong: Song = {
  id: 'song-live-1',
  title: 'Hino da Flor de Lis',
  artist: 'Baden-Powell',
  content: '[C]A flor de lis nos guia',
  tags: ['escutistas'],
  original_key: 'C',
  created_by: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const mockEvent: Event = {
  id: 'evt-del-1',
  title: 'Cerimónia com Cânticos Eliminados',
  date: '2026-05-10T11:00:00Z',
  location: 'Igreja Paroquial',
  created_at: '2026-01-01',
};

// 3 event songs: es-1 has valid song, es-2 has undefined song (deleted), es-3 has valid song
const eventSongsWithDeleted: EventSong[] = [
  {
    id: 'es-1',
    event_id: 'evt-del-1',
    song_id: 'song-live-1',
    moment_name: 'Entrada',
    order_index: 0,
    song: liveSong,
  },
  {
    id: 'es-2',
    event_id: 'evt-del-1',
    song_id: 'song-deleted-999',
    moment_name: 'Ofertório',
    order_index: 1,
    song: undefined, // Deleted song reference
  },
];

vi.mock('../../hooks/useEvents', () => ({
  useEvent: () => ({
    event: mockEvent,
    eventSongs: eventSongsWithDeleted,
    loading: false,
    error: null,
  }),
}));

describe('Tier 3: Event View Resilience against Deleted Songs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders EventPrint successfully without crashing when one of the event songs is deleted', async () => {
    render(
      <MemoryRouter initialEntries={['/evento/evt-del-1/print']}>
        <Routes>
          <Route path="/evento/:id/print" element={<EventPrint />} />
        </Routes>
      </MemoryRouter>
    );

    // Event title renders
    expect(await screen.findByText('Cerimónia com Cânticos Eliminados')).toBeInTheDocument();
    expect(screen.getByText('Igreja Paroquial')).toBeInTheDocument();

    // Valid song renders
    expect(screen.getByText('Hino da Flor de Lis')).toBeInTheDocument();

    // Summary badge shows 1 song (valid filtered songs)
    expect(screen.getByText(/1 músicas/i)).toBeInTheDocument();
  });
});
