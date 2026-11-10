import { useState, useMemo, useEffect } from 'react';
import { useSongs } from '../hooks/useSongs';
import { useRestoreReturnScroll } from '../hooks/useRestoreReturnScroll';
import { SongCard } from '../components/songs/SongCard';
import { SongCardSkeleton } from '../components/common/SongCardSkeleton';
import { normalizeSearchText, searchAndRankSongs } from '../lib/search-utils';
import { BookOpen, Search, X, Sparkles, Heart, Compass, Mountain, Flame, Layers } from 'lucide-react';

interface ThemeDefinition {
  id: string;
  name: string;
  subtitle: string;
  keywords: string[];
  color: string;
  badgeBg: string;
  borderColor: string;
  icon: React.ReactNode;
}

const THEMES: ThemeDefinition[] = [
  {
    id: 'escutistas',
    name: 'Escutistas',
    subtitle: 'Hinos e Cânticos do Movimento Escutista',
    keywords: ['escutista', 'escutistas', 'escutismo', 'bp', 'baden powell', 'promessa', 'flor de lis', 'cancioneiro', 'patrulha', 'agrupamento'],
    color: 'text-[#2d5016] dark:text-green-300',
    badgeBg: 'bg-green-50 hover:bg-green-100 dark:bg-green-950/40 dark:hover:bg-green-900/60',
    borderColor: 'border-green-500',
    icon: <span className="text-lg">⚜️</span>
  },
  {
    id: 'marianas',
    name: 'Marianas',
    subtitle: 'Cânticos a Nossa Senhora',
    keywords: ['maria', 'mariana', 'marianas', 'nossa senhora', 'mãe do céu', 'ave maria'],
    color: 'text-sky-700 dark:text-sky-300',
    badgeBg: 'bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60',
    borderColor: 'border-sky-300 dark:border-sky-700',
    icon: <Sparkles className="w-5 h-5 text-sky-600 dark:text-sky-400" />
  },
  {
    id: '1-seccao',
    name: '1.ª Secção',
    subtitle: 'Alcatéia • Lobitos (6-10 anos)',
    keywords: ['1ª secção', '1-seccao', 'lobito', 'lobitos', 'alcateia', 'akela', 'baloo', 'baguera', 'mowgli'],
    color: 'text-yellow-800 dark:text-yellow-300',
    badgeBg: 'bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/40 dark:hover:bg-yellow-900/60',
    borderColor: 'border-yellow-400',
    icon: <span className="text-lg">🐺</span>
  },
  {
    id: '2-seccao',
    name: '2.ª Secção',
    subtitle: 'Expedição • Exploradores / Moços (10-14 anos)',
    keywords: ['2ª secção', '2-seccao', 'explorador', 'exploradores', 'moços', 'patrulha', 'expedição'],
    color: 'text-emerald-800 dark:text-emerald-300',
    badgeBg: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60',
    borderColor: 'border-emerald-500',
    icon: <Compass className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
  },
  {
    id: '3-seccao',
    name: '3.ª Secção',
    subtitle: 'Comunidade • Pioneiros / Marinheiros (14-18 anos)',
    keywords: ['3ª secção', '3-seccao', 'pioneiro', 'pioneiros', 'marinheiros', 'comunidade', 'equipa'],
    color: 'text-blue-800 dark:text-blue-300',
    badgeBg: 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60',
    borderColor: 'border-blue-500',
    icon: <Mountain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
  },
  {
    id: '4-seccao',
    name: '4.ª Secção',
    subtitle: 'Clã • Caminheiros / Companheiros (18-22 anos)',
    keywords: ['4ª secção', '4-seccao', 'caminheiro', 'caminheiros', 'companheiros', 'clã', 'partida', 'estrada'],
    color: 'text-rose-800 dark:text-rose-300',
    badgeBg: 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60',
    borderColor: 'border-rose-500',
    icon: <Flame className="w-5 h-5 text-rose-600 dark:text-rose-400" />
  },
  {
    id: 'oracao',
    name: 'Oração',
    subtitle: 'Cânticos de Louvor e Prece',
    keywords: ['oracao', 'oração', 'prece', 'louvor', 'senhor', 'deus', 'jesus', 'paz'],
    color: 'text-purple-800 dark:text-purple-300',
    badgeBg: 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60',
    borderColor: 'border-purple-300',
    icon: <Heart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
  },
  {
    id: 'reflexao',
    name: 'Reflexão',
    subtitle: 'Introspeção e Fogo de Conselho',
    keywords: ['reflexao', 'reflexão', 'fogo de conselho', 'noite', 'silêncio', 'meditação', 'pensamento'],
    color: 'text-amber-800 dark:text-amber-300',
    badgeBg: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60',
    borderColor: 'border-amber-400',
    icon: <span className="text-lg">🕯️</span>
  },
  {
    id: 'outro',
    name: 'Outro',
    subtitle: 'Diversos e outras temáticas',
    keywords: ['outro', 'outros', 'geral', 'animação', 'convívio', 'diversos', 'acampamento'],
    color: 'text-teal-800 dark:text-teal-300',
    badgeBg: 'bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/60',
    borderColor: 'border-teal-400',
    icon: <Layers className="w-5 h-5 text-teal-600 dark:text-teal-400" />
  },
];

