import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import type { LiturgicalColor, LiturgicalDay } from '../../lib/liturgical-calendar';
import { COLOR_NAMES } from '../../lib/liturgical-calendar';
import { parseEventDate } from '../../lib/dates';

// Cor litúrgica: barra lateral e ponto da legenda
const COLOR_CLASSES: Record<LiturgicalColor, { bar: string; dot: string }> = {
  roxo: { bar: 'bg-purple-700', dot: 'bg-purple-700' },
  rosa: { bar: 'bg-pink-400', dot: 'bg-pink-400' },
  branco: { bar: 'bg-amber-200', dot: 'bg-white border border-gray-300 dark:border-zinc-500' },
  vermelho: { bar: 'bg-red-600', dot: 'bg-red-600' },
  verde: { bar: 'bg-[#2d5016]', dot: 'bg-[#2d5016] dark:bg-green-600' },
};

interface LiturgicalBannerProps {
  day: LiturgicalDay;
  dateISO: string;
  onDateChange: (value: string) => void;
  /** Texto por cima do seletor de data. */
  dateLabel?: string;
  /** Nome a mostrar quando o calendário não tem celebração para o dia (ex.: nome do dia segundo a fonte das leituras). */
  fallbackTitle?: string | null;
  /** Links ou botões extra por baixo do nome do dia. */
  children?: ReactNode;
}

export function LiturgicalBanner({
  day,
  dateISO,
  onDateChange,
  dateLabel = 'Preparar para o dia',
  fallbackTitle,
  children,
}: LiturgicalBannerProps) {
  const colors = COLOR_CLASSES[day.color];
  const formatted = parseEventDate(dateISO).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const longDate = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  return (
    <div className="relative overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm mb-8">
      <div className={`absolute inset-y-0 left-0 w-1.5 ${colors.bar}`} aria-hidden="true" />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 pl-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
            {day.seasonName} · Ano {day.cycle}
          </p>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">
            {day.celebration || fallbackTitle || `Dia de semana — ${day.seasonName}`}
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{longDate}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`inline-block w-3 h-3 rounded-full ${colors.dot}`} aria-hidden="true" />
              Cor litúrgica: {COLOR_NAMES[day.color]}
            </span>
          </p>
          {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 dark:text-zinc-400 shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            {dateLabel}
          </span>
          <input
            type="date"
            value={dateISO}
            onChange={e => {
              if (e.target.value) onDateChange(e.target.value);
            }}
            className="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2d5016]"
          />
        </label>
      </div>
    </div>
  );
}
