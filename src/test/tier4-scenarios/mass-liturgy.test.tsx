import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EventPrint from '../../pages/EventPrint';
import { setMockOnline } from '../setup';
import { saveCachedEvents, saveCachedSongs } from '../../lib/offline-storage';
import type { Song, Event, EventSong } from '../../lib/types';

// Canonical liturgical moments
const LITURGICAL_MOMENT_NAMES = [
  'Entrada',
  'Ato Penitencial',
  'Aleluia',
  'Ofertório',
  'Santo',
  'Cordeiro',
  'Comunhão',
  'Pós-Comunhão',
  'Final',
];

const massSongsCatalog: Song[] = [
  {
    id: 'm-entrada',
    title: 'Canto de Entrada: Povo de Reis',
    artist: 'Pe. Ferreira',
    content: '{Refrão}\n[C]Povo de reis, assembleia [G]santa',
    tags: ['entrada'],
    original_key: 'C',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'm-penitencial',
    title: 'Senhor Tende Piedade',
    artist: 'Liturgia Mafra',
    content: '[Am]Senhor, tende piedade de [Em]nós',
    tags: ['ato-penitencial', 'penitencial'],
    original_key: 'Am',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'm-aleluia',
    title: 'Aleluia pascal',
    artist: 'Taizé',
    content: '[D]Aleluia, ale[A]luia',
    tags: ['aleluia'],
    original_key: 'D',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'm-ofertorio',
    title: 'Saber Esperar',
    artist: 'CNE',
    content: '[G]Bendito sejas Senhor [D]pelo pão',
    tags: ['ofertório', 'ofertorio'],
    original_key: 'G',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'm-santo',
    title: 'Santo dos Querubins',
    artist: 'Liturgia',
    content: '[C]Santo, Santo, [G]Santo é o Senhor',
    tags: ['santo'],
    original_key: 'C',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'm-cordeiro',
    title: 'Cordeiro de Deus',
    artist: 'Liturgia',
    content: '[Em]Cordeiro de Deus que tirais o [B7]pecado do mundo',
    tags: ['cordeiro'],
    original_key: 'Em',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'm-comunhao',
    title: 'Pão da Vida',
    artist: 'Pe. Zezinho',
    content: '[A]Eu sou o pão que desceu do [E]céu',
    tags: ['comunhão', 'comunhao'],
    original_key: 'A',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'm-pos-comunhao',
    title: 'Obrigado Senhor',
    artist: 'Escuteiros',
    content: '[D]Obrigado Senhor por este [A]dia',
    tags: ['pós-comunhão', 'pos-comunhao'],
    original_key: 'D',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'm-final',
    title: 'Caminhando com Maria',
    artist: 'CNE',
    content: '[F]Santa Maria do [C]caminho',
    tags: ['final', 'marianas'],
    original_key: 'F',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

const scoutMassEvent: Event = {
  id: 'evt-missa-488',
  title: 'Missa de Promessas — Agrupamento 488 de Mafra',
  date: '2026-06-07T10:30:00Z',
  location: 'Basílica do Palácio Nacional de Mafra',
  reader_1: 'Pioneira Beatriz (Equipa S. Nuno)',
  psalmist: 'Caminheiro Duarte (Clã 23)',
  reader_2: 'Dirigente Carlos (Chefia de Agrupamento)',
  prayers: 'Lobitos da Alcateia Mowgli',
  created_at: '2026-01-01',
};

const scoutMassEventSongs: EventSong[] = LITURGICAL_MOMENT_NAMES.map((momentName, index) => ({
  id: `es-${index}`,
  event_id: 'evt-missa-488',
  song_id: massSongsCatalog[index].id,
  moment_name: momentName,
  order_index: index,
  song: massSongsCatalog[index],
}));

vi.mock('../../hooks/useEvents', () => ({
  useEvent: () => ({
    event: scoutMassEvent,
    eventSongs: scoutMassEventSongs,
    loading: false,
    error: null,
  }),
}));

describe('Tier 4: Scenario B — Mass & Liturgy Preparation (Missa Escutista)', () => {
  beforeEach(async () => {
    localStorage.clear();
    window.print = vi.fn();
    // Cache event and songs into offline database
    await saveCachedEvents([scoutMassEvent]);
    await saveCachedSongs(massSongsCatalog);
  });

  it('orchestrates complete 9-moment scout mass liturgy with offline sanctuary resilience', async () => {
    // 1. Verify liturgical moments mapping matches all 9 canonical moments
    expect(scoutMassEventSongs.length).toBe(9);
    for (let i = 0; i < 9; i++) {
      expect(scoutMassEventSongs[i].moment_name).toBe(LITURGICAL_MOMENT_NAMES[i]);
      expect(scoutMassEventSongs[i].song?.title).toBe(massSongsCatalog[i].title);
    }

    // 2. Simulate offline sanctuary environment (no Wi-Fi, no mobile data)
    setMockOnline(false);
    expect(navigator.onLine).toBe(false);

    // 3. Render the full liturgical event print booklet
    render(
      <MemoryRouter initialEntries={['/evento/evt-missa-488/print']}>
        <Routes>
          <Route path="/evento/:id/print" element={<EventPrint />} />
        </Routes>
      </MemoryRouter>
    );

    // 4. Verify Event header details
    expect(await screen.findByText('Missa de Promessas — Agrupamento 488 de Mafra')).toBeInTheDocument();
    expect(screen.getByText('Basílica do Palácio Nacional de Mafra')).toBeInTheDocument();
    expect(screen.getByText(/9 músicas/i)).toBeInTheDocument();

    // 5. Verify all 9 liturgical songs are displayed in proper order
    expect(screen.getByText('Canto de Entrada: Povo de Reis')).toBeInTheDocument();
    expect(screen.getByText('Senhor Tende Piedade')).toBeInTheDocument();
    expect(screen.getByText('Aleluia pascal')).toBeInTheDocument();
    expect(screen.getByText('Saber Esperar')).toBeInTheDocument();
    expect(screen.getByText('Santo dos Querubins')).toBeInTheDocument();
    expect(screen.getByText('Cordeiro de Deus')).toBeInTheDocument();
    expect(screen.getByText('Pão da Vida')).toBeInTheDocument();
    expect(screen.getByText('Obrigado Senhor')).toBeInTheDocument();
    expect(screen.getByText('Caminhando com Maria')).toBeInTheDocument();

    // 6. Verify print action works
    const printBtn = screen.getByRole('button', { name: /Imprimir/i });
    printBtn.click();
    expect(window.print).toHaveBeenCalledTimes(1);

    // Reconnect network
    setMockOnline(true);
  });
});