export default function Thematics() {
  const { songs, loading } = useSongs();
  const [selectedThemeId, setSelectedThemeId] = useState<string>(() => {
    try {
      return sessionStorage.getItem('thematics_selected_theme') || 'marianas';
    } catch {
      return 'marianas';
    }
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    document.title = 'Cânticos por Temáticas — Cancioneiro 488';
  }, []);

  const handleSelectTheme = (id: string) => {
    setSelectedThemeId(id);
    try {
      sessionStorage.setItem('thematics_selected_theme', id);
    } catch {}
  };

  const currentTheme = THEMES.find(t => t.id === selectedThemeId) || THEMES[0];

  // Filtra as músicas da temática ativa com normalização insensível a acentos
  const filteredSongs = useMemo(() => {
    if (!Array.isArray(songs)) return [];

    const outroKeywords = ['outro', 'outros', 'geral', 'diversos', 'animacao', 'convivio', 'acampamento'];

    const themeSongs = songs.filter((song) => {
      if (!song) return false;

      const normTitle = normalizeSearchText(song.title);
      const normContent = normalizeSearchText(song.content);
      const normTags = Array.isArray(song.tags)
        ? song.tags.map((t) => normalizeSearchText(t)).filter(Boolean)
        : [];

      if (currentTheme.id === 'outro') {
        return normTags.some((t) => outroKeywords.some((k) => t.includes(k)));
      }

      return currentTheme.keywords.some((kw) => {
        const normKw = normalizeSearchText(kw);
        if (!normKw) return false;
        const hasInTags = normTags.some((t) => t.includes(normKw));
        const hasInTitle = normTitle.includes(normKw);
        const hasInContent = normContent.includes(normKw);
        return hasInTags || hasInTitle || hasInContent;
      });
    });

    if (searchQuery.trim()) {
      return searchAndRankSongs(themeSongs, searchQuery, 'relevance');
    }

    return themeSongs;
  }, [songs, currentTheme, searchQuery]);

  useRestoreReturnScroll([songs, loading]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Cabeçalho da Página */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center justify-center p-3 bg-green-100 dark:bg-green-950 text-[#2d5016] dark:text-green-400 rounded-2xl mb-4 shadow-sm">
          <BookOpen className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-3">
          Cânticos por Temáticas
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg">
          Encontra o cântico ideal para as atividades da tua secção, fogos de conselho ou momentos de oração e reflexão.
        </p>
      </div>

      {/* Cartões / Botões de Seleção de Temática */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2.5 sm:gap-3 mb-10">
        {THEMES.map((theme) => {
          const isSelected = theme.id === selectedThemeId;
          return (
            <button
              key={theme.id}
              onClick={() => {
                handleSelectTheme(theme.id);
                setSearchQuery('');
              }}
              className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                isSelected
                  ? `bg-white dark:bg-zinc-900 shadow-md ring-2 ring-[#2d5016] dark:ring-green-500 border-transparent font-bold scale-[1.02]`
                  : `${theme.badgeBg} border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300 hover:shadow-sm`
              }`}
            >
              <div className="mb-1.5">{theme.icon}</div>
              <span className={`text-xs sm:text-sm font-semibold leading-tight ${theme.color}`}>
                {theme.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Painel da Temática Ativa */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 sm:p-8 shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-green-50 dark:bg-green-950 text-[#2d5016] dark:text-green-400">
                {currentTheme.icon}
              </span>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {currentTheme.name}
              </h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {currentTheme.subtitle} • <strong>{filteredSongs.length}</strong> {filteredSongs.length === 1 ? 'música encontrada' : 'músicas encontradas'}
            </p>
          </div>

          {/* Barra de pesquisa dentro da temática */}
          <div className="relative w-full sm:w-72">
            <input
              id="thematics-search-input"
              name="search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar nesta temática..."
              aria-label="Pesquisar nesta temática"
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

        {/* Grelha de Músicas da Temática */}
        <div className="mt-8">
          {loading ? (
            <SongCardSkeleton count={6} label="A carregar cânticos..." />
          ) : filteredSongs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSongs.map((song) => (
                <SongCard key={song.id} song={song} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-gray-200 dark:border-zinc-800 p-6">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-base font-medium text-gray-700 dark:text-gray-300">Ainda não existem músicas com a temática &ldquo;{currentTheme.name}&rdquo;.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
