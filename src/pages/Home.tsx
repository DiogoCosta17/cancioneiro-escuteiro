import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSongs } from '../hooks/useSongs';
import { useFavorites } from '../hooks/useFavorites';
import { useRestoreReturnScroll } from '../hooks/useRestoreReturnScroll';
import { getRecentlyViewedSongs } from '../lib/offline-storage';
import { Song } from '../lib/types';
import { SongCard } from '../components/songs/SongCard';
import { SongCardSkeleton } from '../components/common/SongCardSkeleton';
import {
  searchAndRankSongs,
  normalizeSearchText,
  SongSortOption,
} from '../lib/search-utils';
import { Search, X, ChevronDown, Music, ArrowUpDown, Heart, Clock } from 'lucide-react';

type QuickFilterId = 'todos' | 'escutistas' | 'fogo' | 'eucaristia' | 'marianas' | 'video';

interface QuickFilterOption {
  id: QuickFilterId;
  label: string;
  keywords: string[];
}

const QUICK_FILTERS: QuickFilterOption[] = [
  { id: 'todos', label: 'Todos', keywords: [] },
  {
    id: 'escutistas',
    label: 'Escutistas',
    keywords: ['escutista', 'escutistas', 'escutismo', 'promessa', 'bp', 'baden powell', 'flor de lis', 'patrulha'],
  },
  {
    id: 'fogo',
    label: 'Fogo de Conselho',
    keywords: ['fogo', 'fogo de conselho', 'reflexao', 'noite', 'acampamento'],
  },
  {
    id: 'eucaristia',
    label: 'Eucaristia',
    keywords: [
      'eucaristia',
      'entrada',
      'penitencial',
      'aleluia',
      'ofertorio',
      'santo',
      'cordeiro',
      'comunhao',
      'pos-comunhao',
      'final',
    ],
  },
  {
    id: 'marianas',
    label: 'Marianas',
    keywords: ['maria', 'mariana', 'marianas', 'nossa senhora', 'ave maria'],
  },
  {
    id: 'video',
    label: 'Com Vídeo',
    keywords: [],
  },
];

const MAX_FAVORITES_SHOWN = 30;
const MAX_RECENTS_SHOWN = 10;

interface QuickSongRowProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  songs: Song[];
}

