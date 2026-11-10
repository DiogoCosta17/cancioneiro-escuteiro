import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Shield, ChevronDown, BookOpen, Church, ListMusic, Calendar, Moon, Sun, Lightbulb, Smartphone, Search, Lock, BookMarked } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSongList } from '../../hooks/useSongList';
import { useDarkMode } from '../../hooks/useDarkMode';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { SuggestionModal } from '../suggestions/SuggestionModal';
import { InstallAppModal } from '../common/InstallAppModal';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { selectedSongIds } = useSongList();
  const { isDark, toggleDark } = useDarkMode();
  const { isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCanticosOpen, setIsCanticosOpen] = useState(false);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleInstallClick = async () => {
    const result = await promptInstall();
    if (result === 'ios_instructions' || result === 'unavailable' || isIOS) {
      setIsInstallModalOpen(true);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const closeMenu = () => {
    setIsMenuOpen(false);
    setIsCanticosOpen(false);
  };

  const handleOpenCommandPalette = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  // Fecha o dropdown ao clicar fora e fecha menus ao premir Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCanticosOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsCanticosOpen(false);
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="bg-[#2d5016] text-white shadow-md relative z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3" onClick={closeMenu}>
            <img 
              src="/logo.png" 
              alt="Logo do Agrupamento" 
              className="w-10 h-10 object-contain rounded-full bg-white/10 p-0.5 border border-white/20"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="flex flex-col">
              <span className="font-bold text-xl tracking-tight leading-tight">Cancioneiro</span>
              <span className="text-xs text-green-200/80 font-normal">488 - Mafra</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1.5">
            {/* 1. NAVEGAÇÃO PRINCIPAL (PÁGINAS E CONTEÚDO) */}
            <Link 
              to="/" 
              className="text-sm font-medium hover:text-green-200 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Início
            </Link>

            {/* Dropdown Cânticos */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsCanticosOpen(!isCanticosOpen)}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors px-3 py-1.5 rounded-lg cursor-pointer ${
                  isCanticosOpen ? 'bg-white/10 text-green-100' : 'hover:text-green-200 hover:bg-white/5'
                }`}
                aria-expanded={isCanticosOpen}
              >
                <span>Cânticos</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isCanticosOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Menu Suspenso */}
              {isCanticosOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-gray-100 dark:border-zinc-800 py-2 z-50 text-gray-800 dark:text-gray-200 animate-in fade-in slide-in-from-top-2 duration-150">
                  <Link
                    to="/tematicas"
                    onClick={closeMenu}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-green-50/80 dark:hover:bg-zinc-800 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950 text-[#2d5016] dark:text-green-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 group-hover:text-[#2d5016] dark:group-hover:text-green-400">Temáticas</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Secções, Marianas, Oração...</div>
                    </div>
                  </Link>

                  <div className="my-1 border-t border-gray-100 dark:border-zinc-800"></div>

                  <Link
                    to="/eucaristia"
                    onClick={closeMenu}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-green-50/80 dark:hover:bg-zinc-800 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Church className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 group-hover:text-[#2d5016] dark:group-hover:text-green-400">Momentos da Eucaristia</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Entrada, Ofertório, Comunhão...</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            <Link 
              to="/eventos" 
              className="flex items-center gap-1.5 text-sm font-medium hover:text-green-200 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              <Calendar className="w-4 h-4" />
              <span>Eventos</span>
            </Link>

            <Link
              to="/liturgia"
              className="flex items-center gap-1.5 text-sm font-medium hover:text-green-200 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              title="Leituras da missa de cada dia"
            >
              <BookMarked className="w-4 h-4" />
              <span>Liturgia</span>
            </Link>

            {/* A Minha Lista (Repertório) */}
            <Link 
              to="/lista"
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
                selectedSongIds.length > 0
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-400/40 font-semibold'
                  : 'hover:text-green-200 hover:bg-white/5'
              }`}
              title="A Minha Lista de Cânticos"
            >
              <ListMusic className="w-4 h-4 text-amber-300" />
              <span>Lista</span>
              {selectedSongIds.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-amber-400 text-gray-950 text-xs font-black rounded-full leading-none">
                  {selectedSongIds.length}
                </span>
              )}
            </Link>

            {/* SEPARADOR SUBTIL */}
            <div className="h-5 w-px bg-white/20 mx-1.5" aria-hidden="true" />

            {/* 2. AÇÕES & UTILITÁRIOS */}
            {/* Pesquisa Rápida (Command Palette) */}
            <button
              type="button"
              onClick={handleOpenCommandPalette}
              className="flex items-center gap-1.5 text-xs font-medium text-green-100 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              title="Pesquisa Rápida (Ctrl+K)"
              aria-label="Pesquisa Rápida (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-green-200" />
              <span className="hidden lg:inline">Pesquisa Rápida</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-black/25 rounded text-green-200 border border-white/10">
                Ctrl+K
              </kbd>
            </button>

            {/* Sugerir Cântico */}
            <button
              onClick={() => setIsSuggestionOpen(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-200 hover:text-amber-100 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              title="Sugerir um cântico para o cancioneiro"
            >
              <Lightbulb className="w-4 h-4 text-amber-300" />
              <span>Sugerir</span>
            </button>

            {/* Instalar App (PWA) */}
            {!isInstalled && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-100 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                title="Instalar Cancioneiro no teu telemóvel ou computador"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-300" />
                <span>Instalar App</span>
              </button>
            )}

            {/* Alternador de Tema */}
            <button
              onClick={toggleDark}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-white flex items-center justify-center"
              title={isDark ? "Mudar para Modo Claro" : "Mudar para Modo Fogo-de-Conselho"}
              aria-label="Alternar tema de cor"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-300" /> : <Moon className="w-5 h-5 text-slate-200" />}
            </button>

            {/* Entrada discreta dos dirigentes (o rodapé fica longe quando há muitas músicas) */}
            {!user && (
              <Link
                to="/login"
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
                title="Área de Dirigentes"
                aria-label="Área de Dirigentes"
              >
                <Lock className="w-4 h-4" />
              </Link>
            )}

            {/* 3. ADMIN & SESSÃO (Se autenticado) */}
            {user && (
              <div className="flex items-center space-x-2 pl-2 border-l border-white/20">
                <Link to="/admin" className="flex items-center space-x-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors">
                  <Shield className="w-3.5 h-3.5 text-amber-300" />
                  <span>Admin</span>
                </Link>

                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 text-xs font-semibold bg-red-600/80 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  title="Terminar sessão"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-white hover:text-green-200 focus:outline-none"
            onClick={toggleMenu}
            aria-label="Alternar menu"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden pb-4 space-y-1 border-t border-green-800/60 pt-3">
            {/* 1. Páginas Principais */}
            <Link
              to="/"
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors font-medium"
              onClick={closeMenu}
            >
              Início
            </Link>

            <Link
              to="/eventos"
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors font-medium"
              onClick={closeMenu}
            >
              <Calendar className="w-4 h-4 text-green-200" />
              <span>Eventos e Missas</span>
            </Link>

            <Link
              to="/liturgia"
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors font-medium"
              onClick={closeMenu}
            >
              <BookMarked className="w-4 h-4 text-green-200" />
              <span>Liturgia Diária</span>
            </Link>

            <Link
              to="/lista"
              className="flex items-center justify-between px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors text-amber-300 font-medium"
              onClick={closeMenu}
            >
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4" />
                <span>A Minha Lista</span>
              </div>
              {selectedSongIds.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-400 text-gray-950 text-xs font-black rounded-full">
                  {selectedSongIds.length}
                </span>
              )}
            </Link>

            {/* Secção Cânticos */}
            <div className="pt-2 pb-1">
              <div className="px-4 text-xs font-bold text-green-300 uppercase tracking-wider">
                Explorar Cânticos
              </div>
            </div>

            <Link
              to="/tematicas"
              className="flex items-center gap-2 px-6 py-2 hover:bg-[#3a681d] rounded-md transition-colors text-sm"
              onClick={closeMenu}
            >
              <BookOpen className="w-4 h-4 text-green-300" />
              <span>Temáticas (Secções, Marianas...)</span>
            </Link>

            <Link
              to="/eucaristia"
              className="flex items-center gap-2 px-6 py-2 hover:bg-[#3a681d] rounded-md transition-colors text-sm"
              onClick={closeMenu}
            >
              <Church className="w-4 h-4 text-amber-300" />
              <span>Momentos da Eucaristia</span>
            </Link>

            {/* Divisor */}
            <div className="my-2 border-t border-green-800/60" />

            {/* 2. Ações & Utilitários */}
            <button
              type="button"
              onClick={() => {
                handleOpenCommandPalette();
                closeMenu();
              }}
              className="flex items-center justify-between px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors w-full text-left text-green-100 font-medium cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-green-300" />
                <span>Pesquisa Rápida</span>
              </div>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-black/25 rounded text-green-200 border border-white/10">
                Ctrl+K
              </kbd>
            </button>

            <button
              onClick={() => {
                setIsSuggestionOpen(true);
                closeMenu();
              }}
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors w-full text-left text-amber-200 font-medium cursor-pointer"
            >
              <Lightbulb className="w-4 h-4 text-amber-300" />
              <span>Sugerir Cântico</span>
            </button>

            {!isInstalled && (
              <button
                onClick={() => {
                  handleInstallClick();
                  closeMenu();
                }}
                className="flex items-center gap-2 px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors w-full text-left text-emerald-200 font-medium cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-emerald-300" />
                <span>Instalar Aplicação</span>
              </button>
            )}

            <button
              onClick={(e) => { toggleDark(e); closeMenu(); }}
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors w-full text-left text-gray-200 cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-slate-300" />}
              <span>{isDark ? 'Mudar para Modo Claro' : 'Modo Fogo-de-Conselho'}</span>
            </button>

            {/* Entrada discreta dos dirigentes */}
            {!user && (
              <div className="pt-2 border-t border-green-800/80">
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors text-sm text-green-100/70 hover:text-white"
                  onClick={closeMenu}
                >
                  <Lock className="w-4 h-4" />
                  <span>Área de Dirigentes</span>
                </Link>
              </div>
            )}

            {/* 3. Área Admin (se logado) */}
            {user && (
              <div className="pt-2 border-t border-green-800/80 space-y-1">
                <Link
                  to="/admin"
                  className="flex items-center space-x-2 px-4 py-2 hover:bg-[#3a681d] rounded-md transition-colors font-medium text-amber-200"
                  onClick={closeMenu}
                >
                  <Shield className="w-4 h-4 text-amber-300" />
                  <span>Painel Admin</span>
                </Link>

                <button
                  onClick={() => {
                    handleLogout();
                    closeMenu();
                  }}
                  className="flex w-full items-center space-x-2 px-4 py-2 text-left text-red-300 hover:bg-[#3a681d] rounded-md transition-colors font-medium cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Terminar Sessão</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Caixa de Sugestões Modal */}
      <SuggestionModal 
        isOpen={isSuggestionOpen} 
        onClose={() => setIsSuggestionOpen(false)} 
      />

      {/* Modal de Instruções de Instalação */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        isIOS={isIOS}
      />
    </header>
  );
};
