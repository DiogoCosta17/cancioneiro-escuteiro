import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// BD simulada: sem a migração 020, a coluna gospel_acclamation não existe
const db = { hasAcclamationColumn: false, inserted: [] as Record<string, unknown>[] };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const fails = table === 'events' && !db.hasAcclamationColumn && 'gospel_acclamation' in rows[0];
        if (!fails && table === 'events') db.inserted.push(rows[0]);
        const result = fails
          ? { data: null, error: { message: "Could not find the 'gospel_acclamation' column of 'events' in the schema cache" } }
          : { data: table === 'events' ? { id: 'novo-evento' } : rows.map((_, i) => ({ id: `es${i}` })), error: null };
        // oxlint-disable-next-line unicorn/no-thenable -- o mock imita o query builder do Supabase, que é thenable
        return { select: () => ({ single: () => Promise.resolve(result), then: (r: (v: unknown) => void) => r(result) }) };
      },
    }),
  },
}));
vi.mock('../../hooks/useSongs', () => ({ useSongs: () => ({ songs: [] }) }));
vi.mock('../../hooks/useActivityLogs', () => ({ useActivityLogs: () => ({ logAction: vi.fn() }) }));


import { EventEditor } from '../../components/admin/EventEditor';

function renderNewEventWithDraft() {
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/admin/events/new', state: { massPlan: { title: 'Missa XXXII', date: '2026-11-08', songs: [], gospelAcclamation: 'Vigiai.' } } }]}
    >
      <Routes>
        <Route path="/admin/events/new" element={<EventEditor />} />
        <Route path="/admin" element={<p>Painel</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  db.inserted = [];
});

describe('EventEditor — versículo do Aleluia', () => {
  it('o versículo escreve-se à mão, com link para o oficial da data do evento (sem IA)', () => {
    db.hasAcclamationColumn = true;
    renderNewEventWithDraft();
    expect(screen.queryByRole('button', { name: /com IA/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver o versículo oficial no liturgia.pt/ })).toHaveAttribute(
      'href',
      'https://www.liturgia.pt/liturgiadiaria/dia.php?data=2026-11-8'
    );
  });

  it('pré-preenche o versículo vindo da proposta de missa', () => {
    db.hasAcclamationColumn = true;
    renderNewEventWithDraft();
    expect(screen.getByLabelText(/Versículo do Aleluia/)).toHaveValue('Vigiai.');
  });

  it('com a migração 020 aplicada, grava o versículo', async () => {
    db.hasAcclamationColumn = true;
    renderNewEventWithDraft();
    fireEvent.click(screen.getByRole('button', { name: /Guardar Evento/ }));
    await waitFor(() => expect(screen.getByText('Painel')).toBeInTheDocument());
    expect(db.inserted[0]).toMatchObject({ title: 'Missa XXXII', gospel_acclamation: 'Vigiai.' });
  });

  it('sem a migração 020: grava o evento na mesma (com os leitores) e avisa que o versículo ficou de fora', async () => {
    db.hasAcclamationColumn = false;
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderNewEventWithDraft();
    fireEvent.click(screen.getByRole('button', { name: /Guardar Evento/ }));
    await waitFor(() => expect(screen.getByText('Painel')).toBeInTheDocument());
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toHaveProperty('reader_1');
    expect(db.inserted[0]).not.toHaveProperty('gospel_acclamation');
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('migração 020'));
    alert.mockRestore();
  });
});
