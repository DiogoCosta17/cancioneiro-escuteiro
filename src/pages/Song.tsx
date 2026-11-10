import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, ListMusic, Calendar } from 'lucide-react';
import { useSongs } from '../hooks/useSongs';
import { useSongList } from '../hooks/useSongList';
import { useEvent } from '../hooks/useEvents';
import { SongView } from '../components/songs/SongView';
import { FavoriteButton } from '../components/songs/FavoriteButton';
import { SongShareButton } from '../components/songs/SongShareButton';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useStageNavigation } from '../hooks/useStageNavigation';
import { useWakeLock } from '../hooks/useWakeLock';
import type { Song } from '../lib/types';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import {
  isMissingSettingsColumnError,
  normalizeEventSongNotes,
  readEventKeySettings,
  summarizeEventSong,
  toEventKeyColumns,
  type EventKeySettings,
} from '../lib/event-song-settings';
import type { EventSongContext } from '../components/songs/EventSongPanel';
import { isAleluiaMoment } from '../lib/liturgical-moments';

export default function Song() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getSong } = useSongs();
  const { selectedSongIds } = useSongList();

  const listParam = searchParams.get('list');
  const eventIdParam = searchParams.get('event') || undefined;
  const { event, eventSongs, loading: eventLoading, refetch: refetchEvent } = useEvent(eventIdParam);
  const { isAdmin, user, adminProfile } = useAuth();
  
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [id]);

  useEffect(() => {
    // Ignorar respostas de uma música anterior (ex.: carregar várias vezes em "Seguinte" no modo palco)
    let cancelled = false;
    async function loadSong() {
      if (!id) return;
      try {
        const data = await getSong(id);
        if (!cancelled) setSong(data || null);
      } catch (error) {
        console.error('Failed to load song:', error);
        // Não deixar a música anterior no ecrã sob o URL da nova. (Não se limpa no início do efeito:
        // na navegação "Seguinte/Anterior" do modo palco isso faria piscar o ecrã.)
        if (!cancelled) setSong(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    
    loadSong();
    return () => {
      cancelled = true;
    };
  }, [id, getSong]);

  useEffect(() => {
    document.title = song ? `${song.title} — Cancioneiro 488` : 'Cancioneiro 488-Mafra';
    return () => {
      document.title = 'Cancioneiro 488-Mafra';
    };
  }, [song]);

  // Navegação contínua de palco (A Minha Lista ou Evento Litúrgico)
  const stageNavigation = useMemo(() => {
    if (!id) return null;

    if (listParam === 'mylist' && selectedSongIds.length > 0) {
      const idx = selectedSongIds.indexOf(id);
      if (idx === -1) return null;
      const prevId = idx > 0 ? selectedSongIds[idx - 1] : null;
      const nextId = idx < selectedSongIds.length - 1 ? selectedSongIds[idx + 1] : null;
      return {
        mode: 'mylist' as const,
        label: 'A Minha Lista',
        subLabel: null,
        currentIndex: idx + 1,
        total: selectedSongIds.length,
        prevUrl: prevId ? `/song/${prevId}?list=mylist` : null,
        nextUrl: nextId ? `/song/${nextId}?list=mylist` : null,
        backToContextUrl: '/lista',
      };
    }

    if (eventIdParam && eventSongs.length > 0) {
      const idx = eventSongs.findIndex((es) => es.song_id === id);
      if (idx === -1) return null;
      const prevItem = idx > 0 ? eventSongs[idx - 1] : null;
      const nextItem = idx < eventSongs.length - 1 ? eventSongs[idx + 1] : null;
      const currentItem = eventSongs[idx];
      return {
        mode: 'event' as const,
        label: event?.title || 'Celebração',
        subLabel: currentItem?.moment_name || null,
        currentIndex: idx + 1,
        total: eventSongs.length,
        prevUrl: prevItem ? `/song/${prevItem.song_id}?event=${encodeURIComponent(eventIdParam)}` : null,
        nextUrl: nextItem ? `/song/${nextItem.song_id}?event=${encodeURIComponent(eventIdParam)}` : null,
        backToContextUrl: `/evento/${eventIdParam}`,
      };
    }

    return null;
  }, [id, listParam, selectedSongIds, eventIdParam, eventSongs, event]);

  const isStageMode = Boolean(stageNavigation);

  // Cântico atual no evento (tom/capo e notas definidos pelos dirigentes para esse evento)
  const currentEventSong = useMemo(() => {
    if (!eventIdParam || !id) return null;
    return eventSongs.find((es) => es.song_id === id) || null;
  }, [eventIdParam, id, eventSongs]);

  const saveEventKey = useCallback(
    async (settings: EventKeySettings | null): Promise<string | null> => {
      if (!supabase || !currentEventSong || !song) return 'Sem ligação à base de dados.';
      const columns = toEventKeyColumns(settings, song);
      const { error } = await supabase.from('event_songs').update(columns).eq('id', currentEventSong.id);
      if (error) {
        console.error('Erro ao guardar tom do evento:', error);
        return isMissingSettingsColumnError(error)
          ? 'Falta aplicar a migração 021 no Supabase.'
          : 'Não foi possível guardar. Tenta novamente.';
      }
      // Histórico (o autor é preenchido no servidor; uma falha aqui não desfaz a gravação)
      try {
        const before = summarizeEventSong(currentEventSong, song) || 'tom original';
        const after = summarizeEventSong({ ...currentEventSong, ...columns }, song) || 'tom original';
        await supabase.from('activity_logs').insert([{
          user_id: user?.id,
          user_name: adminProfile?.name || user?.email?.split('@')[0] || 'Dirigente',
          user_email: user?.email || 'desconhecido',
          action: 'event_songs_updated',
          entity_type: 'event',
          entity_id: currentEventSong.event_id,
          entity_title: event?.title || 'Evento',
          details: { changes: { [`Tom/notas — ${song.title}`]: { old: before, new: after } } },
        }]);
      } catch (logErr) {
        console.warn('Não foi possível registar no histórico:', logErr);
      }
      await refetchEvent();
      return null;
    },
    [currentEventSong, song, user, adminProfile, event?.title, refetchEvent]
  );

  const eventContext = useMemo<EventSongContext | null>(() => {
    if (!currentEventSong || !song) return null;
    return {
      eventTitle: event?.title || 'este evento',
      keySettings: readEventKeySettings(currentEventSong, song),
      notes: normalizeEventSongNotes(currentEventSong.notes),
      // Versículo do Aleluia: no primeiro cântico do momento Aleluia (como na página do evento)
      gospelAcclamation:
        event?.gospel_acclamation?.trim() &&
        eventSongs.find((es) => isAleluiaMoment(es.moment_name))?.id === currentEventSong.id
          ? event.gospel_acclamation.trim()
          : null,
      onSaveKey: isAdmin ? saveEventKey : undefined,
    };
  }, [currentEventSong, song, event?.title, event?.gospel_acclamation, eventSongs, isAdmin, saveEventKey]);

  // Modo palco: manter o ecrã ligado enquanto se percorre o alinhamento
  useWakeLock(isStageMode);

  // Modo palco: setas, PageUp/PageDown (pedais Bluetooth) e deslize horizontal
  const navigateStage = useCallback((url: string) => navigate(url), [navigate]);
  useStageNavigation({
    enabled: isStageMode,
    prevUrl: stageNavigation?.prevUrl ?? null,
    nextUrl: stageNavigation?.nextUrl ?? null,
    onNavigate: navigateStage,
  });

  const handleBack = () => {
    if (stageNavigation) {
      navigate(stageNavigation.backToContextUrl);
      return;
    }
    // Se o utilizador tiver histórico nesta sessão, navega para trás restaurando o scroll e os filtros
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  // Aberta a partir de um evento: espera pelo evento para abrir já no tom definido para ele
  if (loading || (eventIdParam && eventLoading && !event)) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-scout-green"></div>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">Música não encontrada</h2>
        <button 
          onClick={handleBack}
          className="inline-flex items-center text-scout-green hover:text-scout-green-light dark:text-green-400 font-medium cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 print:hidden">
        <button 
          onClick={handleBack}
          className="inline-flex items-center text-sm text-gray-500 dark:text-zinc-400 hover:text-green-800 dark:hover:text-green-300 font-semibold transition-colors group cursor-pointer"
          title="Voltar à página anterior"
        >
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Voltar
        </button>

        {stageNavigation && (
          <div
            className="flex items-center gap-2 sm:gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 px-3 py-1.5 rounded-xl shadow-xs text-xs sm:text-sm"
            aria-label="Navegação de repertório"
            title="Muda de música com as setas ← →, PageUp/PageDown (pedal Bluetooth) ou deslizando para o lado"
          >
            <Link
              to={stageNavigation.prevUrl || '#'}
              aria-disabled={!stageNavigation.prevUrl}
              onClick={(e) => {
                if (!stageNavigation.prevUrl) e.preventDefault();
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold transition-colors ${
                stageNavigation.prevUrl
                  ? 'text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer'
                  : 'text-gray-300 dark:text-zinc-600 cursor-not-allowed'
              }`}
              title="Música anterior no alinhamento"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Anterior</span>
            </Link>

            <div className="flex items-center gap-1.5 px-2 border-x border-gray-100 dark:border-zinc-800 text-center">
              {stageNavigation.mode === 'mylist' ? (
                <ListMusic className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <Calendar className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
              )}
              <span className="font-bold text-gray-800 dark:text-zinc-200">
                Música {stageNavigation.currentIndex} de {stageNavigation.total}
              </span>
              <span className="text-gray-400 dark:text-zinc-500 hidden md:inline">•</span>
              <span className="text-gray-600 dark:text-zinc-400 font-medium hidden md:inline truncate max-w-[180px]">
                {stageNavigation.subLabel || stageNavigation.label}
              </span>
            </div>

            <Link
              to={stageNavigation.nextUrl || '#'}
              aria-disabled={!stageNavigation.nextUrl}
              onClick={(e) => {
                if (!stageNavigation.nextUrl) e.preventDefault();
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold transition-colors ${
                stageNavigation.nextUrl
                  ? 'text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer'
                  : 'text-gray-300 dark:text-zinc-600 cursor-not-allowed'
              }`}
              title="Música seguinte no alinhamento"
            >
              <span className="hidden sm:inline">Seguinte</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <div className="flex items-center gap-2">
          <FavoriteButton songId={song.id} title={song.title} size="md" />
          <SongShareButton songId={song.id} title={song.title} artist={song.artist} />
        </div>
      </div>

      <SongView key={song.id} song={song} stageMode={isStageMode} eventContext={eventContext} />
    </div>
  );
}
