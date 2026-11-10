import { supabase } from './supabase';

/** O Supabase devolve no máximo 1000 linhas por pedido (limite por omissão do PostgREST). */
export const PAGE_SIZE = 1000;

export interface FetchAllRowsOptions {
  /** Coluna de ordenação estável usada para paginar (tem de ser única). Por omissão 'id'. */
  orderBy?: string;
  /** Se definido, a primeira página falha com este tempo limite (ms); as seguintes não têm limite. */
  firstPageTimeoutMs?: number;
  timeoutMessage?: string;
}

/**
 * Lê todas as linhas de uma tabela por páginas, para não truncar silenciosamente a 1000 linhas.
 * A primeira página é pedida sem `.range()` (o servidor já limita a 1000), por isso o caso comum
 * continua a ser um único pedido; só se pede mais quando a página vem cheia.
 * A ordem é por coluna única (por omissão `id`) para que a paginação seja determinística:
 * quem precisar de outra ordenação (ex.: título) deve ordenar depois no cliente.
 */
export async function fetchAllRows<T>(
  table: string,
  columns: string,
  options: FetchAllRowsOptions = {}
): Promise<T[]> {
  if (!supabase) throw new Error('Supabase não inicializado');
  const { orderBy = 'id', firstPageTimeoutMs, timeoutMessage = 'Tempo limite de ligação excedido' } = options;

  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const base = supabase.from(table).select(columns).order(orderBy);
    const query = from === 0 ? base : base.range(from, from + PAGE_SIZE - 1);

    let result: { data: unknown; error: unknown };
    if (from === 0 && firstPageTimeoutMs) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), firstPageTimeoutMs);
      });
      try {
        result = await Promise.race([query as PromiseLike<{ data: unknown; error: unknown }>, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } else {
      result = await (query as PromiseLike<{ data: unknown; error: unknown }>);
    }

    if (result.error) throw result.error;
    const rows = (result.data || []) as T[];
    all.push(...rows);
    // Só há mais páginas se esta veio exatamente cheia. Se a primeira trouxe mais de PAGE_SIZE linhas,
    // o servidor não tem limite e já devolveu tudo (pedir .range() a seguir duplicaria linhas).
    if (rows.length !== PAGE_SIZE) break;
  }
  return all;
}
