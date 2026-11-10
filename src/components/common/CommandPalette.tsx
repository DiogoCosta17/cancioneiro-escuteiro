import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Music,
  Home,
  ListMusic,
  Calendar,
  BookOpen,
  Church,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Tag,
  Lock,
  BookMarked,
} from 'lucide-react';
import { useSongs } from '../../hooks/useSongs';
import {
  normalizeSearchText,
  searchAndRankSongs,
  getMatchingLyricSnippet,
} from '../../lib/search-utils';
import { Song } from '../../lib/types';

interface QuickNavItem {
  id: string;
  label: string;
  subtitle: string;
  path: string;
  icon: React.ReactNode;
  /** Palavras extra que também encontram este atalho. */
  keywords?: string[];
  /** Só aparece quando se pesquisa (não fica na lista inicial, à vista de todos os visitantes). */
  searchOnly?: boolean;
}

const QUICK_NAV_ITEMS: QuickNavItem[] = [
  {
    id: 'nav-home',
    label: 'Início',
    subtitle: 'Catálogo geral de cânticos',
    path: '/',
    icon: <Home className="w-4 h-4" />,
  },
  {
    id: 'nav-lista',
    label: 'A Minha Lista',
    subtitle: 'Cânticos selecionados para imprimir ou tocar',
    path: '/lista',
    icon: <ListMusic className="w-4 h-4" />,
  },
  {
    id: 'nav-eventos',
    label: 'Eventos e Missas',
    subtitle: 'Alinhamentos de eucaristias e fogos de conselho',
    path: '/eventos',
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    id: 'nav-tematicas',
    label: 'Temáticas',
    subtitle: 'Escutistas, Marianas, Secções, Oração e Reflexão',
    path: '/tematicas',
    icon: <BookOpen className="w-4 h-4" />,
  },
  {
    id: 'nav-eucaristia',
    label: 'Momentos da Eucaristia',
    subtitle: 'Entrada, Aleluia, Ofertório, Comunhão, Final...',
    path: '/eucaristia',
    icon: <Church className="w-4 h-4" />,
  },
  {
    id: 'nav-liturgia',
    label: 'Liturgia Diária',
    subtitle: 'Leituras da missa de hoje ou de outro dia',
    path: '/liturgia',
    icon: <BookMarked className="w-4 h-4" />,
    keywords: ['leituras', 'evangelho', 'salmo'],
  },
  {
    id: 'nav-dirigentes',
    label: 'Área de Dirigentes',
    subtitle: 'Entrar ou abrir o painel de administração',
    // Sem sessão, /admin redireciona para o login
    path: '/admin',
    icon: <Lock className="w-4 h-4" />,
    keywords: ['dirigentes', 'login', 'entrar', 'admin', 'administracao', 'painel'],
    searchOnly: true,
  },
];

