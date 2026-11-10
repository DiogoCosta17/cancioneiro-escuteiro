// Converte uma data 'YYYY-MM-DD' numa Date à meia-noite local.
// `new Date('YYYY-MM-DD')` interpreta a string como UTC, o que mostra o dia anterior a oeste de UTC.
export function parseEventDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return new Date(value);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

// Data local em 'YYYY-MM-DD' (toISOString usa UTC e pode devolver o dia anterior/seguinte)
export function toLocalISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True se `value` é 'YYYY-MM-DD' e uma data real (rejeita ex.: 2026-02-31, que a Date faria transbordar). */
export function isValidISODate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseEventDate(value);
  return !Number.isNaN(d.getTime()) && toLocalISODate(d) === value;
}

/** Próximo domingo a partir de `today` (inclusive: se hoje for domingo, devolve hoje). */
export function nextSunday(today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d;
}
