import { describe, it, expect } from 'vitest';
import {
  buildDuplicateTitle,
  isMassLikeEvent,
  nextSunday,
  suggestDuplicateDate,
  toLocalISODate,
} from '../../components/admin/eventDuplicate';

describe('Duplicar evento como modelo', () => {
  it('acrescenta " (cópia)" ao título sem repetir', () => {
    expect(buildDuplicateTitle('Missa de Promessas')).toBe('Missa de Promessas (cópia)');
    expect(buildDuplicateTitle('Missa de Promessas (cópia)')).toBe('Missa de Promessas (cópia)');
  });

  it('formata datas em fuso local', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('calcula o próximo domingo (inclusive)', () => {
    // 21/10/2026 é quarta-feira
    expect(toLocalISODate(nextSunday(new Date(2026, 9, 21, 15, 0)))).toBe('2026-10-25');
    // 25/10/2026 é domingo: mantém o próprio dia
    expect(toLocalISODate(nextSunday(new Date(2026, 9, 25, 9, 0)))).toBe('2026-10-25');
    // Sábado no fim do mês passa para o mês seguinte
    expect(toLocalISODate(nextSunday(new Date(2026, 9, 31)))).toBe('2026-11-01');
  });

  it('deteta eventos tipo missa pelo título ou por o original ser a um domingo', () => {
    expect(isMassLikeEvent('Missa de Natal')).toBe(true);
    expect(isMassLikeEvent('EUCARISTIA do Agrupamento')).toBe(true);
    expect(isMassLikeEvent('Fogo de Conselho', '2026-10-25')).toBe(true); // domingo
    expect(isMassLikeEvent('Fogo de Conselho', '2026-10-24')).toBe(false); // sábado
  });

  it('sugere o próximo domingo para missas e hoje para os restantes', () => {
    const wednesday = new Date(2026, 9, 21, 23, 30);
    expect(suggestDuplicateDate('Missa Dominical', '2026-01-04', wednesday)).toBe('2026-10-25');
    expect(suggestDuplicateDate('Fogo de Conselho', '2026-08-15', wednesday)).toBe('2026-10-21');
  });
});
