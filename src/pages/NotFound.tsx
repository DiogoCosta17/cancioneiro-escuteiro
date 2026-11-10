import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Home, BookOpen, Search, MapPinOff } from 'lucide-react';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Página Não Encontrada — Cancioneiro 488';
  }, []);

  const handleOpenCommandPalette = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  return (
    <div className="container mx-auto px-4 py-16 md:py-24 flex items-center justify-center min-h-[70vh]">
      <div className="max-w-lg w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-gray-100 dark:border-zinc-800 p-8 md:p-10 text-center relative overflow-hidden">
        {/* Decorative top accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#2d5016] via-[#4a7c29] to-[#d4a017]" />

        {/* Compass Icon Badge */}
        <div className="relative mx-auto mb-6 w-20 h-20 rounded-2xl bg-green-50 dark:bg-green-950/60 border border-green-200/70 dark:border-green-800/60 flex items-center justify-center text-[#2d5016] dark:text-green-400 shadow-inner">
          <Compass className="w-10 h-10 animate-pulse" />
          <span className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-amber-700 dark:text-amber-400">
            <MapPinOff className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-bold uppercase tracking-wider mb-3">
          Erro 404 • Fora de Rumo
        </div>

        {/* Heading */}
        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-3">
          404 • Parece que saíste do trilho!
        </h1>

        {/* Friendly explanation */}
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
          Mesmo os melhores exploradores perdem o azimute de vez em quando. A página ou cântico que procuras não existe ou mudou de coordenadas no Cancioneiro do Agrupamento 488.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2d5016] hover:bg-[#3a681d] text-white font-semibold text-sm shadow-sm transition-all cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Voltar ao Início</span>
          </Link>

          <Link
            to="/tematicas"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-semibold text-sm transition-all cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[#2d5016] dark:text-green-400" />
            <span>Cânticos por Temáticas</span>
          </Link>
        </div>

        {/* Command Palette Trigger */}
        <button
          type="button"
          onClick={handleOpenCommandPalette}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-zinc-700 hover:border-[#2d5016] dark:hover:border-green-500 bg-gray-50/60 dark:bg-zinc-800/40 hover:bg-green-50/50 dark:hover:bg-green-950/30 text-gray-700 dark:text-gray-300 text-sm font-medium transition-all cursor-pointer"
        >
          <Search className="w-4 h-4 text-[#2d5016] dark:text-green-400" />
          <span>Pesquisar cântico rapidamente</span>
          <kbd className="ml-1 px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-500 dark:text-gray-400">
            Ctrl+K
          </kbd>
        </button>
      </div>
    </div>
  );
}
