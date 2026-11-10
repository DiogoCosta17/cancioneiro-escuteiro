import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookMarked, ChevronLeft, ChevronRight, Church, ExternalLink, Loader2, WifiOff } from 'lucide-react';
import { LiturgicalBanner } from '../components/eucharist/LiturgicalBanner';
import { useDailyReadings } from '../hooks/useDailyReadings';
import { getLiturgicalDay } from '../lib/liturgical-calendar';
import { isValidISODate, parseEventDate, toLocalISODate } from '../lib/dates';
import type { ReadingKind } from '../lib/daily-readings';
import {
  READINGS_SOURCE_NAME,
  READINGS_SOURCE_URL,
  READINGS_TRANSLATION,
  evangelhoQuotidianoUrl,
  liturgiaPtUrl,
} from '../lib/daily-readings';

const DATE_PARAM = 'data';

const KIND_STYLES: Record<ReadingKind, string> = {
  first: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  psalm: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  second: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  gospel: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300',
};

function validDate(value: string | null): string | null {
  return isValidISODate(value) ? value : null;
}

function shiftDate(dateISO: string, days: number): string {
  const d = parseEventDate(dateISO);
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

export default function Liturgy() {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = toLocalISODate(new Date());
  const dateISO = validDate(searchParams.get(DATE_PARAM)) || today;
  const day = useMemo(() => getLiturgicalDay(parseEventDate(dateISO)), [dateISO]);
  const { data, loading, error, unavailable } = useDailyReadings(dateISO);

  useEffect(() => {
    document.title = 'Liturgia Diária — Cancioneiro 488';
  }, []);

  const setDate = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === today) next.delete(DATE_PARAM);
    else next.set(DATE_PARAM, value);
    setSearchParams(next, { replace: true });
  };

  const navButton =
    'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-xs font-semibold text-gray-700 dark:text-gray-200 cursor-pointer';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3.5 bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 rounded-2xl mb-4 shadow-sm">
          <BookMarked className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">Liturgia Diária</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">As leituras da missa de cada dia, para acompanhar a celebração.</p>
      </div>

      <LiturgicalBanner day={day} dateISO={dateISO} onDateChange={setDate} dateLabel="Dia" fallbackTitle={data?.title}>
        <button type="button" className={navButton} onClick={() => setDate(shiftDate(dateISO, -1))} aria-label="Dia anterior">
          <ChevronLeft className="w-3.5 h-3.5" /> Anterior
        </button>
        {dateISO !== today && (
          <button type="button" className={navButton} onClick={() => setDate(today)}>
            Hoje
          </button>
        )}
        <button type="button" className={navButton} onClick={() => setDate(shiftDate(dateISO, 1))} aria-label="Dia seguinte">
          Seguinte <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <Link to={`/eucaristia?data=${dateISO}`} className={navButton}>
          <Church className="w-3.5 h-3.5" /> Cânticos para este dia
        </Link>
        <a href={liturgiaPtUrl(dateISO)} target="_blank" rel="noopener noreferrer" className={navButton}>
          <ExternalLink className="w-3.5 h-3.5" /> Oficial (liturgia.pt)
        </a>
      </LiturgicalBanner>

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500 dark:text-zinc-400" role="status">
          <Loader2 className="w-5 h-5 animate-spin" /> A carregar as leituras...
        </div>
      )}

      {error && !data && (
        <div role="alert" className="p-6 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm flex items-start gap-3">
          <WifiOff className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar as leituras deste dia.</p>
            <p className="mt-1">
              {unavailable
                ? 'As leituras deste dia ainda não estão publicadas na fonte (data demasiado no futuro).'
                : 'É preciso ligação à internet para abrir um dia pela primeira vez. Os dias já abertos ficam guardados neste dispositivo.'}
            </p>
            <a href={liturgiaPtUrl(dateISO)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold underline">
              Ver as leituras deste dia no liturgia.pt <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {data.readings.map(reading => (
            <article
              key={reading.kind}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-5 sm:p-7 shadow-sm"
            >
              <header className="mb-4">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${KIND_STYLES[reading.kind]}`}>
                  {reading.label}
                </span>
                <h2 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">{reading.reference}</h2>
              </header>
              {reading.refrain && (
                <p className="mb-4 font-semibold text-gray-900 dark:text-gray-100">
                  <span className="text-amber-700 dark:text-amber-400">R/</span> {reading.refrain}
                </p>
              )}
              <p
                className={`whitespace-pre-line leading-relaxed text-gray-800 dark:text-gray-200 ${
                  reading.kind === 'psalm' ? 'text-[15px] italic' : 'text-base'
                }`}
              >
                {reading.text}
              </p>
              {reading.kind === 'psalm' && !reading.refrain && (
                <p className="mt-4 pt-3 border-t border-gray-100 dark:border-zinc-800 text-xs text-gray-500 dark:text-zinc-400">
                  O refrão (R/) deste salmo não veio da fonte. Vê-o em{' '}
                  <a href={evangelhoQuotidianoUrl(dateISO)} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-[#2d5016] dark:text-green-400">
                    Evangelho Quotidiano
                  </a>{' '}
                  ou no{' '}
                  <a href={liturgiaPtUrl(dateISO)} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-[#2d5016] dark:text-green-400">
                    liturgia.pt
                  </a>
                  .
                </p>
              )}
            </article>
          ))}

          <p className="text-xs text-center text-gray-500 dark:text-zinc-400">
            {READINGS_TRANSLATION}. Textos obtidos de{' '}
            <a href={READINGS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-200">
              {READINGS_SOURCE_NAME}
            </a>
            . A versão oficial, com a aclamação ao Evangelho, está no{' '}
            <a href={liturgiaPtUrl(dateISO)} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-200">
              Secretariado Nacional de Liturgia
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