type PaletteItem =
  | { type: 'nav'; item: QuickNavItem }
  | { type: 'song'; song: Song; snippet: string | null };

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { songs } = useSongs();

  const openPalette = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            setQuery('');
            setActiveIndex(0);
          }
          return next;
        });
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closePalette();
      }
    };

    const handleCustomOpen = () => {
      openPalette();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleCustomOpen);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleCustomOpen);
    };
  }, [isOpen, openPalette, closePalette]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 15);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const normQuery = useMemo(() => normalizeSearchText(query), [query]);

  const filteredNavItems = useMemo(() => {
    if (!normQuery) return QUICK_NAV_ITEMS.filter((item) => !item.searchOnly);
    return QUICK_NAV_ITEMS.filter((item) => {
      if (item.searchOnly && normQuery.length < 3) return false;
      const labelMatch = normalizeSearchText(item.label).includes(normQuery);
      const subMatch = normalizeSearchText(item.subtitle).includes(normQuery);
      const keywordMatch = (item.keywords || []).some((k) => k.startsWith(normQuery));
      return labelMatch || subMatch || keywordMatch;
    });
  }, [normQuery]);

  const matchingSongs = useMemo(() => {
    const ranked = searchAndRankSongs(songs, query, 'relevance');
    return ranked.slice(0, 8).map((song) => {
      const titleMatch = normQuery && normalizeSearchText(song.title).includes(normQuery);
      const snippet =
        normQuery && !titleMatch ? getMatchingLyricSnippet(song.content, query) : null;
      return { song, snippet };
    });
  }, [songs, query, normQuery]);

  const allSelectableItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    for (const nav of filteredNavItems) {
      items.push({ type: 'nav', item: nav });
    }
    for (const entry of matchingSongs) {
      items.push({ type: 'song', song: entry.song, snippet: entry.snippet });
    }
    return items;
  }, [filteredNavItems, matchingSongs]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleSelectItem = useCallback(
    (entry: PaletteItem) => {
      closePalette();
      if (entry.type === 'nav') {
        navigate(entry.item.path);
      } else {
        navigate(`/song/${entry.song.id}`);
      }
    },
    [closePalette, navigate]
  );

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (allSelectableItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % allSelectableItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + allSelectableItems.length) % allSelectableItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = allSelectableItems[activeIndex];
      if (target) {
        handleSelectItem(target);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-14 sm:pt-24 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pesquisa rápida no Cancioneiro"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closePalette}
      />

      {/* Modal Window */}
      <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
        {/* Search Input Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-gray-100 dark:border-zinc-800">
          <Search className="w-5 h-5 text-[#2d5016] dark:text-green-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Pesquisar cânticos, letras sem acentos, tom ou secção..."
            aria-label="Pesquisa rápida"
            className="w-full bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-500 text-base focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar pesquisa rápida"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 mr-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={closePalette}
            className="px-2 py-1 text-[11px] font-semibold text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Results Container */}
        <div ref={listRef} className="max-h-[65vh] overflow-y-auto p-2 space-y-4">
          {allSelectableItems.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <Music className="w-10 h-10 text-gray-300 dark:text-zinc-700 mx-auto mb-2.5" />
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                Nenhum cântico ou secção encontrado para &ldquo;{query}&rdquo;.
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                Experimenta pesquisar por parte da letra, autor ou etiqueta.
              </p>
            </div>
          ) : (
            <>
              {/* Quick Actions / Navigation */}
              {filteredNavItems.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    Navegação Rápida
                  </div>
                  <div className="space-y-0.5">
                    {filteredNavItems.map((nav, idx) => {
                      const isSelected = activeIndex === idx;
                      return (
                        <button
                          key={nav.id}
                          type="button"
                          onClick={() => handleSelectItem({ type: 'nav', item: nav })}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-green-50 dark:bg-green-950/50 text-[#2d5016] dark:text-green-300'
                              : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`p-2 rounded-lg shrink-0 ${
                                isSelected
                                  ? 'bg-[#2d5016] text-white'
                                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
                              }`}
                            >
                              {nav.icon}
                            </span>
                            <div className="truncate">
                              <div className="text-sm font-semibold truncate">{nav.label}</div>
                              <div className="text-xs text-gray-400 dark:text-zinc-500 truncate">
                                {nav.subtitle}
                              </div>
                            </div>
                          </div>
                          <CornerDownLeft
                            className={`w-4 h-4 shrink-0 ml-2 ${
                              isSelected ? 'opacity-100 text-[#2d5016] dark:text-green-400' : 'opacity-0'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Songs Section */}
              {matchingSongs.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    Cânticos ({matchingSongs.length})
                  </div>
                  <div className="space-y-0.5">
                    {matchingSongs.map(({ song, snippet }, sIdx) => {
                      const globalIdx = filteredNavItems.length + sIdx;
                      const isSelected = activeIndex === globalIdx;
                      return (
                        <button
                          key={song.id}
                          type="button"
                          onClick={() => handleSelectItem({ type: 'song', song, snippet })}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-green-50 dark:bg-green-950/50 text-[#2d5016] dark:text-green-300'
                              : 'text-gray-800 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <span
                              className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                                isSelected
                                  ? 'bg-[#2d5016] text-white'
                                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              <Music className="w-4 h-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold truncate">{song.title}</span>
                                {song.original_key && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 shrink-0">
                                    {song.original_key}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 mt-0.5 truncate">
                                {song.artist && <span className="truncate">{song.artist}</span>}
                                {song.tags && song.tags.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 dark:text-zinc-500 truncate">
                                    <Tag className="w-3 h-3 shrink-0" />
                                    {song.tags.slice(0, 2).join(' • ')}
                                  </span>
                                )}
                              </div>
                              {snippet && (
                                <p className="text-xs italic text-green-700 dark:text-green-400 mt-1 truncate">
                                  &ldquo;{snippet}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                          <CornerDownLeft
                            className={`w-4 h-4 shrink-0 ml-2 ${
                              isSelected ? 'opacity-100 text-[#2d5016] dark:text-green-400' : 'opacity-0'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2.5 bg-gray-50 dark:bg-zinc-900/80 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-gray-400 dark:text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUp className="w-3 h-3" />
              <ArrowDown className="w-3 h-3" />
              navegar
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" />
              abrir
            </span>
          </div>
          <span>Cancioneiro 488 • Pesquisa Sem Acentos</span>
        </div>
      </div>
    </div>
  );
};
