import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Lightbulb, 
  Trash2, 
  Play, 
  ExternalLink, 
  Plus, 
  Clock, 
  User, 
  MessageSquare, 
  Search,
  Check,
  RotateCcw,
  BookCheck
} from 'lucide-react';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useAuth } from '../../hooks/useAuth';
import { useActivityLogs } from '../../hooks/useActivityLogs';
import { useSongs } from '../../hooks/useSongs';
import { findDuplicateSongs, DuplicateMatch } from '../../lib/duplicate-songs';
import { Song, SongSuggestion } from '../../lib/types';
import { ConfirmModal } from '../common/ConfirmModal';

// As sugestões vêm de visitantes anónimos: só aceitar links http(s) (evita javascript:/data: em href)
const isSafeHttpUrl = (value?: string | null): value is string => {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export function SuggestionsManager() {
  const { suggestions, loading, toggleImplemented, deleteSuggestion } = useSuggestions();
  const { adminProfile, user } = useAuth();
  const { logAction } = useActivityLogs();
  const { songs } = useSongs();

  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'implemented'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const isSuperAdmin = adminProfile?.role === 'super_admin';
  const adminDisplayName = adminProfile?.name || user?.email || 'Dirigente';

  // Filter suggestions
  const filteredSuggestions = suggestions.filter((s) => {
    const matchesStatus =
      filterStatus === 'all' ? true : s.status === filterStatus;

    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      s.title.toLowerCase().includes(query) ||
      (s.notes && s.notes.toLowerCase().includes(query)) ||
      (s.suggested_by_name && s.suggested_by_name.toLowerCase().includes(query));

    return matchesStatus && matchesSearch;
  });

  // Sugestões cujo título corresponde a uma música já existente no cancioneiro
  const existingSongBySuggestion = useMemo(() => {
    const map = new Map<string, DuplicateMatch<Song>>();
    for (const s of suggestions) {
      const [match] = findDuplicateSongs({ title: s.title }, songs, { limit: 1 });
      if (match) map.set(s.id, match);
    }
    return map;
  }, [suggestions, songs]);

  const pendingCount = suggestions.filter((s) => s.status === 'pending').length;
  const implementedCount = suggestions.filter((s) => s.status === 'implemented').length;

  const handleToggle = async (suggestion: SongSuggestion) => {
    setActionLoadingId(suggestion.id);
    try {
      const willBeImplemented = suggestion.status === 'pending';
      const { error } = await toggleImplemented(suggestion.id, suggestion.status, adminDisplayName);
      if (error) throw error;
      if (willBeImplemented) {
        logAction({
          action: 'suggestion_implemented',
          entity_type: 'suggestion',
          entity_id: suggestion.id,
          entity_title: suggestion.title,
          details: {
            suggested_by: suggestion.suggested_by_name || 'Anónimo',
            notes: suggestion.notes || null
          }
        });
      }
    } catch (err) {
      console.error(err);
      alert('Não foi possível atualizar o estado da sugestão.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    const target = suggestions.find(s => s.id === deleteTargetId);
    try {
      const { error } = await deleteSuggestion(deleteTargetId);
      if (error) throw error;
      if (target) {
        logAction({
          action: 'suggestion_rejected',
          entity_type: 'suggestion',
          entity_id: target.id,
          entity_title: target.title,
          details: {
            suggested_by: target.suggested_by_name || 'Anónimo'
          }
        });
      }
    } catch (err) {
      console.error(err);
      alert('Não foi possível eliminar a sugestão.');
    } finally {
      setDeleteTargetId(null);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com resumo e filtros */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <span>Caixa de Sugestões</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cânticos sugeridos pelos escuteiros e utilizadores do cancioneiro.
          </p>
        </div>

        {/* Status Filters */}
        <div className="flex items-center bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl border border-gray-200 dark:border-zinc-700 text-xs">
          <button
            type="button"
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterStatus === 'pending'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <span>Pendentes</span>
            {pendingCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                filterStatus === 'pending' ? 'bg-amber-600 text-white' : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('implemented')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterStatus === 'implemented'
                ? 'bg-green-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <span>Realizadas</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              filterStatus === 'implemented' ? 'bg-green-700 text-white' : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300'
            }`}>
              {implementedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterStatus === 'all'
                ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <span>Todas</span>
            <span className="text-gray-400">({suggestions.length})</span>
          </button>
        </div>
      </div>

      {/* Barra de Pesquisa */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          placeholder="Pesquisar sugestões por nome do cântico, notas ou autor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none shadow-xs"
        />
      </div>

      {/* Lista de Sugestões */}
      {loading ? (
        <div className="p-12 text-center text-gray-400">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm">A carregar sugestões...</p>
        </div>
      ) : filteredSuggestions.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-12 text-center">
          <Lightbulb className="w-12 h-12 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">
            {filterStatus === 'pending'
              ? 'Não há sugestões pendentes!'
              : filterStatus === 'implemented'
              ? 'Nenhuma sugestão marcada como implementada.'
              : 'Nenhuma sugestão encontrada.'}
          </h3>
          {filterStatus === 'pending' && (
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Todas as sugestões enviadas já foram analisadas ou implementadas.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredSuggestions.map((suggestion) => {
            const isImplemented = suggestion.status === 'implemented';
            const isActionLoading = actionLoadingId === suggestion.id;
            const existingMatch = existingSongBySuggestion.get(suggestion.id);

            return (
              <div
                key={suggestion.id}
                className={`bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl border transition-all p-5 shadow-xs ${
                  isImplemented
                    ? 'border-green-200/80 dark:border-green-950/60 bg-green-50/20 dark:bg-green-950/10'
                    : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  
                  {/* Informação Principal */}
                  <div className="flex-1 space-y-2.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                        {suggestion.title}
                      </h3>

                      {isImplemented ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-950/80 dark:text-green-300 border border-green-200 dark:border-green-800">
                          <Check className="w-3 h-3" />
                          <span>Implementada</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <Clock className="w-3 h-3" />
                          <span>Pendente</span>
                        </span>
                      )}

                      {existingMatch && (
                        <Link
                          to={`/song/${existingMatch.song.id}`}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors ${
                            existingMatch.kind === 'exact'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border-sky-200 dark:border-sky-800 hover:bg-sky-200 dark:hover:bg-sky-900'
                              : 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700'
                          }`}
                          title={`Abrir "${existingMatch.song.title}" no cancioneiro`}
                        >
                          <BookCheck className="w-3 h-3" />
                          <span>
                            {existingMatch.kind === 'exact'
                              ? 'Já existe no cancioneiro'
                              : `Parecida com "${existingMatch.song.title}"`}
                          </span>
                        </Link>
                      )}
                    </div>

                    {/* Metadados: Data e Quem sugeriu */}
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Sugerida a {formatDate(suggestion.created_at)}</span>
                      </div>

                      {suggestion.suggested_by_name && (
                        <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300 font-medium">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          <span>Por: {suggestion.suggested_by_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Observações / Notas */}
                    {suggestion.notes && (
                      <div className="p-3 bg-gray-50 dark:bg-zinc-800/60 rounded-xl text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2 border border-gray-100 dark:border-zinc-800">
                        <MessageSquare className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{suggestion.notes}</span>
                      </div>
                    )}

                    {/* Links externos (YouTube e Acordes) */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {isSafeHttpUrl(suggestion.youtube_url) && (
                        <a
                          href={suggestion.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-900/80 transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Ver no YouTube</span>
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      )}

                      {isSafeHttpUrl(suggestion.chords_url) && (
                        <a
                          href={suggestion.chords_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-900/80 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Link para Acordes</span>
                        </a>
                      )}
                    </div>

                    {/* Informação de quem implementou */}
                    {isImplemented && suggestion.implemented_at && (
                      <div className="text-[11px] text-green-700 dark:text-green-400 font-medium pt-1">
                        ✓ Implementada a {formatDate(suggestion.implemented_at)}
                        {suggestion.implemented_by && ` por ${suggestion.implemented_by}`}
                      </div>
                    )}
                  </div>

                  {/* Ações (Dirigentes & Superadmin) */}
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-zinc-800 shrink-0">
                    
                    {/* Botão de Criação Rápida no Cancioneiro (se pendente) */}
                    {!isImplemented && (
                      <Link
                        to={`/admin/new?title=${encodeURIComponent(suggestion.title)}${
                          suggestion.youtube_url ? `&youtube_url=${encodeURIComponent(suggestion.youtube_url)}` : ''
                        }`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 text-xs font-bold transition-colors cursor-pointer"
                        title="Abrir editor de música com este título preenchido"
                      >
                        <Plus className="w-3.5 h-3.5 text-green-600" />
                        <span>Criar Cântico</span>
                      </Link>
                    )}

                    {/* Botão de Marcar como Implementada (Ação de Dirigente) */}
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleToggle(suggestion)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                        isImplemented
                          ? 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                      title={
                        isImplemented
                          ? 'Reverter estado para pendente'
                          : 'Colocar um certo a marcar que este cântico já foi implementado no cancioneiro'
                      }
                    >
                      {isActionLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : isImplemented ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Desmarcar</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Marcar Implementada</span>
                        </>
                      )}
                    </button>

                    {/* Botão de Remoção: EXCLUSIVO do Superadmin e apenas para sugestões JÁ REALIZADAS */}
                    {isSuperAdmin && isImplemented && (
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(suggestion.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Remover esta sugestão concluída definitivamente (exclusivo Superadmin)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação de Remoção para o Superadmin */}
      <ConfirmModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
        title="Remover Sugestão Concluída"
        message="Tens a certeza que desejas remover esta sugestão já implementada? Esta ação não pode ser revertida."
        confirmText="Sim, Remover"
        cancelText="Cancelar"
        variant="danger"
        icon="trash"
      />
    </div>
  );
}
