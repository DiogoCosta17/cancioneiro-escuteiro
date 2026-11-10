import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSongs } from '../../hooks/useSongs';
import { useAuth } from '../../hooks/useAuth';
import { AdminList } from './AdminList';
import { AdminEvents } from './AdminEvents';
import { SuggestionsManager } from './SuggestionsManager';
import { ActivityLogsManager } from './ActivityLogsManager';
import { BackupRestore } from './BackupRestore';
import { useSuggestions } from '../../hooks/useSuggestions';
import { THEMATIC_TAGS, EUCHARIST_TAGS } from '../common/QuickTagSelector';
import { Plus, Edit, Trash2, Music, Users, Calendar, Camera, Lightbulb, History, Download } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';
import { supabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/fetch-all-rows';

export function AdminPanel() {
  const { songs, deleteSong } = useSongs();
  const { adminProfile } = useAuth();
  const { pendingCount } = useSuggestions();
  const [activeTab, setActiveTab] = useState<'songs' | 'admins' | 'events' | 'suggestions' | 'logs'>('songs');
  const [selectedUserForLogs, setSelectedUserForLogs] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [deleteSongId, setDeleteSongId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportBackup = async () => {
    if (!supabase) return;
    setIsExporting(true);
    try {
      // Todas as páginas (o Supabase limita a 1000 linhas por pedido); a ordem final é feita aqui
      const rawSongs = await fetchAllRows<{ title: string }>('songs', '*');
      const rawEvents = await fetchAllRows<{ date: string }>('events', '*, event_songs(*)');
      const songsData = [...rawSongs].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      const eventsData = [...rawEvents].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const backup = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        exported_by: adminProfile?.name || adminProfile?.email || 'admin',
        total_songs: songsData?.length || 0,
        total_events: eventsData?.length || 0,
        songs: songsData || [],
        events: eventsData || []
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cancioneiro_backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Erro ao gerar cópia de segurança:', err);
      alert('Não foi possível gerar a cópia de segurança. Tenta novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const confirmDeleteSong = useCallback(async () => {
    if (!deleteSongId) return;
    try {
      const { error } = await deleteSong(deleteSongId);
      if (error) throw error;
    } catch (err) {
      console.error(err);
      alert('Não foi possível eliminar a música.');
    } finally {
      setDeleteSongId(null);
    }
  }, [deleteSong, deleteSongId]);

  const allTags = useMemo(() => {
    return Array.from(new Set(songs.flatMap(s => s.tags || []))).sort();
  }, [songs]);

  const filteredSongs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const tag = selectedTag.toLowerCase().trim();

    return songs.filter(song => {
      const matchesSearch = !q || 
        song.title.toLowerCase().includes(q) ||
        (Boolean(song.artist) && (song.artist || '').toLowerCase().includes(q));
      
      const matchesTag = !tag || (Array.isArray(song.tags) && song.tags.some(t => typeof t === 'string' && t.toLowerCase() === tag));
      
      return matchesSearch && matchesTag;
    });
  }, [songs, searchQuery, selectedTag]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">

      {/* Tabs com scroll horizontal suave em mobile */}
      <div className="border-b border-gray-200 dark:border-zinc-800 mb-6 overflow-x-auto scrollbar-none">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max">
          <button
            onClick={() => setActiveTab('songs')}
            className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-bold text-sm flex items-center transition-colors cursor-pointer ${
              activeTab === 'songs'
                ? 'border-green-600 text-green-700 dark:text-green-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:border-zinc-700'
            }`}
          >
            <Music className="w-4 h-4 mr-2" />
            Músicas ({songs.length})
          </button>
          
          <button
            onClick={() => setActiveTab('events')}
            className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-bold text-sm flex items-center transition-colors cursor-pointer ${
              activeTab === 'events'
                ? 'border-green-600 text-green-700 dark:text-green-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:border-zinc-700'
            }`}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Eventos e Missas
          </button>

          <button
            onClick={() => setActiveTab('suggestions')}
            className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-bold text-sm flex items-center transition-colors cursor-pointer ${
              activeTab === 'suggestions'
                ? 'border-green-600 text-green-700 dark:text-green-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:border-zinc-700'
            }`}
          >
            <Lightbulb className="w-4 h-4 mr-2 text-amber-500" />
            <span>Sugestões</span>
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>

          {adminProfile?.role === 'super_admin' && (
            <>
              <button
                onClick={() => setActiveTab('admins')}
                className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-bold text-sm flex items-center transition-colors cursor-pointer ${
                  activeTab === 'admins'
                    ? 'border-green-600 text-green-700 dark:text-green-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:border-zinc-700'
                }`}
              >
                <Users className="w-4 h-4 mr-2" />
                Administradores
              </button>

              <button
                onClick={() => {
                  setSelectedUserForLogs(null);
                  setActiveTab('logs');
                }}
                className={`whitespace-nowrap pb-3.5 px-1 border-b-2 font-bold text-sm flex items-center transition-colors cursor-pointer ${
                  activeTab === 'logs'
                    ? 'border-purple-600 text-purple-700 dark:text-purple-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:border-zinc-700'
                }`}
              >
                <History className="w-4 h-4 mr-2 text-purple-600 dark:text-purple-400" />
                Histórico & Logs
              </button>
            </>
          )}
        </nav>
      </div>

      {activeTab === 'songs' ? (
        <div>
          {/* Header com botões em grelha 2-colunas no telemóvel */}
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Lista de Músicas</h2>
              <p className="text-xs text-gray-500 mt-0.5">{filteredSongs.length} de {songs.length} cânticos</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              {adminProfile?.role === 'super_admin' && (
                <>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={isExporting}
                  title="Descarregar cópia de segurança (JSON) com todas as músicas e eventos"
                  className="inline-flex items-center justify-center px-3.5 py-2.5 border border-blue-200 dark:border-blue-900/60 rounded-xl shadow-xs text-xs sm:text-sm font-bold text-blue-700 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className={`w-4 h-4 mr-1.5 text-blue-600 dark:text-blue-400 shrink-0 ${isExporting ? 'animate-bounce' : ''}`} />
                  <span>{isExporting ? 'A Exportar...' : 'Backup JSON'}</span>
                </button>
                <BackupRestore />
                </>
              )}
              <Link
                to="/admin/converter"
                className="inline-flex items-center justify-center px-4 py-2.5 border border-amber-300 dark:border-amber-700 rounded-xl shadow-sm text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4 mr-1.5 text-amber-600 shrink-0" />
                Converter Foto
              </Link>
              <Link
                to="/admin/new"
                className="inline-flex items-center justify-center px-4 py-2.5 border border-transparent rounded-xl shadow-sm text-xs sm:text-sm font-bold text-white bg-green-600 hover:bg-green-700 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1.5 shrink-0" />
                Adicionar Música
              </Link>
            </div>
          </div>

          {/* Filtros de pesquisa e etiquetas */}
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <input
                type="text"
                placeholder="Pesquisar por título ou artista..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-xl border-gray-300 dark:border-zinc-700 shadow-sm focus:border-green-500 focus:ring-green-500 text-sm p-2.5 border bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="block w-full rounded-xl border-gray-300 dark:border-zinc-700 shadow-sm focus:border-green-500 focus:ring-green-500 text-sm p-2.5 border bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100"
              >
                <option value="">Todas as Etiquetas</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Chips de filtro rápido por temáticas e momentos da eucaristia */}
          <div className="mb-6 space-y-2 bg-gray-50/70 dark:bg-zinc-800/40 p-3 rounded-xl border border-gray-200/80 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-gray-600 dark:text-gray-400 mr-1">Temáticas:</span>
              {THEMATIC_TAGS.map(tag => {
                const isSelected = selectedTag.toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => setSelectedTag(isSelected ? '' : tag)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white border border-emerald-700 shadow-xs'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                    }`}
                  >
                    {isSelected ? `✓ ${tag}` : tag}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-gray-600 dark:text-gray-400 mr-1">Eucaristia:</span>
              {EUCHARIST_TAGS.map(tag => {
                const isSelected = selectedTag.toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => setSelectedTag(isSelected ? '' : tag)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-600 text-white border border-amber-700 shadow-xs'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                    }`}
                  >
                    {isSelected ? `✓ ${tag}` : tag}
                  </button>
                );
              })}
              {selectedTag && (
                <button
                  type="button"
                  onClick={() => setSelectedTag('')}
                  className="px-2 py-0.5 text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-semibold underline cursor-pointer ml-1"
                >
                  Limpar filtro
                </button>
              )}
            </div>
          </div>
          
          {/* Lista de músicas otimizada para mobile e desktop */}
          <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-xl sm:rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
              {filteredSongs.length === 0 ? (
                <li className="p-8 text-center text-gray-500 text-sm">Nenhuma música encontrada.</li>
              ) : (
                filteredSongs.map((song) => (
                  <li key={song.id} className="p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors">
                    <Link
                      to={`/song/${song.id}`}
                      className="flex-1 min-w-0 group cursor-pointer block"
                      title="Ver música"
                    >
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors leading-snug">
                          {song.title}
                        </h3>
                        {song.artist && (
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            • {song.artist}
                          </span>
                        )}
                      </div>

                      {/* Metadados responsivos sem quebras desformatadas */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {song.original_key && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50 text-[11px] font-bold whitespace-nowrap">
                            Tom: {song.original_key}
                          </span>
                        )}
                        {song.tags && song.tags.length > 0 ? (
                          song.tags.map(tag => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-green-50 dark:bg-green-950/40 text-[#2d5016] dark:text-green-400 border border-green-200 dark:border-green-900/50 text-[11px] font-medium"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-xs italic">Sem etiquetas</span>
                        )}
                      </div>
                    </Link>

                    {/* Botões de Ação com boa área de toque no telemóvel */}
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <Link
                        to={`/admin/edit/${song.id}`}
                        className="p-2 sm:p-2.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
                      </Link>
                      <button
                        onClick={() => setDeleteSongId(song.id)}
                        className="p-2 sm:p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : activeTab === 'events' ? (
        <AdminEvents />
      ) : activeTab === 'suggestions' ? (
        <SuggestionsManager />
      ) : activeTab === 'logs' ? (
        <ActivityLogsManager 
          initialUserEmail={selectedUserForLogs}
          onClearUserFilter={() => setSelectedUserForLogs(null)}
        />
      ) : (
        <AdminList 
          onViewUserLogs={(email) => {
            setSelectedUserForLogs(email);
            setActiveTab('logs');
          }} 
        />
      )}

      <ConfirmModal
        isOpen={!!deleteSongId}
        onClose={() => setDeleteSongId(null)}
        onConfirm={confirmDeleteSong}
        title="Eliminar música?"
        message="Tem a certeza que deseja eliminar esta música? Esta ação não pode ser desfeita."
        confirmText="Sim, eliminar"
        cancelText="Cancelar"
        variant="danger"
        icon="trash"
      />
    </div>
  );
}
