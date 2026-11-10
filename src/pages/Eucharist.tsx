import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSongs } from '../hooks/useSongs';
import { useRestoreReturnScroll } from '../hooks/useRestoreReturnScroll';
import { SongCard } from '../components/songs/SongCard';
import { SongCardSkeleton } from '../components/common/SongCardSkeleton';
import { LiturgicalBanner } from '../components/eucharist/LiturgicalBanner';
import { MassPlanner } from '../components/eucharist/MassPlanner';
import { CandidateBadges } from '../components/eucharist/CandidateBadges';
import { normalizeSearchText, searchAndRankSongs } from '../lib/search-utils';
import { LITURGICAL_MOMENTS } from '../lib/liturgical-moments';
import { getLiturgicalDay } from '../lib/liturgical-calendar';
import { buildMassPlan } from '../lib/mass-planner';
import { isValidISODate, nextSunday, parseEventDate, toLocalISODate } from '../lib/dates';
import { Church, Search, X, Music, Sparkles, ChevronUp, Info, BookMarked } from 'lucide-react';

const PLANNER_OPEN_KEY = 'eucharist_planner_open';

// Função auxiliar para normalizar texto de etiquetas (remove acentos e espaços extras)
export function normalizeTag(tag: unknown): string {
  return normalizeSearchText(tag);
}

