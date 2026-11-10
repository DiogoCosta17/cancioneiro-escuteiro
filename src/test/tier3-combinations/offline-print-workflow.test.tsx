import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ListPrint from '../../pages/ListPrint';
import { SongListProvider } from '../../hooks/useSongList';
import { saveCachedSongs } from '../../lib/offline-storage';
import { setMockOnline } from '../setup';
import type { Song } from '../../lib/types';

describe('Tier 3: Offline Mode & Print Workflow (offline-print-workflow.test.tsx)', () => {
  const offlineCatalog: Song[] = [
    {
      id: 'off-1',
      title: 'Fogo de Conselho Tradicional',
      artist: 'Escuteiros de Mafra',
      content: '{Refrão}\n[C]À volta da fogueira [G]vamos cantar',
      tags: ['escutistas', 'fogo'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    {
      id: 'off-2',
      title: 'Oração da Noite',
      artist: 'Pe. Hugo',
      content: '[D]Fica connosco Senhor [A]esta noite',
      tags: ['escutistas', 'oracao'],
      original_key: 'D',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
  ];

  beforeEach(async () => {
    localStorage.clear();
    // Cache catalog offline
    await saveCachedSongs(offlineCatalog);
  });

  it('renders printable booklet from offline storage when disconnected from the internet', async () => {
    // 1. Simulate network disconnect
    setMockOnline(false);
    expect(navigator.onLine).toBe(false);

    // 2. Select both offline songs into user's list
    localStorage.setItem('scout_song_list', JSON.stringify(['off-1', 'off-2']));

    // 3. Render print view
    render(
      <MemoryRouter initialEntries={['/lista/print']}>
        <SongListProvider>
          <Routes>
            <Route path="/lista/print" element={<ListPrint />} />
          </Routes>
        </SongListProvider>
      </MemoryRouter>
    );

    // 4. Verify songs are loaded and rendered from offline storage
    expect(await screen.findByText('Fogo de Conselho Tradicional')).toBeInTheDocument();
    expect(screen.getByText('Oração da Noite')).toBeInTheDocument();
    expect(screen.getByText(/2 músicas/i)).toBeInTheDocument();
    expect(screen.getByText(/À volta da fogueira/)).toBeInTheDocument();
    expect(screen.getByText(/Fica connosco Senhor/)).toBeInTheDocument();

    // Reconnect network
    setMockOnline(true);
  });
});
