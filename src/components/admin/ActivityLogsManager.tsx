import React, { useState, useMemo } from 'react';
import { useActivityLogs } from '../../hooks/useActivityLogs';
import { useAuth } from '../../hooks/useAuth';
import { ConfirmModal } from '../common/ConfirmModal';
import { 
  History, 
  Search, 
  Filter, 
  Music, 
  Calendar, 
  Lightbulb, 
  Users, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  RefreshCw,
  X,
  ShieldAlert,
  GitCompare,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  FileText
} from 'lucide-react';
import { ActivityLog } from '../../lib/types';

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  artist: 'Artista / Autor',
  original_key: 'Tom Original',
  youtube_url: 'Link YouTube',
  tags: 'Etiquetas (Tags)',
  content: 'Letra e Acordes',
  date: 'Data do Evento',
  location: 'Localização',
  reader_1: '1ª Leitura',
  psalmist: 'Salmo Responsorial',
  reader_2: '2ª Leitura',
  prayers: 'Orações / Preces',
  gospel_acclamation: 'Versículo do Aleluia',
  songs: 'Cânticos do Evento',
  role: 'Cargo',
  name: 'Nome'
};

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

const MAX_DIFF_CACHE_ENTRIES = 60;
const diffCache = new Map<string, DiffLine[]>();

