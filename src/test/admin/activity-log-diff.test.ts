import { describe, it, expect } from 'vitest';
import { computeLineDiff, type DiffLine } from '../../lib/line-diff';

const lines = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix} ${i}`).join('\n');
const byType = (diff: DiffLine[], type: DiffLine['type']) => diff.filter((l) => l.type === type).map((l) => l.text);

describe('Diff do histórico de atividade (computeLineDiff)', () => {
  it('textos iguais: tudo inalterado; textos vazios: nada', () => {
    expect(computeLineDiff('', '')).toEqual([]);
    expect(computeLineDiff('a\nb', 'a\nb')).toEqual([
      { type: 'unchanged', text: 'a' },
      { type: 'unchanged', text: 'b' },
    ]);
  });

  it('marca só as linhas alteradas e mantém as comuns no início e no fim', () => {
    const before = ['Linha 1', 'Linha 2', 'Verso antigo A', 'Verso antigo B', 'Linha 10'].join('\n');
    const after = ['Linha 1', 'Linha 2', 'Verso novo A', 'Linha 10'].join('\n');
    expect(computeLineDiff(before, after)).toEqual([
      { type: 'unchanged', text: 'Linha 1' },
      { type: 'unchanged', text: 'Linha 2' },
      { type: 'removed', text: 'Verso antigo A' },
      { type: 'removed', text: 'Verso antigo B' },
      { type: 'added', text: 'Verso novo A' },
      { type: 'unchanged', text: 'Linha 10' },
    ]);
  });

  it('reconhece linhas que se mantêm a meio de uma zona alterada', () => {
    const diff = computeLineDiff('a\nx\nb', 'a\ny\nx\nz\nb');
    expect(byType(diff, 'unchanged')).toEqual(['a', 'x', 'b']);
    expect(byType(diff, 'added')).toEqual(['y', 'z']);
    expect(byType(diff, 'removed')).toEqual([]);
  });

  it('textos com mais de 250 linhas: mostra só um resumo (não bloqueia o browser)', () => {
    const diff = computeLineDiff(lines('Antiga', 600), lines('Nova', 600));
    expect(diff).toEqual([
      { type: 'removed', text: '[Versão anterior: 600 linhas (demasiado extensa para diff linha a linha)]' },
      { type: 'added', text: '[Nova versão: 600 linhas]' },
    ]);
  });

  it('zona alterada grande demais para comparar linha a linha: lista removidas e depois adicionadas', () => {
    // 130 × 130 linhas cabe no limite total, mas não na comparação detalhada
    const diff = computeLineDiff(lines('Antiga', 130), lines('Nova', 130));
    expect(diff).toHaveLength(260);
    expect(diff.slice(0, 130).every((l) => l.type === 'removed')).toBe(true);
    expect(diff.slice(130).every((l) => l.type === 'added')).toBe(true);
  });

  it('o mesmo par de textos devolve o resultado guardado em cache', () => {
    const first = computeLineDiff('um\ndois', 'um\ntrês');
    expect(computeLineDiff('um\ndois', 'um\ntrês')).toBe(first);
  });
});
