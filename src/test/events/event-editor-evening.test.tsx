import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// BD simulada: sem a migração 022, a coluna evening_mass não existe
const db = { hasEveningColumn: true, inserted: [] as Record<string, unknown>[] };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const fails = table === 'events' && !db.hasEveningColumn && 'evening_mass' in rows[0];
        if (!fails && table === 'events') db.inserted.push(rows[0]);
        const result = fails
          ? { data: null, error: { message: "Could not find the 'evening_mass' column of 'events' in the schema cache" } }
          : { data: table === 'events' ? { id: 'novo-evento' } : rows.map((_, i) => ({ id: `es${i}` })), error: null };
        // oxlint-disable-next-line unicorn/no-thenable -- o mock imita o query builder do Supabase, que é thenable
        return { select: () => ({ single: () => Promise.resolve(result), then: (r: (v: unknown) => void) => r(result) }) };
      },
    }),
  },
}));
vi.mock('../../hooks/useSongs', () => ({ useSongs: () => ({ songs: [] }) }));
vi.mock('../../hooks/useActivityLogs', () => ({ useActivityLogs: () => ({ logAction: vi.fn() }) }));

import { EventEditor, readMassPlanState } from '../../components/admin/EventEditor';

const EVENING_LABEL = 'Missa vespertina (liturgia do dia seguinte)';

function renderDraft(massPlan: Record<string, unknown>) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/admin/events/new', state: { massPlan: { songs: [], ...massPlan } } }]}>
      <Routes>
        <Route path="/admin/events/new" element={<EventEditor />} />
        <Route path="/admin" element={<p>Painel</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Guardar Evento/ }));
  await waitFor(() => expect(screen.getByText('Painel')).toBeInTheDocument());
};

beforeEach(() => {
  db.inserted = [];
  db.hasEveningColumn = true;
});

describe('EventEditor — liturgia da data e missa vespertina', () => {
  it('mostra o tempo litúrgico da data; num sábado à tarde passa para a liturgia de domingo', () => {
    renderDraft({ title: 'Missa', date: '2026-11-28' });
    const panel = screen.getByRole('region', { name: 'Liturgia da data do evento' });
    expect(panel).toHaveTextContent('Dia de semana — Tempo Comum');
    expect(panel).toHaveTextContent('Ano A');

    fireEvent.click(screen.getByLabelText(EVENING_LABEL));
    expect(panel).toHaveTextContent('I Domingo do Advento');
    expect(panel).toHaveTextContent('Advento · Ano B · Missa vespertina');
    expect(panel).toHaveTextContent('Cor litúrgica: Roxo');
    // Leituras e versículo oficial do domingo
    expect(screen.getByRole('link', { name: /Ver o versículo oficial no liturgia.pt/ })).toHaveAttribute(
      'href',
      'https://www.liturgia.pt/liturgiadiaria/dia.php?data=2026-11-29'
    );
    expect(screen.getByRole('link', { name: /Leituras/ })).toHaveAttribute('href', '/liturgia?data=2026-11-29');

    fireEvent.click(screen.getByRole('button', { name: 'Usar no título' }));
    expect(screen.getByPlaceholderText('Ex: Missa de Promessas')).toHaveValue('Missa — I Domingo do Advento');
    expect(screen.queryByRole('button', { name: 'Usar no título' })).not.toBeInTheDocument();
  });

  it('sem véspera de domingo ou solenidade não há opção nem se envia o campo', async () => {
    renderDraft({ title: 'Missa', date: '2026-11-04' });
    expect(screen.queryByLabelText(EVENING_LABEL)).not.toBeInTheDocument();
    await save();
    expect(db.inserted[0]).not.toHaveProperty('evening_mass');
  });

  it('vinda da proposta como missa vespertina: já vem marcada e grava-se', async () => {
    renderDraft({ title: 'Missa — I Domingo do Advento', date: '2026-11-28', evening: true });
    expect(screen.getByLabelText(EVENING_LABEL)).toBeChecked();
    await save();
    expect(db.inserted[0]).toMatchObject({ date: '2026-11-28', evening_mass: true });
  });

  it('sem a migração 022: grava o evento na mesma (com o versículo) e avisa', async () => {
    db.hasEveningColumn = false;
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderDraft({ title: 'Missa', date: '2026-11-28', evening: true, gospelAcclamation: 'Vigiai.' });
    await save();
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).not.toHaveProperty('evening_mass');
    expect(db.inserted[0]).toHaveProperty('gospel_acclamation', 'Vigiai.');
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('migração 022'));
    alert.mockRestore();
  });

  it('readMassPlanState só aceita evening: true', () => {
    expect(readMassPlanState({ massPlan: { title: 'M', date: '2026-11-28', songs: [], evening: true } })?.evening).toBe(true);
    expect(readMassPlanState({ massPlan: { title: 'M', date: '2026-11-28', songs: [], evening: 'sim' } })).not.toHaveProperty('evening');
  });
});
