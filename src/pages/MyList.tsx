import React, { useState, useMemo, useEffect } from 'react';
import { useSongList } from '../hooks/useSongList';
import { useSongs } from '../hooks/useSongs';
import { useRestoreReturnScroll } from '../hooks/useRestoreReturnScroll';
import { Song } from '../lib/types';
import { normalizeSearchText } from '../lib/search-utils';
import { 
  Printer, 
  Trash2, 
  Search, 
  X, 
  ChevronUp, 
  ChevronDown, 
  GripVertical, 
  Music, 
  ListMusic, 
  Plus,
  QrCode,
  Play,
  CheckCircle2
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { ShareRepertoireModal } from '../components/common/ShareRepertoireModal';
import { getPublicOrigin } from '../lib/share-url';

export const MyList: React.FC = () => {
  const { selectedSongIds, addSong, removeSong, clearList, reorderSongs } = useSongList();
  const { songs, loading } = useSongs();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharedBannerVisible, setSharedBannerVisible] = useState(false);

  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [dragOverSongId, setDragOverSongId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'A Minha Lista — Cancioneiro 488';
  }, []);

  // Importar repertório partilhado via URL (?share=id1,id2,...)
  useEffect(() => {
    if (loading) return;
    const shareParam = searchParams.get('share');
    if (!shareParam) return;

    const rawIds = shareParam
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0 && id.length <= 64)
      // Limitar o tamanho de links manipulados para não encher o localStorage com IDs arbitrários
      .slice(0, 200);

    if (rawIds.length > 0) {
      // Sem catálogo (ainda a carregar / offline) não dá para validar os ids: esperar, mantendo
      // o parâmetro ?share= no URL, para importar quando o catálogo chegar.
      if (!Array.isArray(songs) || songs.length === 0) return;
      const validIds = rawIds.filter(id => songs.some(s => s && s.id === id));

      if (validIds.length > 0) {
        const merged = Array.from(new Set([...validIds, ...selectedSongIds]));
        reorderSongs(merged);
        setSharedBannerVisible(true);
      }
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('share');
    setSearchParams(nextParams, { replace: true });
  }, [loading, songs, searchParams, setSearchParams, reorderSongs, selectedSongIds]);

  useRestoreReturnScroll([selectedSongIds, loading]);

  // Mapear os IDs selecionados para as respetivas instâncias de Song na ordem correta
  const listSongs = useMemo(() => {
    if (!Array.isArray(selectedSongIds) || !Array.isArray(songs)) return [];
    return selectedSongIds
      .map(id => songs.find(s => s && s.id === id))
      .filter((s): s is Song => Boolean(s && typeof s === 'object'));
  }, [selectedSongIds, songs]);

  // Músicas disponíveis no catálogo (exclui as que já estão na lista)
  const filteredCatalogSongs = useMemo(() => {
    if (!Array.isArray(songs)) return [];
    const selectedSet = new Set(Array.isArray(selectedSongIds) ? selectedSongIds : []);
    const q = normalizeSearchText(searchQuery);

    return songs.filter(s => {
      if (!s) return false;
      if (selectedSet.has(s.id)) return false;
      if (!q) return true;

      const title = normalizeSearchText(s.title);
      const artist = normalizeSearchText(s.artist);
      const key = normalizeSearchText(s.original_key);
      const tags = Array.isArray(s.tags) ? s.tags.map(t => normalizeSearchText(t)).filter(Boolean) : [];

      return (
        title.includes(q) ||
        artist.includes(q) ||
        key.includes(q) ||
        tags.some(tag => tag.includes(q))
      );
    });
  }, [songs, selectedSongIds, searchQuery]);

  const moveUp = (index: number) => {
    setDraggedSongId(null);
    setDragOverSongId(null);
    if (index === 0) return;
    const newIds = [...selectedSongIds];
    const temp = newIds[index - 1];
    newIds[index - 1] = newIds[index];
    newIds[index] = temp;
    reorderSongs(newIds);
  };

  const moveDown = (index: number) => {
    setDraggedSongId(null);
    setDragOverSongId(null);
    if (index === selectedSongIds.length - 1) return;
    const newIds = [...selectedSongIds];
    const temp = newIds[index + 1];
    newIds[index + 1] = newIds[index];
    newIds[index] = temp;
    reorderSongs(newIds);
  };

  const handleDragStart = (e: React.DragEvent, songId: string) => {
    setDraggedSongId(songId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', songId);
  };

  const handleDragOver = (e: React.DragEvent, targetSongId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSongId !== targetSongId) {
      setDragOverSongId(targetSongId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, targetSongId: string) => {
    if (dragOverSongId === targetSongId) {
      setDragOverSongId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetSongId: string) => {
    e.preventDefault();
    if (!draggedSongId || draggedSongId === targetSongId) {
      setDraggedSongId(null);
      setDragOverSongId(null);
      return;
    }

    const fromIndex = selectedSongIds.indexOf(draggedSongId);
    const toIndex = selectedSongIds.indexOf(targetSongId);
    if (fromIndex === -1 || toIndex === -1) return;

    const newIds = [...selectedSongIds];
    const [moved] = newIds.splice(fromIndex, 1);
    newIds.splice(toIndex, 0, moved);
    reorderSongs(newIds);

    setDraggedSongId(null);
    setDragOverSongId(null);
  };

  const handleDragEnd = () => {
    setDraggedSongId(null);
    setDragOverSongId(null);
  };

  const handleConfirmClear = () => {
    clearList();
    setDraggedSongId(null);
    setDragOverSongId(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#2d5016]"></div>
      </div>
    );
  }

  const shareUrl = `${getPublicOrigin()}/lista?share=${selectedSongIds.map(encodeURIComponent).join(',')}`;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Banner de confirmação ao carregar repertório partilhado */}
      {sharedBannerVisible && (
        <div
          role="status"
          className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/60 flex items-center justify-between gap-3 text-green-900 dark:text-green-200 shadow-xs"
        >
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-[#2d5016] dark:text-green-400 shrink-0" />
            <span>Repertório partilhado carregado com sucesso!</span>
          </div>
          <button
            type="button"
            onClick={() => setSharedBannerVisible(false)}
            aria-label="Fechar aviso"
            className="p-1 rounded-lg text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">A Minha Lista</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Prepara o teu repertório para a missa ou atividade.</p>
        </div>
        
        {listSongs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-xl font-medium transition-colors cursor-pointer text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-xl font-medium transition-colors border border-gray-200 dark:border-zinc-700 cursor-pointer text-sm"
            >
              <QrCode className="w-4 h-4 text-[#2d5016] dark:text-green-400" />
              Partilhar / QR Code
            </button>
            <Link
              to={`/song/${listSongs[0].id}?list=mylist`}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-semibold transition-colors shadow-xs cursor-pointer text-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              Modo Palco (Tocar)
            </Link>
            <Link
              to="/lista/print"
              className="flex items-center gap-2 px-5 py-2.5 bg-[#2d5016] text-white rounded-xl font-medium hover:bg-[#3a681d] transition-colors shadow-sm cursor-pointer text-sm"
            >
              <Printer className="w-4 h-4" />
              Gerar PDF / Imprimir
            </Link>
          </div>
        )}
      </div>

      {/* Secção Dividida: Catálogo à esquerda | Repertório à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Coluna Esquerda: Catálogo de Cânticos Disponíveis */}
        <div className="lg:col-span-5 bg-white dark:bg-zinc-900 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 flex flex-col h-[650px]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-[#2d5016] dark:text-green-400" />
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Catálogo de Cânticos</h3>
            </div>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400">
              {filteredCatalogSongs.length} disponíveis
            </span>
          </div>

          {/* Barra de Pesquisa */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
            <input
              id="mylist-search-input"
              name="search"
              type="text"
              placeholder="Pesquisar por título, artista, tom..."
              aria-label="Pesquisar por título, artista, tom"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 dark:bg-zinc-800/70 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm pl-9 pr-9 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full cursor-pointer"
                title="Limpar pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Lista com Scroll das Músicas Disponíveis */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredCatalogSongs.length > 0 ? (
              filteredCatalogSongs.map(song => (
                <div
                  key={song.id}
                  onClick={() => addSong(song.id)}
                  className="group p-3 rounded-lg border border-gray-200 dark:border-zinc-800 hover:border-green-400 dark:hover:border-green-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800/40 text-left flex items-center justify-between gap-3 cursor-pointer transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate group-hover:text-[#2d5016] dark:group-hover:text-green-400 transition-colors">
                      {song.title}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span className="truncate">{song.artist || 'Cancioneiro'}</span>
                      {song.original_key && (
                        <>
                          <span>•</span>
                          <span className="font-medium">Tom: {song.original_key}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addSong(song.id);
                    }}
                    title="Adicionar à lista"
                    className="p-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 group-hover:bg-[#2d5016] group-hover:text-white dark:group-hover:bg-green-600 dark:group-hover:text-white transition-all shrink-0 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p className="text-sm font-medium">
                  {searchQuery ? 'Nenhum cântico encontrado' : 'Todas as músicas já foram adicionadas'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {searchQuery ? 'Tenta outro termo na pesquisa.' : 'Para adicionar mais, podes remover alguma da lista.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita: Repertório da Lista */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 flex flex-col h-[650px]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-[#2d5016] dark:text-green-400" />
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Repertório da Lista</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#2d5016]/10 text-[#2d5016] dark:bg-green-950/60 dark:text-green-300 border border-green-200 dark:border-green-900/50">
                {listSongs.length} {listSongs.length === 1 ? 'cântico' : 'cânticos'}
              </span>
              {listSongs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:underline cursor-pointer ml-1"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Lista das músicas no repertório */}
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={handleDragEnd}
            className="flex-1 overflow-y-auto space-y-2.5 pr-1"
          >
            {listSongs.length > 0 ? (
              listSongs.map((song, index) => {
                const isDragging = draggedSongId === song.id;
                const isDragOver = dragOverSongId === song.id && !isDragging;

                return (
                  <div
                    key={song.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, song.id)}
                    onDragOver={(e) => handleDragOver(e, song.id)}
                    onDragLeave={(e) => handleDragLeave(e, song.id)}
                    onDrop={(e) => handleDrop(e, song.id)}
                    onDragEnd={handleDragEnd}
                    className={`group flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border transition-all ${
                      isDragging
                        ? 'opacity-30 border-dashed border-gray-400 dark:border-zinc-600 bg-gray-100 dark:bg-zinc-800'
                        : isDragOver
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                        : 'bg-gray-50 dark:bg-zinc-800/40 border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {/* Pegadeira de arrastar (Drag Handle) */}
                    <div
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing p-1 shrink-0"
                      title="Arrastar para reordenar"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    {/* Botões rápidos de subir/descer */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveUp(index)}
                        title="Mover para cima"
                        className="text-gray-400 hover:text-[#2d5016] dark:hover:text-green-400 disabled:opacity-20 disabled:hover:text-gray-400 p-0.5 rounded cursor-pointer transition-colors"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === listSongs.length - 1}
                        onClick={() => moveDown(index)}
                        title="Mover para baixo"
                        className="text-gray-400 hover:text-[#2d5016] dark:hover:text-green-400 disabled:opacity-20 disabled:hover:text-gray-400 p-0.5 rounded cursor-pointer transition-colors"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Número ordinal */}
                    <div className="w-6 h-6 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0">
                      {index + 1}
                    </div>

                    {/* Informação do Cântico */}
                    <div className="min-w-0 flex-1">
                      <Link
                        id={`song-card-${song.id}`}
                        to={`/song/${song.id}?list=mylist`}
                        onClick={() => {
                          try {
                            sessionStorage.setItem('return_to_scroll_y', String(window.scrollY));
                            sessionStorage.setItem('return_to_song_id', song.id);
                          } catch {}
                        }}
                        className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate block hover:text-[#2d5016] dark:hover:text-green-400 transition-colors"
                        title="Abrir cântico"
                      >
                        {song.title}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {song.artist || 'Cancioneiro'}
                        {song.original_key && ` • Tom: ${song.original_key}`}
                      </div>
                    </div>

                    {/* Botão de Remover */}
                    <button
                      type="button"
                      onClick={() => removeSong(song.id)}
                      title="Remover da lista"
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-xl bg-gray-50/50 dark:bg-zinc-900/30">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-gray-400 mb-3">
                  <ListMusic className="w-6 h-6" />
                </div>
                <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  A tua lista está vazia
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mt-1">
                  Clica nos cânticos do catálogo no lado esquerdo para adicionares ao teu repertório.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal Amigável para Confirmar Limpeza da Lista */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title="Limpar repertório da lista?"
        message="Tens a certeza de que queres remover todas as músicas da tua lista? Ficarás sem nenhum cântico selecionado."
        confirmText="Sim, limpar tudo"
        cancelText="Cancelar"
        variant="danger"
        icon="trash"
      />

      {/* Modal de Partilha / Código QR */}
      <ShareRepertoireModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title="A Minha Lista"
        subtitle="Repertório Personalizado"
        shareUrl={shareUrl}
        songCount={listSongs.length}
      />
    </div>
  );
};
