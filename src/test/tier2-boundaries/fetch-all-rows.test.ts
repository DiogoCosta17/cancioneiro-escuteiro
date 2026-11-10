import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tabela simulada: `order()` devolve no máximo `serverLimit` linhas (null = sem limite), `range()` a fatia pedida
let rows: { id: number }[] = [];
let serverLimit: number | null = 1000;
const rangeCalls: [number, number][] = [];

vi.mock('../../lib/supabase', () => {
  const builder = () => ({
    select: () => ({
      order: () => {
        const firstPage = Promise.resolve({
          data: serverLimit === null ? rows : rows.slice(0, serverLimit),
          error: null,
        });
        return Object.assign(firstPage, {
          range: (from: number, to: number) => {
            rangeCalls.push([from, to]);
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          },
        });
      },
    }),
  });
  return { supabase: { from: () => builder() } };
});

import { fetchAllRows } from '../../lib/fetch-all-rows';

const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('fetchAllRows: paginação sem truncar nem duplicar', () => {
  beforeEach(() => {
    rangeCalls.length = 0;
    serverLimit = 1000;
  });

  it('menos de 1000 linhas: um só pedido', async () => {
    rows = makeRows(42);
    const result = await fetchAllRows('songs', '*');
    expect(result).toHaveLength(42);
    expect(rangeCalls).toHaveLength(0);
  });

  it('mais de 1000 linhas com o limite do servidor: lê todas as páginas', async () => {
    rows = makeRows(2500);
    const result = await fetchAllRows<{ id: number }>('songs', '*');
    expect(result.map(r => r.id)).toEqual(rows.map(r => r.id));
    expect(rangeCalls).toEqual([[1000, 1999], [2000, 2999]]);
  });

  it('servidor sem limite: não duplica linhas', async () => {
    serverLimit = null;
    rows = makeRows(1500);
    const result = await fetchAllRows('songs', '*');
    expect(result).toHaveLength(1500);
    expect(rangeCalls).toHaveLength(0);
  });
});
