import React, { useEffect, useRef, useState } from 'react';
import { Upload, X, Loader2, AlertTriangle, CheckCircle2, FileJson, ShieldAlert, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSongs } from '../../hooks/useSongs';
import { useActivityLogs } from '../../hooks/useActivityLogs';
import { fetchAllRows } from '../../lib/fetch-all-rows';
import {
  BACKUP_MAX_BYTES,
  applyRestorePlan,
  buildRestorePlan,
  parseBackupText,
  type Backup,
  type CurrentEvent,
  type CurrentEventSong,
  type CurrentSong,
  type PlanStatus,
  type RestoreAdapter,
  type RestorePlan,
  type RestoreReport,
} from '../../lib/backup-restore';

type Phase = 'idle' | 'reading' | 'invalid' | 'preview' | 'applying' | 'done';

// Estado atual da BD (sempre da rede, nunca da cache offline)
async function fetchCurrentState() {
  const [songs, events, eventSongs] = await Promise.all([
    fetchAllRows<CurrentSong>('songs', '*'),
    fetchAllRows<CurrentEvent>('events', '*'),
    fetchAllRows<CurrentEventSong>('event_songs', '*'),
  ]);
  return { songs, events, eventSongs };
}

// Assinatura do que o plano vai fazer: se mudar entre a pré-visualização e a aplicação, o utilizador tem de reconfirmar
function planSignature(plan: RestorePlan): string {
  return JSON.stringify({
    summary: plan.summary,
    songs: plan.songs.map(s => [s.id, s.status, s.changedFields]),
    events: plan.events.map(e => [
      e.id,
      e.status,
      e.changedFields,
      e.eventSongsToUpsert.map(u => [u.eventSong.id, u.status]),
    ]),
  });
}

const supabaseAdapter: RestoreAdapter = {
  async upsert(table, rows) {
    const { error } = await supabase!.from(table).upsert(rows, { onConflict: 'id' });
    return { error: error ? { message: error.message } : null };
  },
};

const STATUS_LABELS: Record<PlanStatus, string> = {
  create: 'Criar',
  update: 'Atualizar',
  unchanged: 'Sem alterações',
};

const STATUS_CLASSES: Record<PlanStatus, string> = {
  create: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  update: 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  unchanged: 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-700',
};

const TABLE_LABELS = { songs: 'Música', events: 'Evento', event_songs: 'Cântico do evento' } as const;

/** Botão "Restaurar Backup" (apenas Super Admin) + diálogo de restauro. */
export function BackupRestore() {
  const { adminProfile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (adminProfile?.role !== 'super_admin') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Restaurar músicas e eventos a partir de uma cópia de segurança (JSON)"
        className="inline-flex items-center justify-center px-3.5 py-2.5 border border-blue-200 dark:border-blue-900/60 rounded-xl shadow-xs text-xs sm:text-sm font-bold text-blue-700 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
      >
        <Upload className="w-4 h-4 mr-1.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>Restaurar Backup</span>
      </button>
      {isOpen && <BackupRestoreDialog onClose={() => setIsOpen(false)} />}
    </>
  );
}

