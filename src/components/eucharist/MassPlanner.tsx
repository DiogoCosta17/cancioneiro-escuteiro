import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus, Info, ListPlus, Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { LiturgicalDay } from '../../lib/liturgical-calendar';
import type { MassPlanSlot } from '../../lib/mass-planner';
import { initialSelection } from '../../lib/mass-planner';
import { useAuth } from '../../hooks/useAuth';
import { useSongList } from '../../hooks/useSongList';
import { CandidateBadges } from './CandidateBadges';
import { loadDailyReadings } from '../../lib/daily-readings';
import { suggestMassSongs } from '../../lib/liturgy-ai';
import { OfficialVerseLink } from './OfficialVerseLink';

/** Proposta enviada ao editor de eventos (ver `readMassPlanState` no EventEditor). */
export interface MassPlanState {
  title: string;
  date: string;
  songs: { song_id: string; moment_name: string; song: MassPlanSlot['candidates'][number]['song'] }[];
  gospelAcclamation?: string;
}

interface MassPlannerProps {
  slots: MassPlanSlot[];
  day: LiturgicalDay;
  dateISO: string;
}

export function MassPlanner({ slots, day, dateISO }: MassPlannerProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { addSong } = useSongList();
  const [selection, setSelection] = useState<(string | null)[]>(() => initialSelection(slots));
  const [addedCount, setAddedCount] = useState<number | null>(null);
  // Depois de o utilizador mexer, as escolhas dele mantêm-se quando os cânticos atualizam
  const touched = useRef(false);
  // Sugestão com IA (só dirigentes): motivo de cada escolha, tema das leituras e versículo do Aleluia
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTheme, setAiTheme] = useState<string | null>(null);
  const [aiReasons, setAiReasons] = useState<Record<string, string>>({});
  const [acclamation, setAcclamation] = useState('');

  useEffect(() => {
    setSelection(prev => {
      if (!touched.current) return initialSelection(slots);
      return slots.map((slot, i) => (prev[i] && slot.candidates.some(c => c.song.id === prev[i]) ? prev[i] : null));
    });
  }, [slots]);

  const chosen = useMemo(
    () =>
      slots
        .map((slot, i) => ({ slot, candidate: slot.candidates.find(c => c.song.id === selection[i]) || null }))
        .filter((entry): entry is { slot: MassPlanSlot; candidate: NonNullable<typeof entry.candidate> } => entry.candidate !== null),
    [slots, selection]
  );

  const choose = (index: number, songId: string) => {
    touched.current = true;
    setAddedCount(null);
    // Escolha manual: o motivo da IA deixa de se aplicar a este momento
    const momentId = slots[index]?.moment.id;
    if (momentId && aiReasons[momentId]) {
      setAiReasons(prev => {
        const next = { ...prev };
        delete next[momentId];
        return next;
      });
    }
    setSelection(prev => prev.map((id, i) => (i === index ? songId || null : id)));
  };

  const handleSuggestWithAi = async () => {
    setAiError(null);
    setAiLoading(true);
    try {
      // Leituras da data da missa que se está a preparar (não as de hoje)
      const readings = await loadDailyReadings(dateISO);
      const suggestion = await suggestMassSongs(readings, day, slots);
      touched.current = true;
      setAddedCount(null);
      // Momentos sem escolha válida da IA mantêm o que estava
      setSelection(prev => slots.map((slot, i) => suggestion.picks[slot.moment.id]?.songId ?? prev[i] ?? null));
      setAiReasons(Object.fromEntries(Object.entries(suggestion.picks).map(([id, pick]) => [id, pick.reason])));
      setAiTheme(suggestion.theme);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Não foi possível obter a sugestão da IA.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddToList = () => {
    chosen.forEach(({ candidate }) => addSong(candidate.song.id));
    setAddedCount(chosen.length);
  };

  const handleCreateEvent = () => {
    const state: MassPlanState = {
      title: `Missa — ${day.celebration || day.seasonName}`,
      date: dateISO,
      songs: chosen.map(({ slot, candidate }) => ({
        song_id: candidate.song.id,
        moment_name: slot.moment.name,
        song: candidate.song,
      })),
      ...(acclamation.trim() ? { gospelAcclamation: acclamation.trim() } : {}),
    };
    navigate('/admin/events/new', { state: { massPlan: state } });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-5 sm:p-6 shadow-sm mb-10">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Proposta de cânticos</h2>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              Escolhidos de acordo com o tempo litúrgico. Muda o que quiseres.
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleSuggestWithAi}
            disabled={aiLoading}
            className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-sm disabled:opacity-60 cursor-pointer shrink-0"
            title="Lê as leituras deste dia e escolhe cânticos do cancioneiro que se relacionem com elas"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {aiLoading ? 'A ler as leituras...' : 'Sugerir com IA'}
          </button>
        )}
      </div>

      {aiError && (
        <p role="alert" className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-sm text-red-800 dark:text-red-300">
          {aiError}
        </p>
      )}
      {aiTheme && (
        <p className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-sm text-amber-900 dark:text-amber-200">
          <strong>Tema das leituras:</strong> {aiTheme}{' '}
          <Link to={`/liturgia?data=${dateISO}`} className="underline whitespace-nowrap">Ver leituras</Link>
        </p>
      )}

      <ol className="divide-y divide-gray-100 dark:divide-zinc-800">
        {slots.map((slot, index) => {
          const current = slot.candidates.find(c => c.song.id === selection[index]) || null;
          const takenElsewhere = new Set(selection.filter((id, i) => id && i !== index));
          const options = slot.candidates.filter(c => !takenElsewhere.has(c.song.id));
          return (
            <li key={slot.moment.id} className="py-3 grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5 items-start">
              <div className="flex items-center gap-2 pt-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 text-xs font-bold shrink-0">
                  {slot.moment.number}
                </span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{slot.moment.name}</span>
              </div>
              <div className="min-w-0 space-y-1.5">
                <select
                  value={selection[index] || ''}
                  onChange={e => choose(index, e.target.value)}
                  aria-label={`Cântico para ${slot.moment.name}`}
                  className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2d5016]"
                >
                  <option value="">{options.length === 0 ? 'Sem cânticos para este momento' : '— Nenhum —'}</option>
                  {options.map(c => (
                    <option key={c.song.id} value={c.song.id}>
                      {c.song.title}
                      {c.seasonFit === 'other' ? ` (${c.otherSeasons.join(', ')})` : ''}
                      {c.blockedReason ? ` (${c.blockedReason})` : ''}
                    </option>
                  ))}
                </select>
                {current && <CandidateBadges candidate={current} season={day.season} />}
                {current && aiReasons[slot.moment.id] && (
                  <p className="text-xs text-gray-600 dark:text-zinc-400 flex items-start gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    {aiReasons[slot.moment.id]}
                  </p>
                )}
                {slot.note && (
                  <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {slot.note}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {isAdmin && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
          <label htmlFor="planner-acclamation" className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Versículo do Aleluia <span className="text-xs font-normal text-gray-500 dark:text-zinc-400">(vai para o evento)</span>
          </label>
          <textarea
            id="planner-acclamation"
            value={acclamation}
            onChange={e => setAcclamation(e.target.value)}
            maxLength={600}
            rows={2}
            placeholder="Copia-o do liturgia.pt (opcional)."
            className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2d5016]"
          />
          <OfficialVerseLink dateISO={dateISO} />
        </div>
      )}

      <div className="mt-5 pt-5 border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-3">
        {isAdmin && (
          <button
            type="button"
            onClick={handleCreateEvent}
            disabled={chosen.length === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#2d5016] hover:bg-[#3d6b1f] text-white text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <CalendarPlus className="w-4 h-4" />
            Criar evento com esta proposta
          </button>
        )}
        <button
          type="button"
          onClick={handleAddToList}
          disabled={chosen.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <ListPlus className="w-4 h-4" />
          Adicionar à minha lista
        </button>
        {addedCount !== null && (
          <p className="text-sm text-green-700 dark:text-green-400" role="status">
            {addedCount === 1 ? '1 cântico adicionado' : `${addedCount} cânticos adicionados`} à{' '}
            <Link to="/lista" className="underline font-semibold">tua lista</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
