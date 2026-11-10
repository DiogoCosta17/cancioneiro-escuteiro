import { parseEventDate, toLocalISODate, nextSunday } from '../../lib/dates';
import { normalizeSearchText } from '../../lib/search-utils';

/**
 * Funções puras para "Duplicar evento como modelo".
 * Nada aqui escreve na base de dados: apenas prepara os valores iniciais do formulário.
 */

export { toLocalISODate, nextSunday };

export const COPY_SUFFIX = ' (cópia)';

/** Acrescenta " (cópia)" ao título, sem repetir o sufixo ao duplicar uma cópia. */
export function buildDuplicateTitle(title: string): string {
  const base = (title || '').trim();
  if (!base) return COPY_SUFFIX.trim();
  return base.endsWith(COPY_SUFFIX.trim()) ? base : `${base}${COPY_SUFFIX}`;
}

const MASS_KEYWORDS = ['missa', 'eucaristia', 'celebracao eucaristica'];

/**
 * Um evento é tratado como "missa" se o título o indicar ou se o original calhou a um domingo.
 */
export function isMassLikeEvent(title: string, sourceDate?: string | null): boolean {
  const normalized = normalizeSearchText(title);
  if (MASS_KEYWORDS.some(k => normalized.includes(k))) return true;
  if (sourceDate) {
    const d = parseEventDate(sourceDate);
    if (!Number.isNaN(d.getTime()) && d.getDay() === 0) return true;
  }
  return false;
}

/**
 * Data sugerida para a cópia: próximo domingo (inclusive hoje) para missas, senão hoje.
 * Sempre em fuso local, no formato 'YYYY-MM-DD'.
 */
export function suggestDuplicateDate(sourceTitle: string, sourceDate: string | null | undefined, today: Date = new Date()): string {
  const base = isMassLikeEvent(sourceTitle, sourceDate) ? nextSunday(today) : today;
  return toLocalISODate(base);
}