function SummaryCard({ title, counts, extra }: { title: string; counts: Record<PlanStatus, number>; extra?: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-800/40">
      <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">{title}</p>
      <div className="space-y-1 text-xs">
        {(['create', 'update', 'unchanged'] as PlanStatus[]).map(status => (
          <div key={status} className="flex items-center justify-between gap-2">
            <span className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold ${STATUS_CLASSES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
            <span className="font-bold text-gray-900 dark:text-gray-100">{counts[status]}</span>
          </div>
        ))}
        {extra}
      </div>
    </div>
  );
}

function PlanList<T extends { id: string; title: string; status: PlanStatus; changedFields: string[] }>({
  label,
  items,
  renderExtra,
}: {
  label: string;
  items: T[];
  renderExtra?: (item: T) => React.ReactNode;
}) {
  const relevant = items.filter(i => i.status !== 'unchanged');
  const unchanged = items.filter(i => i.status === 'unchanged');
  if (items.length === 0) return null;
  return (
    <details className="rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden" open={relevant.length > 0 && relevant.length <= 20}>
      <summary className="px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-zinc-800/60 cursor-pointer select-none">
        {label}: {relevant.length} a criar/atualizar · {unchanged.length} sem alterações
      </summary>
      <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800 text-xs">
        {[...relevant, ...unchanged].map(item => (
          <li key={item.id} className="px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${STATUS_CLASSES[item.status]}`}>
              {STATUS_LABELS[item.status]}
            </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</span>
            {renderExtra?.(item)}
            {item.changedFields.length > 0 && (
              <span className="text-gray-500 dark:text-gray-400">({item.changedFields.join(', ')})</span>
            )}
            <code className="w-full text-[10px] text-gray-400 dark:text-zinc-500 break-all">{item.id}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

function BackupRestoreDialog({ onClose }: { onClose: () => void }) {
  const { fetchSongs } = useSongs();
  const { logAction } = useActivityLogs();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [planChanged, setPlanChanged] = useState(false);
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<RestoreReport | null>(null);

  const isBusy = phase === 'reading' || phase === 'applying';

  // Fechar com ESC (exceto durante o restauro) e bloquear o scroll da página
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBusy, onClose]);

  const resetToIdle = () => {
    setPhase('idle');
    setFileName('');
    setErrors([]);
    setBackup(null);
    setPlan(null);
    setConfirmed(false);
    setPlanChanged(false);
    setReport(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    resetToIdle();
    setFileName(file.name);
    if (file.size > BACKUP_MAX_BYTES) {
      setErrors([`O ficheiro excede o limite de ${BACKUP_MAX_BYTES / (1024 * 1024)} MB.`]);
      setPhase('invalid');
      return;
    }
    setPhase('reading');
    try {
      const text = await file.text();
      const parsed = parseBackupText(text, file.size);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        setPhase('invalid');
        return;
      }
      if (!supabase) throw new Error('Sem ligação à base de dados.');
      const current = await fetchCurrentState();
      setBackup(parsed.backup);
      setPlan(buildRestorePlan(parsed.backup, current));
      setPhase('preview');
    } catch (err: any) {
      console.error('Erro ao preparar restauro:', err);
      setErrors([err?.message || 'Não foi possível ler o ficheiro ou obter o estado atual da base de dados.']);
      setPhase('invalid');
    }
  };

  const handleApply = async () => {
    if (!backup || !plan || !confirmed) return;
    setPhase('applying');
    setProgress('A verificar o estado atual da base de dados...');
    try {
      // A BD pode ter mudado desde a pré-visualização: recalcular o plano com o estado de agora
      const freshPlan = buildRestorePlan(backup, await fetchCurrentState());
      if (planSignature(freshPlan) !== planSignature(plan)) {
        setPlan(freshPlan);
        setConfirmed(false);
        setPlanChanged(true);
        setPhase('preview');
        return;
      }

      setProgress('A iniciar restauro...');
      const result = await applyRestorePlan(backup, plan, supabaseAdapter, setProgress);
      setReport(result);
      setPhase('done');
      // Atualizar a lista de músicas em memória/cache offline
      fetchSongs(true).catch(console.warn);
      logAction({
        action: 'backup_restored',
        entity_type: 'admin',
        entity_title: `Cópia de segurança (${fileName || 'ficheiro JSON'})`,
        details: {
          file_name: fileName,
          exported_at: backup.exported_at,
          exported_by: backup.exported_by,
          songs: plan.summary.songs,
          events: plan.summary.events,
          event_songs: plan.summary.eventSongs,
          ok: result.okCount,
          errors: result.errorCount,
        },
      });
    } catch (err: any) {
      console.error('Erro inesperado no restauro:', err);
      setErrors([err?.message || 'Ocorreu um erro inesperado durante o restauro.']);
      setPhase('invalid');
    }
  };

  const failed = report?.results.filter(r => !r.ok) || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      onClick={() => !isBusy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-restore-title"
        className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <h3 id="backup-restore-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Restaurar Cópia de Segurança
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Repõe músicas e eventos a partir de um ficheiro JSON exportado em "Backup JSON". Nada é apagado.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg disabled:opacity-40 cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4 flex-1">
          {/* Escolha do ficheiro */}
          {(phase === 'idle' || phase === 'invalid') && (
            <div className="border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl p-6 text-center">
              <FileJson className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Escolhe o ficheiro de cópia de segurança</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Formato <code>cancioneiro_backup_AAAA-MM-DD.json</code> (versão 1.0) • máximo {BACKUP_MAX_BYTES / (1024 * 1024)} MB
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Escolher Ficheiro
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          )}

          {phase === 'invalid' && errors.length > 0 && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300">
              <p className="font-bold flex items-center gap-1.5 mb-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                {fileName ? `"${fileName}" não pode ser restaurado:` : 'Não é possível restaurar:'}
              </p>
              <ul className="list-disc pl-5 space-y-0.5 max-h-48 overflow-y-auto">
                {errors.map((err, i) => <li key={i} className="break-words">{err}</li>)}
              </ul>
              <p className="mt-2 text-[11px]">Nada foi alterado na base de dados.</p>
            </div>
          )}

          {phase === 'reading' && (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              A validar o ficheiro e a comparar com a base de dados...
            </div>
          )}

          {/* Pré-visualização (dry-run) */}
          {phase === 'preview' && backup && plan && (
            <>
              {planChanged && (
                <div role="alert" className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    A base de dados mudou desde a pré-visualização anterior, por isso o plano foi recalculado.
                    Nada foi restaurado. Revê o novo resumo e confirma outra vez.
                  </span>
                </div>
              )}
              <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                <span><strong>Ficheiro:</strong> {fileName}</span>
                {backup.exported_at && (
                  <span><strong>Exportado a:</strong> {new Date(backup.exported_at).toLocaleString('pt-PT')}</span>
                )}
                {backup.exported_by && <span><strong>Por:</strong> {backup.exported_by}</span>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SummaryCard title={`Músicas (${backup.songs.length})`} counts={plan.summary.songs} />
                <SummaryCard title={`Eventos (${backup.events.length})`} counts={plan.summary.events} />
                <SummaryCard
                  title="Cânticos dos eventos"
                  counts={plan.summary.eventSongs}
                  extra={plan.summary.eventSongs.skipped > 0 ? (
                    <div className="flex items-center justify-between gap-2 text-amber-700 dark:text-amber-400 font-semibold">
                      <span>Ignorados</span>
                      <span>{plan.summary.eventSongs.skipped}</span>
                    </div>
                  ) : null}
                />
              </div>

              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Os itens a <strong>atualizar</strong> ficam iguais à versão da cópia (os dados atuais desses itens são substituídos).
                  Músicas, eventos e cânticos que não estão na cópia <strong>não são apagados</strong>.
                </span>
              </div>

              {plan.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-bold flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Avisos
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 max-h-36 overflow-y-auto">
                    {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <PlanList label="Músicas" items={plan.songs} />
              <PlanList
                label="Eventos"
                items={plan.events}
                renderExtra={(ev) => (
                  <span className="text-gray-500 dark:text-gray-400">
                    • {ev.date.split('-').reverse().join('/')}
                    {(ev.eventSongsCreate > 0 || ev.eventSongsUpdate > 0) &&
                      ` • cânticos: ${ev.eventSongsCreate} novo(s), ${ev.eventSongsUpdate} alterado(s)`}
                  </span>
                )}
              />

              {plan.isNoop ? (
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  A base de dados já está igual a esta cópia. Não há nada para restaurar.
                </p>
              ) : (
                <label className="flex items-start gap-2 text-xs text-gray-800 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Confirmo que quero criar {plan.summary.songs.create + plan.summary.events.create} e substituir{' '}
                    {plan.summary.songs.update + plan.summary.events.update} registo(s) pela versão desta cópia de segurança.
                  </span>
                </label>
              )}
            </>
          )}

          {phase === 'applying' && (
            <div className="py-10 text-center text-sm text-gray-600 dark:text-gray-300">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              {progress}
              <p className="text-xs text-gray-400 mt-1">Não feches esta janela.</p>
            </div>
          )}

          {/* Resultado */}
          {phase === 'done' && report && (
            <>
              <div
                className={`p-3.5 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                  report.errorCount === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                }`}
              >
                {report.errorCount === 0 ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
                {report.errorCount === 0
                  ? `Restauro concluído: ${report.okCount} registo(s) gravados com sucesso.`
                  : `Restauro concluído com erros: ${report.okCount} gravado(s), ${report.errorCount} com erro.`}
              </div>

              {failed.length > 0 && (
                <div className="rounded-xl border border-red-200 dark:border-red-900/60 overflow-hidden">
                  <p className="px-3 py-2 text-xs font-bold text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40">
                    Itens com erro
                  </p>
                  <ul className="max-h-56 overflow-y-auto divide-y divide-red-100 dark:divide-red-950 text-xs">
                    {failed.map(r => (
                      <li key={`${r.table}-${r.id}`} className="px-3 py-2">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{TABLE_LABELS[r.table]}: {r.label}</span>
                        <span className="text-red-700 dark:text-red-400"> — {r.error}</span>
                        <code className="block text-[10px] text-gray-400 break-all">{r.id}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                <summary className="px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-zinc-800/60 cursor-pointer">
                  Itens gravados ({report.okCount})
                </summary>
                <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800 text-xs">
                  {report.results.filter(r => r.ok).map(r => (
                    <li key={`${r.table}-${r.id}`} className="px-3 py-1.5 flex flex-wrap gap-x-2">
                      <span className={`px-1.5 rounded border text-[10px] font-semibold ${STATUS_CLASSES[r.status]}`}>
                        {r.status === 'create' ? 'Criado' : 'Atualizado'}
                      </span>
                      <span className="text-gray-800 dark:text-gray-200">{TABLE_LABELS[r.table]}: {r.label}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-2">
          {phase === 'preview' && (
            <button
              type="button"
              onClick={resetToIdle}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Escolher outro ficheiro
            </button>
          )}
          {phase === 'preview' && plan && !plan.isNoop && (
            <button
              type="button"
              onClick={handleApply}
              disabled={!confirmed}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer disabled:cursor-not-allowed"
            >
              Restaurar agora
            </button>
          )}
          {(phase === 'done' || phase === 'idle' || phase === 'invalid' || (phase === 'preview' && plan?.isNoop)) && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
