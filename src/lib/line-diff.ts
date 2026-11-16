/**
 * Diff linha a linha entre duas versões de um texto (histórico de atividade do painel de administração).
 * Limitado para não bloquear o browser com textos muito longos.
 */

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

const MAX_DIFF_CACHE_ENTRIES = 60;
const diffCache = new Map<string, DiffLine[]>();

export function computeLineDiff(oldText: string = '', newText: string = ''): DiffLine[] {
  if (oldText === newText) {
    if (!oldText) return [];
    return oldText.split('\n').map(text => ({ type: 'unchanged', text }));
  }

  const cacheKey = `${oldText.length}:${newText.length}:${oldText.slice(0, 100)}->${newText.slice(0, 100)}:${oldText === newText ? '' : oldText + '\u0000' + newText}`;
  if (diffCache.has(cacheKey)) {
    return diffCache.get(cacheKey)!;
  }

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const n = oldLines.length;
  const m = newLines.length;

  // Bounded check: Prevent massive matrix allocation and freezing the UI thread
  if (n > 250 || m > 250 || n * m > 20000) {
    const summaryResult: DiffLine[] = [
      { type: 'removed', text: `[Versão anterior: ${n} linhas (demasiado extensa para diff linha a linha)]` },
      { type: 'added', text: `[Nova versão: ${m} linhas]` }
    ];
    if (diffCache.size >= MAX_DIFF_CACHE_ENTRIES) {
      const firstKey = diffCache.keys().next().value;
      if (firstKey) diffCache.delete(firstKey);
    }
    diffCache.set(cacheKey, summaryResult);
    return summaryResult;
  }

  // Optimize: Trim common prefix
  let start = 0;
  while (start < n && start < m && oldLines[start] === newLines[start]) {
    start++;
  }

  // Optimize: Trim common suffix
  let oldEnd = n - 1;
  let newEnd = m - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const prefixLines: DiffLine[] = oldLines.slice(0, start).map(text => ({ type: 'unchanged', text }));
  const suffixLines: DiffLine[] = oldLines.slice(oldEnd + 1).map(text => ({ type: 'unchanged', text }));

  const midOld = oldLines.slice(start, oldEnd + 1);
  const midNew = newLines.slice(start, newEnd + 1);
  const midN = midOld.length;
  const midM = midNew.length;

  let midDiff: DiffLine[] = [];

  if (midN * midM > 15000) {
    // If the changed interior is still overly massive, truncate the interior diff safely
    midDiff = [
      ...midOld.map(text => ({ type: 'removed' as const, text })),
      ...midNew.map(text => ({ type: 'added' as const, text }))
    ];
  } else {
    // Compute bounded DP matrix over the trimmed delta
    const dp: number[][] = Array.from({ length: midN + 1 }, () => Array.from({ length: midM + 1 }, () => 0));

    for (let i = 1; i <= midN; i++) {
      for (let j = 1; j <= midM; j++) {
        if (midOld[i - 1] === midNew[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = midN;
    let j = midM;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
        midDiff.unshift({ type: 'unchanged', text: midOld[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        midDiff.unshift({ type: 'added', text: midNew[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        midDiff.unshift({ type: 'removed', text: midOld[i - 1] });
        i--;
      }
    }
  }

  const result: DiffLine[] = [...prefixLines, ...midDiff, ...suffixLines];

  // Store in bounded LRU cache
  if (diffCache.size >= MAX_DIFF_CACHE_ENTRIES) {
    const firstKey = diffCache.keys().next().value;
    if (firstKey) diffCache.delete(firstKey);
  }
  diffCache.set(cacheKey, result);

  return result;
}
