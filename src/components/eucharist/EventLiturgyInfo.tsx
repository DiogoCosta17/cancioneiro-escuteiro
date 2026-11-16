import { Link } from 'react-router-dom';
import { BookMarked, Church } from 'lucide-react';
import type { LiturgicalDay } from '../../lib/liturgical-calendar';
import { COLOR_NAMES } from '../../lib/liturgical-calendar';
import { COLOR_CLASSES } from './liturgical-colors';

interface EventLiturgyInfoProps {
  /** Dia litúrgico já calculado com a opção de missa vespertina. */
  day: LiturgicalDay;
  /** Data das leituras (a do dia seguinte numa missa vespertina). */
  readingsDateISO: string;
  evening: boolean;
  /** A data escolhida é véspera de domingo ou solenidade (pode ter missa vespertina). */
  eveningAvailable: boolean;
  onEveningChange: (value: boolean) => void;
  /** Mostra "Usar no título" quando o título ainda não é este. */
  currentTitle: string;
  onUseTitle: (title: string) => void;
}

/** Tempo litúrgico da data do evento, no editor de eventos. */
export function EventLiturgyInfo({
  day,
  readingsDateISO,
  evening,
  eveningAvailable,
  onEveningChange,
  currentTitle,
  onUseTitle,
}: EventLiturgyInfoProps) {
  const colors = COLOR_CLASSES[day.color];
  const suggestedTitle = day.celebration ? `Missa — ${day.celebration}` : null;
  const linkClass =
    'inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-xs font-semibold text-gray-700 dark:text-gray-200';

  return (
    <section
      aria-label="Liturgia da data do evento"
      className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 p-3 pl-4"
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${colors.bar}`} aria-hidden="true" />
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
        {day.seasonName} · Ano {day.cycle}
        {day.anticipated && ' · Missa vespertina'}
      </p>
      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
        {day.celebration || `Dia de semana — ${day.seasonName}`}
      </p>
      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 inline-flex items-center gap-1.5">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors.dot}`} aria-hidden="true" />
        Cor litúrgica: {COLOR_NAMES[day.color]}
      </p>

      {eveningAvailable && (
        <label className="mt-2 flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={evening}
            onChange={e => onEveningChange(e.target.checked)}
            className="w-4 h-4 accent-[#2d5016]"
          />
          Missa vespertina (liturgia do dia seguinte)
        </label>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {suggestedTitle && currentTitle.trim() !== suggestedTitle && (
          <button type="button" onClick={() => onUseTitle(suggestedTitle)} className={`${linkClass} cursor-pointer`}>
            Usar no título
          </button>
        )}
        <Link to={`/liturgia?data=${readingsDateISO}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
          <BookMarked className="w-3.5 h-3.5" /> Leituras
        </Link>
        <Link to={`/eucaristia?data=${readingsDateISO}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
          <Church className="w-3.5 h-3.5" /> Cânticos sugeridos
        </Link>
      </div>
    </section>
  );
}
