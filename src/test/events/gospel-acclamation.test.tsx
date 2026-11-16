import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Event, EventSong, Song } from '../../lib/types';
import { isAleluiaMoment } from '../../lib/liturgical-moments';
import { validateBackup, toEventRow } from '../../lib/backup-restore';

const state: { event: Event; eventSongs: EventSong[] } = { event: null as unknown as Event, eventSongs: [] };

vi.mock('../../lib/supabase', () => ({ supabase: null }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock('../../hooks/useEvents', () => ({
  useEvent: () => ({ event: state.event, eventSongs: state.eventSongs, loading: false, error: null }),
  useOfflineEventSave: () => ({ status: 'idle', record: null, progress: null, error: null, warning: null, save: vi.fn() }),
}));

import { EventView } from '../../pages/EventView';
import EventPrint from '../../pages/EventPrint';

const VERSE = 'Vigiai e estai preparados, porque não sabeis a hora.';

function song(id: string, title: string): Song {
  return { id, title, content: '[C]Aleluia', tags: [], original_key: 'C', created_at: '2026-01-01', updated_at: '2026-01-01' };
}

function setEvent(withAleluia: boolean) {
  state.event = { id: 'e1', title: 'Missa XXXII', date: '2026-11-08', location: null, gospel_acclamation: VERSE, created_at: '2026-01-01' };
  const entries: [string, Song][] = [['Entrada', song('s1', 'Povo de Deus')]];
  if (withAleluia) entries.push(['Aleluia', song('s2', 'Aleluia JMJ')]);
  state.eventSongs = entries.map(([moment, s], i) => ({ id: `es${i}`, event_id: 'e1', song_id: s.id, moment_name: moment, order_index: i, song: s }));
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/evento/:id" element={<EventView />} />
        <Route path="/evento/:id/print" element={<EventPrint />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.print = vi.fn();
});

describe('Versículo do Aleluia', () => {
  it('reconhece o momento Aleluia pelo nome guardado', () => {
    expect(isAleluiaMoment('Aleluia')).toBe(true);
    expect(isAleluiaMoment('aleluia')).toBe(true);
    expect(isAleluiaMoment('Entrada')).toBe(false);
    expect(isAleluiaMoment(null)).toBe(false);
  });

  it('página do evento: aparece no cartão do Aleluia', () => {
    setEvent(true);
    renderAt('/evento/e1');
    const verse = screen.getByText(VERSE);
    expect(verse.closest('div.p-6')).toHaveTextContent('Aleluia JMJ');
  });

  it('página do evento: sem Aleluia no alinhamento, aparece antes dos cânticos', () => {
    setEvent(false);
    renderAt('/evento/e1');
    expect(screen.getByText('Versículo do Aleluia')).toBeInTheDocument();
    expect(screen.getByText(VERSE)).toBeInTheDocument();
  });

  it('impressão: aparece no índice e na página do Aleluia', () => {
    setEvent(true);
    renderAt('/evento/e1/print');
    // Página do Aleluia
    expect(screen.getAllByText((_, el) => el?.textContent === `℣ ${VERSE}`)).toHaveLength(1);
    // Índice (folha de rosto) desligado por omissão: ligar
    fireEvent.click(screen.getByRole('button', { name: 'Índice / Folha de Rosto' }));
    expect(screen.getAllByText((_, el) => el?.textContent === `℣ ${VERSE}`).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Cópia de segurança com versículo', () => {
  const base = {
    version: '1.0',
    exported_at: '2026-11-03T10:00:00.000Z',
    songs: [],
    events: [{ id: '11111111-1111-4111-8111-111111111111', title: 'Missa', date: '2026-11-08', event_songs: [] as unknown[] }],
  };

  it('aceita o campo, valida o tamanho e só o envia quando existe', () => {
    const ok = validateBackup({ ...base, events: [{ ...base.events[0], gospel_acclamation: VERSE }] });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(toEventRow(ok.backup.events[0]).gospel_acclamation).toBe(VERSE);

    const tooLong = validateBackup({ ...base, events: [{ ...base.events[0], gospel_acclamation: 'x'.repeat(601) }] });
    expect(tooLong.ok).toBe(false);

    const old = validateBackup(base);
    expect(old.ok).toBe(true);
    if (old.ok) {
      // Sempre enviado (null) para o restauro poder limpar o versículo; omitido só em BDs sem a coluna
      expect(toEventRow(old.backup.events[0]).gospel_acclamation).toBeNull();
      expect('gospel_acclamation' in toEventRow(old.backup.events[0], false)).toBe(false);
    }
  });
});