function computeLineDiff(oldText: string = '', newText: string = ''): DiffLine[] {
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

function getLogChanges(log: ActivityLog): Record<string, any> | null {
  if (log.details?.changes && typeof log.details.changes === 'object' && Object.keys(log.details.changes).length > 0) {
    return log.details.changes;
  }
  if (log.action === 'admin_renamed' && (log.details?.old_name || log.details?.new_name)) {
    return {
      name: {
        old: log.details.old_name || '(Sem nome)',
        new: log.details.new_name || log.entity_title
      }
    };
  }
  if (log.action === 'admin_role_changed' && (log.details?.old_role || log.details?.role)) {
    const oldRole = log.details.old_role === 'super_admin' ? 'Super Administrador' : 'Editor';
    const newRole = (log.details.role || log.details.new_role) === 'super_admin' ? 'Super Administrador' : 'Editor';
    return {
      role: {
        old: oldRole,
        new: newRole
      }
    };
  }
  return null;
}

interface LogChangesDiffProps {
  changes: Record<string, any>;
  isDiffOpen: boolean;
  onToggleDiff: () => void;
}

function LogChangesDiff({ changes, isDiffOpen, onToggleDiff }: LogChangesDiffProps) {
  // Tags
  const rawTags = changes.tags;
  const oldTags: string[] = Array.isArray(rawTags?.old) ? rawTags.old : [];
  const newTags: string[] = Array.isArray(rawTags?.new) ? rawTags.new : [];
  const addedTags = newTags.filter((t) => !oldTags.includes(t));
  const removedTags = oldTags.filter((t) => !newTags.includes(t));

  // Content (lyrics & chords)
  const rawContent = changes.content;
  const hasContentDiff = rawContent && (rawContent.changed || rawContent.old || rawContent.new);
  const diffLines = useMemo(() => {
    if (!hasContentDiff || !isDiffOpen) return [];
    return computeLineDiff(rawContent.old || '', rawContent.new || '');
  }, [hasContentDiff, isDiffOpen, rawContent]);

  // Songs
  const rawSongs = changes.songs;

  // Standard fields
  const standardFields = Object.entries(changes).filter(
    ([key]) => key !== 'content' && key !== 'tags' && key !== 'songs'
  );

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800/80 space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
        <GitCompare className="w-3.5 h-3.5 text-blue-500" />
        <span>Histórico de Modificações:</span>
      </div>

      {/* Standard fields */}
      {standardFields.map(([field, val]: [string, any]) => {
        const label = FIELD_LABELS[field] || field;
        const oldVal = val?.old !== undefined && val?.old !== null && val?.old !== '' ? String(val.old) : '(Vazio)';
        const newVal = val?.new !== undefined && val?.new !== null && val?.new !== '' ? String(val.new) : '(Removido)';

        return (
          <div
            key={field}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-gray-50/80 dark:bg-zinc-800/40 border border-gray-200/60 dark:border-zinc-700/60"
          >
            <span className="font-semibold text-gray-700 dark:text-zinc-300 text-xs shrink-0 sm:min-w-[140px]">
              {label}:
            </span>
            <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1 sm:justify-end">
              <span
                className="line-through text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-900/60 px-2 py-0.5 rounded text-[11px] font-mono break-all max-w-[280px]"
                title={oldVal}
              >
                {oldVal}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 shrink-0" />
              <span
                className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/60 px-2 py-0.5 rounded text-[11px] font-mono font-medium break-all max-w-[280px]"
                title={newVal}
              >
                {newVal}
              </span>
            </div>
          </div>
        );
      })}

      {/* Tags */}
      {rawTags && (
        <div className="p-2.5 rounded-xl bg-gray-50/80 dark:bg-zinc-800/40 border border-gray-200/60 dark:border-zinc-700/60 space-y-1.5">
          <div className="font-semibold text-gray-700 dark:text-zinc-300 text-xs">Etiquetas (Tags):</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {addedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium"
              >
                + {tag}
              </span>
            ))}
            {removedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-[11px] font-medium line-through"
              >
                - {tag}
              </span>
            ))}
            {addedTags.length === 0 && removedTags.length === 0 && (
              <span className="text-gray-500 dark:text-zinc-400 text-xs">Ordem das etiquetas alterada</span>
            )}
          </div>
        </div>
      )}

      {/* Event songs */}
      {rawSongs && (
        <div className="p-2.5 rounded-xl bg-gray-50/80 dark:bg-zinc-800/40 border border-gray-200/60 dark:border-zinc-700/60 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-700 dark:text-zinc-300 text-xs">Cânticos da Celebração:</span>
            {(rawSongs.total_old !== undefined || rawSongs.total_new !== undefined) && (
              <span className="text-[11px] text-gray-500 dark:text-zinc-400">
                {rawSongs.total_old ?? 0} cânticos ➔ {rawSongs.total_new ?? 0} cânticos
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {rawSongs.added?.map((title: string) => (
              <span
                key={title}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium"
              >
                + {title}
              </span>
            ))}
            {rawSongs.removed?.map((title: string) => (
              <span
                key={title}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-[11px] font-medium line-through"
              >
                - {title}
              </span>
            ))}
            {(!rawSongs.added || rawSongs.added.length === 0) && (!rawSongs.removed || rawSongs.removed.length === 0) && (
              <span className="text-gray-500 dark:text-zinc-400 text-xs">Ordem ou momentos dos cânticos atualizados</span>
            )}
          </div>
        </div>
      )}

      {/* Content Diff (lyrics/chords) */}
      {hasContentDiff && (
        <div className="p-2.5 rounded-xl bg-gray-50/80 dark:bg-zinc-800/40 border border-gray-200/60 dark:border-zinc-700/60 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-300">
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              <span>Letra & Acordes modificados</span>
            </div>
            {(rawContent.old || rawContent.new) && (
              <button
                type="button"
                onClick={onToggleDiff}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {isDiffOpen ? 'Ocultar comparação' : 'Ver diferenças na letra'}
              </button>
            )}
          </div>

          {isDiffOpen && (rawContent.old || rawContent.new) && (
            <div className="bg-zinc-950 text-zinc-100 rounded-xl p-3 font-mono text-xs overflow-x-auto max-h-60 overflow-y-auto divide-y divide-zinc-800/60 border border-zinc-800">
              {diffLines.map((line, idx) => {
                if (line.type === 'added') {
                  return (
                    <div key={idx} className="bg-emerald-950/50 text-emerald-300 px-2 py-0.5 whitespace-pre">
                      <span className="select-none font-bold text-emerald-400 mr-2">+</span>
                      {line.text}
                    </div>
                  );
                }
                if (line.type === 'removed') {
                  return (
                    <div key={idx} className="bg-red-950/50 text-red-300 px-2 py-0.5 line-through opacity-85 whitespace-pre">
                      <span className="select-none font-bold text-red-400 mr-2">-</span>
                      {line.text}
                    </div>
                  );
                }
                return (
                  <div key={idx} className="text-zinc-400 px-2 py-0.5 whitespace-pre">
                    <span className="select-none text-zinc-600 mr-2"> </span>
                    {line.text}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ActivityLogsManagerProps {
  initialUserEmail?: string | null;
  onClearUserFilter?: () => void;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'há instantes';
    if (diffMins < 60) return `há ${diffMins} min`;
    if (diffHours < 24) return `há ${diffHours}h`;
    if (diffDays === 1) return `ontem`;
    if (diffDays < 7) return `há ${diffDays} dias`;

    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

function formatExactDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return dateStr;
  }
}

function groupLogsByDay(logs: ActivityLog[]): Record<string, ActivityLog[]> {
  const groups: Record<string, ActivityLog[]> = {};
  const today = new Date().toDateString();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toDateString();

  for (const log of logs) {
    const d = new Date(log.created_at);
    const dateStr = d.toDateString();
    let label = d.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    if (dateStr === today) {
      label = 'Hoje';
    } else if (dateStr === yesterday) {
      label = 'Ontem';
    }
    // Capitalize label
    label = label.charAt(0).toUpperCase() + label.slice(1);

    if (!groups[label]) groups[label] = [];
    groups[label].push(log);
  }
  return groups;
}

export function ActivityLogsManager({ initialUserEmail, onClearUserFilter }: ActivityLogsManagerProps) {
  const { adminProfile, user } = useAuth();
  const { logs, loading, refetch, clearLogs, deleteLog } = useActivityLogs();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>(initialUserEmail || '');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');
  const [selectedActionGroup, setSelectedActionGroup] = useState<string>('all');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [expandedDiffLogs, setExpandedDiffLogs] = useState<Set<string>>(new Set());

  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleClearLogs = async () => {
    setIsActionLoading(true);
    setActionFeedback(null);
    try {
      await clearLogs();
      setActionFeedback({ type: 'success', message: 'Histórico de registos limpo com sucesso!' });
      setIsClearModalOpen(false);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Erro ao limpar histórico de registos.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteSingleLog = async () => {
    if (!deleteTargetId) return;
    setIsActionLoading(true);
    setActionFeedback(null);
    try {
      await deleteLog(deleteTargetId);
      setActionFeedback({ type: 'success', message: 'Registo eliminado com sucesso.' });
      setDeleteTargetId(null);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Erro ao eliminar registo.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const toggleContentDiff = (logId: string) => {
    setExpandedDiffLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  // Atualizar filtro de utilizador caso prop mude (sincronização durante render)
  const [prevUserEmail, setPrevUserEmail] = useState(initialUserEmail);
  if (initialUserEmail !== prevUserEmail) {
    setPrevUserEmail(initialUserEmail);
    if (initialUserEmail !== undefined) {
      setSelectedUserEmail(initialUserEmail || '');
    }
  }

  // Lista única de utilizadores presentes nos logs para o filtro
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    for (const log of logs) {
      if (log.user_email && !map.has(log.user_email)) {
        map.set(log.user_email, { name: log.user_name || log.user_email, email: log.user_email });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  // Filtragem dos logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Filtro por utilizador
      if (selectedUserEmail && log.user_email.toLowerCase() !== selectedUserEmail.toLowerCase()) {
        return false;
      }

      // 2. Filtro por tipo de entidade
      if (selectedEntityType !== 'all' && log.entity_type !== selectedEntityType) {
        return false;
      }

      // 3. Filtro por ação
      if (selectedActionGroup === 'created' && !log.action.includes('created') && !log.action.includes('invite')) {
        return false;
      }
      if (selectedActionGroup === 'updated' && !log.action.includes('updated') && !log.action.includes('implement')) {
        return false;
      }
      if (selectedActionGroup === 'deleted' && !log.action.includes('delete') && !log.action.includes('remove')) {
        return false;
      }

      // 4. Pesquisa de texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = log.entity_title?.toLowerCase().includes(q);
        const matchesUser = log.user_name?.toLowerCase().includes(q) || log.user_email?.toLowerCase().includes(q);
        const matchesAction = log.action?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesUser && !matchesAction) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedUserEmail, selectedEntityType, selectedActionGroup, searchQuery]);

  const groupedLogs = useMemo(() => groupLogsByDay(filteredLogs), [filteredLogs]);

  if (adminProfile?.role !== 'super_admin') {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-8 text-center text-amber-800 dark:text-amber-300">
        <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-80" />
        <h3 className="font-bold text-base">Acesso Restrito</h3>
        <p className="text-xs mt-1">O histórico de auditoria e logs está reservado apenas a Super Administradores.</p>
      </div>
    );
  }

  const getActionBadge = (action: string, entityType: string) => {
    // Registado no cliente pelo restauro de cópias de segurança (BackupRestore)
    if (action === 'backup_restored') {
      return {
        bg: 'bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800',
        icon: <History className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />,
        text: 'Restaurou Cópia de Segurança'
      };
    }
    if (action.includes('created') || action === 'admin_invited') {
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        icon: <PlusCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
        text: entityType === 'song' ? 'Adicionou Cântico' : entityType === 'event' ? 'Criou Missa/Evento' : 'Convidou Dirigente'
      };
    }
    if (action.includes('updated') || action.includes('role') || action.includes('name')) {
      return {
        bg: 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        icon: <Edit3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />,
        text: action.includes('name') ? 'Alterou Nome' : action.includes('role') ? 'Alterou Cargo' : 'Editou'
      };
    }
    if (action.includes('delete') || action.includes('remove')) {
      return {
        bg: 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
        icon: <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />,
        text: 'Eliminou'
      };
    }
    if (action.includes('implement') || entityType === 'suggestion') {
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />,
        text: 'Implementou Sugestão'
      };
    }
    return {
      bg: 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-zinc-700',
      icon: <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />,
      text: 'Ação'
    };
  };

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'song':
        return <Music className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'event':
        return <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'suggestion':
        return <Lightbulb className="w-4 h-4 text-amber-500" />;
      case 'admin':
        return <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      default:
        return <History className="w-4 h-4 text-gray-500" />;
    }
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedUserEmail('');
    setSelectedEntityType('all');
    setSelectedActionGroup('all');
    if (onClearUserFilter) onClearUserFilter();
  };

  const hasActiveFilters = !!searchQuery || !!selectedUserEmail || selectedEntityType !== 'all' || selectedActionGroup !== 'all';

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0 border border-purple-200 dark:border-purple-800">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Histórico de Atividade & Auditoria
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Registo cronológico do que foi criado, editado ou eliminado pelos dirigentes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading || isActionLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            title="Recarregar histórico"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-600' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => setIsClearModalOpen(true)}
            disabled={loading || isActionLoading || logs.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-900/60 rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={logs.length === 0 ? "Não existem registos para limpar" : "Limpar todo o histórico de registos"}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Logs</span>
          </button>
        </div>
      </div>

      {/* Mensagem de Feedback (Sucesso ou Erro) */}
      {actionFeedback && (
        <div className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs font-medium animate-in fade-in duration-150 ${
          actionFeedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
        }`}>
          {actionFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 leading-relaxed">
            {actionFeedback.message}
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Caixa de Filtros */}
      <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-xs space-y-3.5">
        {/* Barra de Pesquisa e Filtro de Utilizador */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-7 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Pesquisar por cântico, evento, dirigente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="sm:col-span-5">
            <select
              value={selectedUserEmail}
              onChange={(e) => setSelectedUserEmail(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="">Todos os dirigentes ({uniqueUsers.length})</option>
              {uniqueUsers.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chips de Tipo de Conteúdo e Ação */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-zinc-800/70">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-gray-500 dark:text-gray-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Tipo:
            </span>
            {[
              { id: 'all', label: 'Tudo' },
              { id: 'song', label: 'Cânticos' },
              { id: 'event', label: 'Eventos & Missas' },
              { id: 'suggestion', label: 'Sugestões' },
              { id: 'admin', label: 'Administradores' }
            ].map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setSelectedEntityType(tab.id)}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                  selectedEntityType === tab.id
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-gray-500 dark:text-gray-400 mr-1">Ação:</span>
            {[
              { id: 'all', label: 'Todas' },
              { id: 'created', label: 'Criações' },
              { id: 'updated', label: 'Edições' },
              { id: 'deleted', label: 'Eliminações' }
            ].map((action) => (
              <button
                type="button"
                key={action.id}
                onClick={() => setSelectedActionGroup(action.id)}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                  selectedActionGroup === action.id
                    ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 shadow-xs'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                }`}
              >
                {action.label}
              </button>
            ))}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-2 py-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-semibold underline cursor-pointer ml-1.5"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Timeline de Registos */}
      {loading ? (
        <div className="p-16 text-center text-gray-400">
          <div className="w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">A carregar registos de atividade...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-12 text-center">
          <History className="w-12 h-12 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">
            {hasActiveFilters ? 'Nenhum registo encontrado para este filtro.' : 'Ainda não existem registos de atividade.'}
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Tenta pesquisar por outro termo ou limpa os filtros ativos.'
              : 'Assim que os dirigentes adicionarem, editarem ou removerem cânticos e missas, todo o histórico ficará registado aqui.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="mt-4 px-4 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg transition-colors cursor-pointer"
            >
              Ver todos os registos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedLogs).map(([dayLabel, dayLogs]) => (
            <div key={dayLabel} className="space-y-3">
              {/* Separador de Data */}
              <div className="sticky top-0 z-10 flex items-center gap-2 py-2 bg-slate-50/90 dark:bg-zinc-900/90 backdrop-blur-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-3 py-1 rounded-full border border-purple-200/80 dark:border-purple-800/60 shadow-2xs">
                  {dayLabel}
                </span>
                <span className="text-xs text-gray-500 dark:text-zinc-400">
                  • {dayLogs.length} {dayLogs.length === 1 ? 'ação registada' : 'ações registadas'}
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800 ml-2" />
              </div>

              {/* Lista de Ações do Dia */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-xs divide-y divide-gray-100 dark:divide-zinc-800/80 overflow-hidden">
                {dayLogs.map((log) => {
                  const badge = getActionBadge(log.action, log.entity_type);
                  const isCurrent = user?.id === log.user_id || user?.email?.toLowerCase() === log.user_email?.toLowerCase();
                  const changes = getLogChanges(log);
                  const hasChanges = changes && Object.keys(changes).length > 0;
                  const isExpanded = expandedLogIds.has(log.id);
                  const isDiffOpen = expandedDiffLogs.has(log.id);
                  const changesCount = changes ? Object.keys(changes).length : 0;

                  return (
                    <div
                      key={log.id}
                      className="p-4 sm:p-5 flex flex-col gap-3 hover:bg-gray-50/60 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3.5 min-w-0">
                          {/* Avatar do Dirigente */}
                          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 sm:mt-0">
                            {(log.user_name || log.user_email).charAt(0).toUpperCase()}
                          </div>

                          {/* Conteúdo da Ação */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Nome do Dirigente */}
                              <button
                                type="button"
                                onClick={() => setSelectedUserEmail(log.user_email)}
                                className="font-bold text-sm text-gray-900 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer text-left truncate"
                                title={`Filtrar apenas ações de ${log.user_name || log.user_email}`}
                              >
                                {log.user_name || log.user_email}
                              </button>

                              {isCurrent && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 rounded-md font-semibold border border-gray-200 dark:border-zinc-700">
                                  Tu
                                </span>
                              )}

                              {/* Badge da Ação */}
                              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                                {badge.icon}
                                <span>{badge.text}</span>
                              </span>
                            </div>

                            {/* Título do Objeto (Cântico / Evento / etc.) */}
                            <div className="flex items-center gap-1.5 text-sm text-gray-800 dark:text-gray-200">
                              {getEntityIcon(log.entity_type)}
                              <span className="font-semibold break-all sm:break-normal">
                                "{log.entity_title}"
                              </span>
                            </div>

                            {/* Detalhes Extra (ex: artista, data da missa) - SEM TOM */}
                            {log.details && (log.details.artista || log.details.data) && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
                                {log.details.artista && (
                                  <span className="text-[11px] text-gray-500 dark:text-zinc-400">
                                    • {log.details.artista}
                                  </span>
                                )}
                                {log.details.data && (
                                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-medium">
                                    Data: {log.details.data}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Lado Direito: Botão "Ver alterações", Timestamp e Eliminar */}
                        <div className="flex sm:flex-col items-end sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span title={formatExactDateTime(log.created_at)}>
                              {formatRelativeTime(log.created_at)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDeleteTargetId(log.id)}
                              disabled={isActionLoading}
                              className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Eliminar este registo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {hasChanges && (
                            <button
                              type="button"
                              onClick={() => toggleLogExpanded(log.id)}
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                isExpanded
                                  ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700'
                                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                              }`}
                              title="Ver o histórico do que foi alterado nesta edição"
                            >
                              <GitCompare className="w-3.5 h-3.5" />
                              <span>{isExpanded ? 'Ocultar alterações' : `Ver alterações (${changesCount})`}</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Painel Expansível de Alterações */}
                      {isExpanded && changes && (
                        <LogChangesDiff
                          changes={changes}
                          isDiffOpen={isDiffOpen}
                          onToggleDiff={() => toggleContentDiff(log.id)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Limpar todos os logs */}
      <ConfirmModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={handleClearLogs}
        title="Limpar Todo o Histórico de Logs?"
        message={`Tens a certeza de que desejas apagar todos os ${logs.length} registos de atividade? Esta ação é definitiva e removerá permanentemente todo o histórico gravado.`}
        confirmText="Sim, Limpar Tudo"
        cancelText="Cancelar"
        variant="danger"
        icon="trash"
      />

      {/* Modal: Eliminar registo individual */}
      <ConfirmModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleDeleteSingleLog}
        title="Eliminar este Registo?"
        message="Tens a certeza de que desejas apagar este registo de atividade do histórico?"
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        icon="trash"
      />
    </div>
  );
}
