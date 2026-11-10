import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { saveCachedEventDetails, saveCachedEvents, getOfflineEventRecord } from '../../lib/offline-storage';
import type { Event, EventSong, Song } from '../../lib/types';

// Sem Supabase: a página usa a cache local (cenário de acampamento sem rede)
vi.mock('../../lib/supabase', () => ({ supabase: null }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));

import { EventView } from '../../pages/EventView';
import { EventsList } from '../../pages/EventsList';

const song: Song = {
  id: 'ui-offline-song-1',
  title: 'Alerta Escuteiro',
  artist: 'CNE',
  content: '[G]Alerta, [D]sempre alerta',
  tags: [],
  original_key: 'G',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const event: Event = { id: 'ui-offline-evt-1', title: 'Fogo de Conselho', date: '2026-11-01', location: 'Mafra', created_at: '2026-01-01' };
const eventSongs: EventSong[] = [
  { id: 'es-1', event_id: event.id, song_id: song.id, moment_name: 'Abertura', order_index: 0, song },
];

describe('EventView — Guardar offline', () => {
  it('guarda o evento, mostra "Disponível offline" e o badge na lista de eventos', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await saveCachedEventDetails(event, eventSongs);
    await saveCachedEvents([event]);

    const { unmount } = render(
      <MemoryRouter initialEntries={[`/evento/${event.id}`]}>
        <Routes>
          <Route path="/evento/:id" element={<EventView />} />
        </Routes>
      </MemoryRouter>
    );

    const btn = await screen.findByRole('button', { name: /Guardar offline/i });
    fireEvent.click(btn);

    expect(await screen.findByText(/Disponível offline/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(getOfflineEventRecord(event.id)?.songCount).toBe(1);
    unmount();

    render(
      <MemoryRouter>
        <EventsList />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Fogo de Conselho')).toBeInTheDocument());
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});
