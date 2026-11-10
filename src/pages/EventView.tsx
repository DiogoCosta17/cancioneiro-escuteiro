import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEvent, useOfflineEventSave } from '../hooks/useEvents';
import { parseEventDate } from '../lib/dates';
import { Calendar, MapPin, Printer, ArrowLeft, BookOpen, Music, Edit, QrCode, Play, CloudDownload, CloudCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRestoreReturnScroll } from '../hooks/useRestoreReturnScroll';
import { ShareRepertoireModal } from '../components/common/ShareRepertoireModal';
import { getEventShareUrl } from '../lib/share-url';
import { isAleluiaMoment } from '../lib/liturgical-moments';

const metaChip = 'flex items-center gap-2 bg-gray-50 dark:bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-zinc-800 text-sm min-w-0 break-words';
const secondaryBtn = 'flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors border border-gray-200 dark:border-zinc-700 shadow-xs justify-center cursor-pointer';

export const EventView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { event, eventSongs, loading, error } = useEvent(id);
  const { isAdmin } = useAuth();
  const [showShareModal, setShowShareModal] = useState(false);
  const closeShareModal = useCallback(() => setShowShareModal(false), []);
  const offline = useOfflineEventSave(event, eventSongs);

  useEffect(() => {
    if (event?.title) {
      document.title = `${event.title} — Cancioneiro 488`;
    } else {
      document.title = 'Evento — Cancioneiro 488';
    }
  }, [event?.title]);

  const validEventSongs = useMemo(() => {
    if (!Array.isArray(eventSongs)) return [];
    return eventSongs.filter(es => Boolean(es && es.song && es.song.id));
  }, [eventSongs]);

  // Versículo do Aleluia: mostra-se no primeiro cântico do momento Aleluia
  const acclamation = event?.gospel_acclamation?.trim() || '';
  const acclamationIndex = Array.isArray(eventSongs) ? eventSongs.findIndex(es => isAleluiaMoment(es?.moment_name)) : -1;

  const firstValidSong = validEventSongs[0]?.song;

  useRestoreReturnScroll([eventSongs, loading]);

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/eventos');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#2d5016]"></div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          {error || 'Evento não encontrado.'}
        </div>
        <button onClick={handleBack} className="inline-flex items-center gap-2 mt-4 text-[#2d5016] hover:underline cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Voltar aos eventos
        </button>
      </div>
    );
  }

  const eventDate = parseEventDate(event.date);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header Visual */}
      <div className="mb-8">
        <button onClick={handleBack} className="inline-flex items-center gap-2 mb-6 text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors text-sm font-medium cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 sm:p-8 border border-gray-200 dark:border-zinc-800 shadow-sm flex flex-col gap-6">
          {/* Título e Metadados do Evento (Largura Total sem compressão) */}
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-tight mb-4 break-words">
              {event.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-gray-600 dark:text-gray-400">
              <div className={`${metaChip} font-medium`}>
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                {eventDate.toLocaleDateString('pt-PT', { 
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                })}
              </div>
              {event.location && (
                <div className={metaChip}>
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  {event.location}
                </div>
              )}
            </div>
          </div>

          {/* Barra de Ações do Evento */}
          <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-gray-100 dark:border-zinc-800/80">
            {firstValidSong && (
              <Link
                to={`/song/${firstValidSong.id}?event=${event.id}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-semibold transition-colors shadow-xs justify-center cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Modo Celebração (Tocar)</span>
              </Link>
            )}
            <Link
              to={`/evento/${event.id}/print`}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#2d5016] text-white rounded-lg font-medium hover:bg-[#3a681d] transition-colors shadow-sm justify-center cursor-pointer w-full sm:w-auto"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Repertório</span>
            </Link>
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className={secondaryBtn}
            >
              <QrCode className="w-4 h-4 text-[#2d5016] dark:text-green-400" />
              <span>Partilhar / QR Code</span>
            </button>
            <button
              type="button"
              onClick={offline.save}
              disabled={offline.status === 'saving'}
              aria-busy={offline.status === 'saving'}
              title={
                offline.record
                  ? 'Este evento e os seus cânticos estão guardados neste dispositivo. Clica para atualizar a cópia offline.'
                  : 'Guardar este evento e todos os seus cânticos neste dispositivo para usar sem rede'
              }
              className={`${secondaryBtn} disabled:opacity-70 disabled:cursor-wait`}
            >
              {offline.status === 'saving' ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin text-[#2d5016] dark:text-green-400" />
                  <span>
                    A guardar…
                    {offline.progress && offline.progress.total > 0
                      ? ` ${offline.progress.done}/${offline.progress.total}`
                      : ''}
                  </span>
                </>
              ) : offline.record ? (
                <>
                  <CloudCheck className="w-4 h-4 text-green-700 dark:text-green-400" />
                  <span>
                    Disponível offline
                    <span className="text-xs text-gray-500 dark:text-zinc-400 font-normal">
                      {' · '}
                      {new Date(offline.record.savedAt).toLocaleDateString('pt-PT', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <CloudDownload className="w-4 h-4 text-[#2d5016] dark:text-green-400" />
                  <span>Guardar offline</span>
                </>
              )}
            </button>
            {isAdmin && (
              <Link
                to={`/admin/events/edit/${event.id}`}
                className={secondaryBtn}
                title="Editar evento no painel de administração"
              >
                <Edit className="w-4 h-4 text-green-700 dark:text-green-400" />
                <span>Editar Evento</span>
              </Link>
            )}
          </div>

          {(offline.error || offline.warning) && (
            <div
              role={offline.error ? 'alert' : 'status'}
              className={`-mt-2 flex items-start gap-2 text-sm rounded-lg px-3.5 py-2.5 border ${
                offline.error
                  ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200'
              }`}
            >
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{offline.error || offline.warning}</span>
            </div>
          )}

          {(event.reader_1 || event.psalmist || event.reader_2) && (
            <div className="pt-6 border-t border-gray-100 dark:border-zinc-800">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                Leituras & Salmo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {event.reader_1 && (
                  <div className="bg-gray-50 dark:bg-zinc-800/60 p-3.5 rounded-xl border border-gray-100 dark:border-zinc-700/50 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/40 text-[#2d5016] dark:text-green-400 shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">1ª Leitura</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{event.reader_1}</span>
                    </div>
                  </div>
                )}
                {event.psalmist && (
                  <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-200/50 dark:border-amber-900/30 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 shrink-0">
                      <Music className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs text-amber-700 dark:text-amber-400 block font-medium">Salmo Responsorial</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{event.psalmist}</span>
                    </div>
                  </div>
                )}
                {event.reader_2 && (
                  <div className="bg-gray-50 dark:bg-zinc-800/60 p-3.5 rounded-xl border border-gray-100 dark:border-zinc-700/50 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/40 text-[#2d5016] dark:text-green-400 shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">2ª Leitura</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{event.reader_2}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Versículo do Aleluia sem Aleluia no alinhamento: mostra-se antes dos cânticos */}
      {acclamation && acclamationIndex < 0 && (
        <div className="mb-6 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20">
          <h2 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1">Versículo do Aleluia</h2>
          <p className="text-gray-900 dark:text-gray-100 italic whitespace-pre-line">{acclamation}</p>
        </div>
      )}

      {/* Lista de Cânticos do Evento */}
      <div className="space-y-6">
        {(Array.isArray(eventSongs) ? eventSongs : []).map((eventSong, index) => {
          if (!eventSong) return null;
          const song = eventSong.song;
          return (
            <div key={eventSong.id} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
              {eventSong.moment_name && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/40 px-6 py-3 font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-100 flex items-center justify-center text-xs font-black">
                    {eventSong.order_index + 1}
                  </span>
                  {eventSong.moment_name}
                </div>
              )}
              
              <div className="p-6">
                {song ? (
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{song.title || 'Sem título'}</h3>
                      {song.artist && <p className="text-gray-600 dark:text-gray-400 mt-0.5">{song.artist}</p>}
                    </div>
                    <Link 
                      id={`song-card-${song.id}`}
                      to={song.id ? `/song/${song.id}?event=${event.id}` : '#'}
                      onClick={() => {
                        try {
                          sessionStorage.setItem('return_to_scroll_y', String(window.scrollY));
                          if (song.id) {
                            sessionStorage.setItem('return_to_song_id', song.id);
                          }
                        } catch {}
                      }}
                      className="px-4 py-2 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                    >
                      Ver Música
                    </Link>
                  </div>
                ) : (
                  <p className="text-gray-500 italic">Música não encontrada.</p>
                )}
                {acclamation && index === acclamationIndex && (
                  <p className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800 text-gray-800 dark:text-gray-200 italic whitespace-pre-line">
                    <span className="not-italic text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block mb-1">Versículo</span>
                    {acclamation}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Partilha / Código QR */}
      <ShareRepertoireModal
        isOpen={showShareModal}
        onClose={closeShareModal}
        title={event.title}
        subtitle={event.location || undefined}
        shareUrl={getEventShareUrl(event.id)}
        songCount={validEventSongs.length}
      />
    </div>
  );
};