export default function Eucharist() {
  const { songs, loading } = useSongs();
  const [selectedMomentId, setSelectedMomentId] = useState<string>(() => {
    try {
      return sessionStorage.getItem('eucharist_selected_moment') || 'entrada';
    } catch {
      return 'entrada';
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  // Data da missa a preparar: por omissão o próximo domingo (inclusive hoje)
  // Data da missa: ?data=YYYY-MM-DD (ex.: vindo da Liturgia Diária) ou o próximo domingo
  const [searchParams] = useSearchParams();
  const [dateISO, setDateISO] = useState(() => {
    const fromUrl = searchParams.get('data');
    if (isValidISODate(fromUrl)) return fromUrl;
    return toLocalISODate(nextSunday(new Date()));
  });
  const [plannerOpen, setPlannerOpen] = useState(() => {
    try {
      return sessionStorage.getItem(PLANNER_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });

  const targetDate = useMemo(() => parseEventDate(dateISO), [dateISO]);
  const liturgicalDay = useMemo(() => getLiturgicalDay(targetDate), [targetDate]);
  const slots = useMemo(
    () => buildMassPlan(Array.isArray(songs) ? songs : [], liturgicalDay),
    [songs, liturgicalDay]
  );

  const togglePlanner = useCallback(() => {
    setPlannerOpen(open => {
      try {
        sessionStorage.setItem(PLANNER_OPEN_KEY, open ? '0' : '1');
      } catch {}
      return !open;
    });
  }, []);

  useEffect(() => {
    document.title = 'Momentos da Eucaristia — Cancioneiro 488';
  }, []);

  const handleSelectMoment = useCallback((id: string) => {
    setSelectedMomentId(id);
    try {
      sessionStorage.setItem('eucharist_selected_moment', id);
    } catch {}
  }, []);

  const currentMoment = useMemo(() => {
    return LITURGICAL_MOMENTS.find(m => m.id === selectedMomentId) || LITURGICAL_MOMENTS[0];
  }, [selectedMomentId]);

  const currentSlot = useMemo(
    () => slots.find(slot => slot.moment.id === currentMoment.id) || null,
    [slots, currentMoment]
  );

  // Cânticos do momento (pela etiqueta ou por já terem sido usados nele), ordenados pelo que melhor
  // se adequa ao tempo litúrgico da data escolhida; com pesquisa, ordena por relevância.
  const filteredCandidates = useMemo(() => {
    const candidates = currentSlot?.candidates || [];
    if (!searchQuery.trim()) return candidates;
    const byId = new Map(candidates.map(c => [c.song.id, c]));
    return searchAndRankSongs(candidates.map(c => c.song), searchQuery, 'relevance')
      .map(song => byId.get(song.id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [currentSlot, searchQuery]);

  useRestoreReturnScroll([songs, loading]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Cabeçalho da Página */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center justify-center p-3.5 bg-amber-100 text-amber-800 rounded-2xl mb-4 shadow-sm">
          <Church className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-3">
          Momentos da Eucaristia
        </h1>
        <button
          type="button"
          onClick={togglePlanner}
          aria-expanded={plannerOpen}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#2d5016] hover:bg-[#3d6b1f] text-white text-sm font-semibold shadow-sm cursor-pointer"
        >
          {plannerOpen ? <ChevronUp className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {plannerOpen ? 'Fechar proposta' : 'Montar missa'}
        </button>
      </div>

      <LiturgicalBanner day={liturgicalDay} dateISO={dateISO} onDateChange={setDateISO}>
        <Link
          to={`/liturgia?data=${dateISO}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-xs font-semibold text-gray-700 dark:text-gray-200"
        >
          <BookMarked className="w-3.5 h-3.5" /> Ver leituras do dia
        </Link>
      </LiturgicalBanner>

      {plannerOpen && <MassPlanner key={dateISO} slots={slots} day={liturgicalDay} dateISO={dateISO} />}

      {/* Régua / Linha dos 9 Momentos da Missa */}
      <div className="mb-10 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-9 gap-2 min-w-max sm:min-w-0">
          {LITURGICAL_MOMENTS.map((moment) => {
            const isSelected = moment.id === selectedMomentId;
            return (
              <button
                key={moment.id}
                onClick={() => {
                  handleSelectMoment(moment.id);
                  setSearchQuery('');
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer whitespace-nowrap sm:whitespace-normal ${
                  isSelected
                    ? 'bg-[#2d5016] text-white border-[#2d5016] shadow-md scale-105 font-bold'
                    : 'bg-white dark:bg-zinc-900 hover:bg-green-50/60 dark:hover:bg-zinc-800 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300 shadow-sm'
                }`}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mb-1.5 ${
                  isSelected ? 'bg-white dark:bg-zinc-900 text-[#2d5016] dark:text-green-400' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
                }`}>
                  {moment.number}
                </span>
                <span className="text-xs sm:text-sm font-semibold truncate max-w-[110px] sm:max-w-none">
                  {moment.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel do Momento Ativo */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-sm font-bold">
                {currentMoment.number}
              </span>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {currentMoment.name}
              </h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              <strong>{filteredCandidates.length}</strong> {filteredCandidates.length === 1 ? 'música encontrada' : 'músicas encontradas'}
            </p>
          </div>

          {/* Barra de pesquisa dentro do momento */}
          <div className="relative w-full sm:w-72">
            <input
              id="eucharist-search-input"
              name="search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Pesquisar em ${currentMoment.name}...`}
              aria-label={`Pesquisar em ${currentMoment.name}`}
              className="w-full pl-9 pr-8 py-2 bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2d5016] focus:bg-white dark:bg-zinc-900 transition-all"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 dark:text-gray-400"
                aria-label="Limpar pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {currentSlot?.note && (
          <p className="mt-6 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            {currentSlot.note}
          </p>
        )}

        {/* Grelha de Músicas do Momento */}
        <div className="mt-8">
          {loading ? (
            <SongCardSkeleton count={6} label="A carregar cânticos..." />
          ) : filteredCandidates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCandidates.map((candidate) => (
                <div key={candidate.song.id} className="flex flex-col gap-2">
                  <SongCard song={candidate.song} />
                  <CandidateBadges candidate={candidate} season={liturgicalDay.season} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-gray-200 dark:border-zinc-800 p-6">
              <Music className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-base font-medium text-gray-700 dark:text-gray-300">Ainda não existem músicas associadas ao momento &ldquo;{currentMoment.name}&rdquo;.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
