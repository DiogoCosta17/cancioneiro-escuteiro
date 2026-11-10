import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const insert = vi.fn();
// Linhas efetivamente gravadas na "BD"
const saved: unknown[] = [];
const selectList = vi.fn();
const auth = { user: { id: 'u1', email: 'editor@escutas.pt', user_metadata: {} }, adminProfile: { name: 'Editor', role: 'editor' } };

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      // Como na BD real: o INSERT funciona para qualquer admin, mas pedir a linha de volta
      // (RETURNING) exige a permissão de leitura, que só o super_admin tem — e então o INSERT é anulado.
      insert: (rows: unknown[]) => {
        insert(rows);
        saved.push(...rows);
        const result = Promise.resolve({ error: null });
        return Object.assign(result, {
          select: () => ({
            single: () => {
              if (auth.adminProfile.role !== 'super_admin') saved.splice(saved.length - rows.length, rows.length);
              return Promise.resolve(
                auth.adminProfile.role === 'super_admin'
                  ? { data: rows[0], error: null }
                  : { data: null, error: { message: 'new row violates row-level security policy' } }
              );
            },
          }),
        });
      },
      select: () => ({
        order: () => ({ limit: () => selectList() }),
      }),
    }),
  },
}));

import { useActivityLogs } from '../../hooks/useActivityLogs';

const suggestionLog = { action: 'suggestion_implemented', entity_type: 'suggestion' as const, entity_title: 'Nova canção' };

beforeEach(() => {
  insert.mockReset();
  saved.length = 0;
  selectList.mockReset();
  selectList.mockResolvedValue({ data: [], error: null });
});

describe('logAction', () => {
  it('regista as ações de um editor (sem pedir a linha de volta, que a RLS recusa)', async () => {
    auth.adminProfile = { name: 'Editor', role: 'editor' };
    const { result } = renderHook(() => useActivityLogs());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await act(() => result.current.logAction(suggestionLog));

    expect(saved).toHaveLength(1);
    expect(insert.mock.calls[0][0][0]).toMatchObject({ user_id: 'u1', user_name: 'Editor', action: 'suggestion_implemented' });
    expect(warn).not.toHaveBeenCalled();
    // O editor não vê o histórico: nada para recarregar
    expect(selectList).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('para o super_admin, recarrega o histórico para mostrar o novo registo', async () => {
    auth.adminProfile = { name: 'Chefe', role: 'super_admin' };
    const { result } = renderHook(() => useActivityLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(selectList).toHaveBeenCalledTimes(1);

    const newRow = { id: 'l1', ...suggestionLog, user_name: 'Chefe', created_at: '2026-11-03T10:00:00Z' };
    selectList.mockResolvedValueOnce({ data: [newRow], error: null });
    await act(() => result.current.logAction(suggestionLog));

    expect(insert).toHaveBeenCalledTimes(1);
    expect(selectList).toHaveBeenCalledTimes(2);
    expect(result.current.logs).toEqual([newRow]);
  });
});