// Linha horizontal compacta de atalhos para cânticos (Favoritos / Recentes)
function QuickSongRow({ id, label, icon, songs }: QuickSongRowProps) {
  return (
    <section aria-labelledby={id} className="mb-5">
      <h2
        id={id}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2"
      >
        {icon}
        {label}
      </h2>
      <ul className="flex items-stretch gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {songs.map((song) => (
          <li key={song.id} className="shrink-0">
            <Link
              to={`/song/${song.id}`}
              className="flex flex-col justify-center h-full w-40 sm:w-48 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm transition-all"
            >
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{song.title}</span>
              {song.artist && (
                <span className="text-xs text-gray-500 dark:text-zinc-400 truncate">{song.artist}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  const { songs, loading } = useSongs();
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return sessionStorage.getItem('home_search_query') || '';
    } catch {
      return '';
    }
  });
  const [activeFilter, setActiveFilter] = useState<QuickFilterId>('todos');
  const [sortBy, setSortBy] = useState<SongSortOption>('az');
  const { favoriteIds } = useFavorites();
  // Lido uma vez por visita à Home (é atualizado ao abrir um cântico)
  const [recentEntries] = useState(() => getRecentlyViewedSongs());

  useEffect(() => {
    document.title = 'Cancioneiro 488 — Agrupamento 488 Mafra';
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    try {
      if (val) {
        sessionStorage.setItem('home_search_query', val);
      } else {
        sessionStorage.removeItem('home_search_query');
      }
    } catch {}
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveFilter('todos');
    try {
      sessionStorage.removeItem('home_search_query');
    } catch {}
  };

  const filteredSongs = useMemo(() => {
    if (!Array.isArray(songs)) return [];

    // 1. Apply Quick Filter chip
    let subset = songs;
    if (activeFilter === 'video') {
      subset = songs.filter(
        (song) => song && typeof song.youtube_url === 'string' && song.youtube_url.trim().length > 0
      );
    } else if (activeFilter !== 'todos') {
      const filterConfig = QUICK_FILTERS.find((f) => f.id === activeFilter);
      if (filterConfig && filterConfig.keywords.length > 0) {
        subset = songs.filter((song) => {
          if (!song) return false;
          const normTitle = normalizeSearchText(song.title);
          const normTags = Array.isArray(song.tags)
            ? song.tags.map((t) => normalizeSearchText(t))
            : [];
          return filterConfig.keywords.some(
            (kw) =>
              normTags.some((t) => t.includes(kw)) || normTitle.includes(kw)
          );
        });
      }
    }

    // 2. Apply accent-insensitive weighted search & sort
    const effectiveSort: SongSortOption =
      searchQuery.trim() && sortBy === 'az' ? 'relevance' : sortBy;
    return searchAndRankSongs(subset, searchQuery, effectiveSort);
  }, [songs, activeFilter, searchQuery, sortBy]);

  const songsById = useMemo(() => {
    const map = new Map<string, Song>();
    if (Array.isArray(songs)) {
      for (const song of songs) {
        if (song && song.id) map.set(song.id, song);
      }
    }
    return map;
  }, [songs]);

  // Ids resolvidos contra a lista carregada: cânticos apagados são ignorados
  const favoriteSongs = useMemo(() => {
    const result: Song[] = [];
    for (const id of favoriteIds) {
      const song = songsById.get(id);
      if (song) result.push(song);
      if (result.length >= MAX_FAVORITES_SHOWN) break;
    }
    return result;
  }, [favoriteIds, songsById]);

  const recentSongs = useMemo(() => {
    const result: Song[] = [];
    for (const entry of recentEntries) {
      const song = songsById.get(entry.id);
      if (song) result.push(song);
      if (result.length >= MAX_RECENTS_SHOWN) break;
    }
    return result;
  }, [recentEntries, songsById]);

  const isBrowsing = !searchQuery.trim() && activeFilter === 'todos';
  const showFavorites = !loading && isBrowsing && favoriteSongs.length > 0;
  const showRecents = !loading && isBrowsing && recentSongs.length > 0;

  useRestoreReturnScroll([songs, loading]);

  const scrollToCatalog = () => {
    const el = document.getElementById('catalogo');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const openSpotlight = () => {
    window.dispatchEvent(new Event('open-command-palette'));
  };

  return (
    <div className="w-full">
      {/* HERO SECTION com foto de grupo do Agrupamento 488 de fundo (Estilo Vitamina C) */}
      <section className="relative min-h-[75vh] sm:min-h-[82vh] flex flex-col justify-center items-center text-white px-4 py-16 bg-slate-900 overflow-hidden">
        {/* Foto de fundo */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105 transform transition-transform duration-1000 ease-out"
          style={{ backgroundImage: `url('/hero-bg.jpg')` }}
        />

        {/* Overlay escuro / gradiente cinematográfico para contraste perfeito */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-slate-950/90 backdrop-blur-[0.5px]" />

        {/* Conteúdo Central */}
        <div className="relative z-10 max-w-3xl w-full text-center flex flex-col items-center">
          {/* Logo do Agrupamento */}
          <div className="mb-4">
            <img
              src="/logo.png"
              alt="Logo Agrupamento 488"
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-white/60 shadow-2xl bg-white/10 p-1 backdrop-blur-sm object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          {/* Título Principal */}
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white mb-2 drop-shadow-lg">
            CANCIONEIRO <span className="text-amber-400">488</span>
          </h1>
          <p className="text-sm sm:text-base text-gray-200 font-medium mb-8 max-w-xl drop-shadow">
            Cancioneiro do Agrupamento 488 • Sempre Alerta ⚜️
          </p>

          {/* Barra de Pesquisa Flutuante */}
          <div className="w-full max-w-xl relative">
            <div className="relative flex items-center shadow-2xl rounded-full bg-white dark:bg-zinc-900/95 backdrop-blur-md border border-white/20 p-1.5 focus-within:ring-2 focus-within:ring-amber-400 transition-all">
              <input
                id="home-search-input"
                name="search"
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Pesquisar música, artista ou letra..."
                aria-label="Pesquisar música, artista ou letra"
                className="w-full pl-5 pr-24 py-3 rounded-full text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none text-sm sm:text-base bg-transparent"
              />
              {searchQuery ? (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-14 text-gray-400 hover:text-gray-600 dark:text-gray-400 p-1 cursor-pointer"
                  aria-label="Limpar pesquisa"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openSpotlight}
                  title="Abrir Pesquisa Rápida (Ctrl+K)"
                  className="hidden sm:flex items-center gap-1 absolute right-14 px-2 py-1 rounded-md bg-gray-100 dark:bg-zinc-800 text-[11px] font-semibold text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  <span>Ctrl</span>
                  <span>K</span>
                </button>
              )}
              <button
                onClick={scrollToCatalog}
                className="w-10 h-10 rounded-full bg-[#2d5016] text-white flex items-center justify-center hover:bg-[#3d6b1e] transition-colors shrink-0 shadow-md cursor-pointer"
                aria-label="Procurar"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Botão saltitante para descer ao catálogo */}
        <button
          onClick={scrollToCatalog}
          className="absolute bottom-6 z-10 text-white/70 hover:text-white flex flex-col items-center gap-1 cursor-pointer transition-colors group"
        >
          <span className="text-[11px] uppercase tracking-widest font-semibold opacity-75 group-hover:opacity-100">
            Ver Músicas
          </span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </button>
      </section>

      {/* SECÇÃO DO CATÁLOGO DE MÚSICAS */}
      <section id="catalogo" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 scroll-mt-6">
        {/* Filtros Rápidos e Ordenação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
            {QUICK_FILTERS.map((filter) => {
              const isSelected = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-[#2d5016] text-white border-[#2d5016] shadow-sm'
                      : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-800 hover:border-green-300 dark:hover:border-green-700'
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
            <label htmlFor="home-sort-select" className="text-xs text-gray-500 dark:text-zinc-400 font-medium">
              Ordenar:
            </label>
            <select
              id="home-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SongSortOption)}
              aria-label="Ordenar músicas"
              className="text-xs sm:text-sm font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-gray-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#2d5016] cursor-pointer"
            >
              <option value="az">A–Z</option>
              <option value="recent">Mais Recentes</option>
              <option value="key">Por Tom</option>
            </select>
          </div>
        </div>

        {/* Atalhos: Favoritos e Recentes (escondidos durante pesquisa/filtro) */}
        {showFavorites && (
          <QuickSongRow
            id="home-favoritos"
            label="Favoritos"
            icon={<Heart className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 fill-current" aria-hidden="true" />}
            songs={favoriteSongs}
          />
        )}
        {showRecents && (
          <QuickSongRow
            id="home-recentes"
            label="Recentes"
            icon={<Clock className="w-3.5 h-3.5 text-green-700 dark:text-green-400" aria-hidden="true" />}
            songs={recentSongs}
          />
        )}

        {/* Contagem de Músicas */}
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-200/80 dark:border-zinc-800/80 text-gray-600 dark:text-zinc-400">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Music className="w-4 h-4 text-green-700 dark:text-green-400" />
            <span>
              Total: <strong className="text-gray-900 dark:text-zinc-100">{filteredSongs.length}</strong>{' '}
              {filteredSongs.length === 1 ? 'música' : 'músicas'}
            </span>
          </div>
          {(searchQuery || activeFilter !== 'todos') && (
            <button
              onClick={handleClearSearch}
              className="text-xs text-green-700 dark:text-green-400 hover:underline font-semibold cursor-pointer"
            >
              Limpar pesquisa
            </button>
          )}
        </div>

        {/* Lista de Músicas */}
        {loading ? (
          <SongCardSkeleton count={6} label="A carregar músicas..." />
        ) : filteredSongs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSongs.map((song) => (
              <SongCard key={song.id} song={song} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-200 dark:border-zinc-800 p-8">
            <Music className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">
              Nenhuma música encontrada.
            </p>
            <p className="text-sm text-gray-400 mt-1 mb-5">
              Tenta pesquisar por outro título, letra ou etiqueta.
            </p>
            <button
              onClick={handleClearSearch}
              className="px-5 py-2.5 bg-[#2d5016] text-white hover:bg-[#3d6b1e] rounded-full text-sm font-medium transition-colors shadow-sm cursor-pointer"
            >
              Ver todas as músicas
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
