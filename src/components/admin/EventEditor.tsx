import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSongs } from '../../hooks/useSongs';
import { EventSong, Song } from '../../lib/types';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  GripVertical, 
  Save, 
  Search, 
  X, 
  ChevronUp, 
  ChevronDown, 
  Music, 
  ListMusic,
  Copy,
  Info,
  SlidersHorizontal,
  StickyNote
} from 'lucide-react';
import { getKeyName } from '../../lib/chords';
import { toLocalISODate } from '../../lib/dates';
import { getKeyOptions, mod12 } from '../../lib/key-picker';
import {
  EVENT_SONG_NOTES_MAX,
  isMissingSettingsColumnError,
  normalizeEventSongNotes,
  readEventKeySettings,
  settingsFromShape,
  shapeSemitones,
  songBaseCapo,
  summarizeEventSong,
  toEventKeyColumns,
} from '../../lib/event-song-settings';
import { ConfirmModal } from '../common/ConfirmModal';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import { useActivityLogs } from '../../hooks/useActivityLogs';
import { OfficialVerseLink } from '../eucharist/OfficialVerseLink';
import { buildDuplicateTitle, suggestDuplicateDate } from './eventDuplicate';
import { LITURGICAL_MOMENT_NAMES as LITURGICAL_MOMENTS } from '../../lib/liturgical-moments';

// Data de hoje no fuso local em 'YYYY-MM-DD' (toISOString usa UTC e pode dar o dia anterior).
interface EventFormSnapshot {
  title: string;
  date: string;
  location: string;
  reader1: string;
  psalmist: string;
  reader2: string;
  prayers: string;
  gospelAcclamation: string;
  songs: Partial<EventSong>[];
}

// Representação estável do formulário para detetar alterações por guardar
const serializeEventForm = (f: EventFormSnapshot) =>
  JSON.stringify([
    f.title.trim(),
    f.date,
    f.location.trim(),
    f.reader1.trim(),
    f.psalmist.trim(),
    f.reader2.trim(),
    f.prayers.trim(),
    f.gospelAcclamation.trim(),
    f.songs.map(s => [s.song_id, s.moment_name || '', s.transpose_semitones ?? null, s.capo ?? null, (s.notes || '').trim()]),
  ]);

export interface EventDraft {
  title: string;
  date: string;
  gospelAcclamation?: string;
  songs: Partial<EventSong>[];
}

/**
 * Proposta de missa enviada pela página da Eucaristia (no `state` da navegação).
 * O `state` sobrevive a recarregar a página, por isso é validado em vez de confiado.
 */
export function readMassPlanState(state: unknown): EventDraft | null {
  const plan = (state as { massPlan?: unknown } | null)?.massPlan as Record<string, unknown> | undefined;
  if (!plan || typeof plan.title !== 'string' || typeof plan.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)) {
    return null;
  }
  const songs = (Array.isArray(plan.songs) ? plan.songs : [])
    .filter((s): s is { song_id: string; moment_name?: unknown; song?: unknown } =>
      Boolean(s) && typeof (s as { song_id?: unknown }).song_id === 'string'
    )
    .map((s, index) => ({
      song_id: s.song_id,
      moment_name: typeof s.moment_name === 'string' ? s.moment_name : null,
      order_index: index,
      song: s.song && typeof s.song === 'object' ? (s.song as Song) : null,
    }));
  const gospelAcclamation = typeof plan.gospelAcclamation === 'string' ? plan.gospelAcclamation.slice(0, 600) : undefined;
  return { title: plan.title.slice(0, 200), date: plan.date, songs, ...(gospelAcclamation ? { gospelAcclamation } : {}) };
}

// Mesma rota-componente para editar / criar / duplicar: remontar ao mudar de evento ou de modelo
// (ex.: "Duplicar" a partir do editor), para não herdar o estado do formulário anterior.
export const EventEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const fromId = id ? null : searchParams.get('from');
  const draft = id || fromId ? null : readMassPlanState(location.state);
  return (
    <EventEditorForm
      key={`${id || 'new'}|${fromId || ''}|${draft ? location.key : ''}`}
      id={id}
      fromId={fromId}
      draft={draft}
    />
  );
};

const EventEditorForm: React.FC<{ id?: string; fromId: string | null; draft?: EventDraft | null }> = ({ id, fromId, draft }) => {
  const navigate = useNavigate();
  const { songs } = useSongs();
  const { logAction } = useActivityLogs();
  
  const [title, setTitle] = useState(() => draft?.title || '');
  const [date, setDate] = useState(() => draft?.date || toLocalISODate(new Date()));
  const [location, setLocation] = useState('');
  const [reader1, setReader1] = useState('');
  const [psalmist, setPsalmist] = useState('');
  const [reader2, setReader2] = useState('');
  const [prayers, setPrayers] = useState('');
  const [gospelAcclamation, setGospelAcclamation] = useState(() => draft?.gospelAcclamation || '');
  // Valor guardado na BD (para saber se é preciso enviar a coluna ao apagar o versículo)
  const [savedAcclamation, setSavedAcclamation] = useState('');
  const [eventSongs, setEventSongs] = useState<Partial<EventSong>[]>(() => draft?.songs || []);
  const [initialSongs, setInitialSongs] = useState<Partial<EventSong>[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id || !!fromId);
  const [loadFailed, setLoadFailed] = useState(false);
  // Título do evento usado como modelo (apenas ao duplicar)
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);

  // Estado de referência para o aviso de alterações não guardadas.
  // Num evento novo é o formulário vazio; ao editar, o evento carregado.
  // Ao duplicar, a referência continua a ser o formulário vazio: a cópia ainda não existe na BD.
  const [baseline, setBaseline] = useState(() =>
    serializeEventForm({
      title: '', date: toLocalISODate(new Date()), location: '', reader1: '', psalmist: '', reader2: '', prayers: '', gospelAcclamation: '', songs: []
    })
  );
  const isDirty =
    !loading &&
    serializeEventForm({ title, date, location, reader1, psalmist, reader2, prayers, gospelAcclamation, songs: eventSongs }) !== baseline;
  const { confirmLeave } = useUnsavedChangesWarning(isDirty);

  const guardLink = (e: React.MouseEvent) => {
    if (!confirmLeave()) e.preventDefault();
  };
  
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [dragOverSongId, setDragOverSongId] = useState<string | null>(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: ''
  });

  const loadEvent = useCallback(async () => {
    // Editar: carrega o próprio evento. Duplicar: carrega o evento modelo (apenas leitura).
    const sourceId = id || fromId;
    if (!sourceId) return;
    const isDuplicate = !id;
    try {
      setLoading(true);
      setLoadFailed(false);
      const { data: event, error: eventError } = await supabase!
        .from('events')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (eventError) throw eventError;

      const { data: songsData, error: songsError } = await supabase!
        .from('event_songs')
        .select('*, songs(*)')
        .eq('event_id', sourceId)
        .order('order_index', { ascending: true });

      if (songsError) throw songsError;

      const formattedSongs = (songsData || []).map(item => ({
        id: item.id,
        event_id: item.event_id,
        song_id: item.song_id,
        moment_name: item.moment_name,
        order_index: item.order_index,
        transpose_semitones: item.transpose_semitones ?? null,
        capo: item.capo ?? null,
        notes: item.notes ?? null,
        song: Array.isArray(item.songs) ? item.songs[0] : item.songs
      }));

      const loaded: EventFormSnapshot = {
        title: event.title,
        date: event.date,
        location: event.location || '',
        reader1: event.reader_1 || '',
        psalmist: event.psalmist || '',
        reader2: event.reader_2 || '',
        prayers: event.prayers || '',
        gospelAcclamation: event.gospel_acclamation || '',
        songs: formattedSongs
      };

      if (isDuplicate) {
        // Cópia: novo título e data; cânticos sem id/event_id (são inseridos como novos ao guardar)
        loaded.title = buildDuplicateTitle(event.title);
        loaded.date = suggestDuplicateDate(event.title, event.date);
        // O versículo é próprio de cada dia: não passa para a cópia
        loaded.gospelAcclamation = '';
        loaded.songs = formattedSongs
          .filter(es => es.song)
          .map((es, index) => ({
            song_id: es.song_id,
            moment_name: es.moment_name,
            order_index: index,
            // Tom, capo e notas passam para a cópia (o mesmo alinhamento costuma ser tocado igual)
            transpose_semitones: es.transpose_semitones,
            capo: es.capo,
            notes: es.notes,
            song: es.song
          }));
        setTemplateTitle(event.title);
      }

      setTitle(loaded.title);
      setDate(loaded.date);
      setLocation(loaded.location);
      setReader1(loaded.reader1);
      setPsalmist(loaded.psalmist);
      setReader2(loaded.reader2);
      setPrayers(loaded.prayers);
      setGospelAcclamation(loaded.gospelAcclamation);
      if (!isDuplicate) setSavedAcclamation(loaded.gospelAcclamation);
      setEventSongs(loaded.songs);

      if (!isDuplicate) {
        setInitialSongs(formattedSongs);
        setBaseline(serializeEventForm(loaded));
      }
    } catch (error) {
      console.error(error);
      if (isDuplicate) {
        // Falhou o modelo: fica um formulário de evento novo vazio (nada a proteger na BD)
        setErrorModal({
          isOpen: true,
          message: 'Não foi possível carregar o evento a duplicar. Podes criar o evento de raiz.'
        });
      } else {
        setLoadFailed(true);
        setErrorModal({
          isOpen: true,
          message: 'Não foi possível carregar os dados deste evento.'
        });
      }
    } finally {
      setLoading(false);
    }
  }, [id, fromId]);

  useEffect(() => {
    if (id || fromId) {
      loadEvent();
    }
  }, [id, fromId, loadEvent]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Evita apagar o repertório existente quando o carregamento falhou (lista local vazia/incompleta)
    if (loadFailed) {
      setErrorModal({
        isOpen: true,
        message: 'Os dados deste evento não foram carregados corretamente. Recarrega a página antes de guardar.'
      });
      return;
    }
    let createdEventId: string | null = null;
    try {
      setSaving(true);
      
      let eventId = id;
      
      // 1. Save Event with reader fields
      const eventData: Record<string, any> = { 
        title, 
        date, 
        location,
        reader_1: reader1.trim() || null,
        psalmist: psalmist.trim() || null,
        reader_2: reader2.trim() || null,
        prayers: prayers.trim() || null
      };
      // A coluna do versículo (migração 020) só é enviada quando há valor novo ou é preciso apagá-lo
      if (gospelAcclamation.trim() || savedAcclamation) {
        eventData.gospel_acclamation = gospelAcclamation.trim() || null;
      }
      // Se a BD ainda não tiver alguma coluna: tenta sem o versículo e, por fim, só com os dados básicos
      const { gospel_acclamation: _omit, ...withoutAcclamation } = eventData;
      const attempts: Record<string, any>[] = [eventData];
      if ('gospel_acclamation' in eventData) attempts.push(withoutAcclamation);
      attempts.push({ title, date, location });
      let acclamationDropped = false;
      const isMissingColumn = (err: { message?: string } | null) => Boolean(err?.message?.toLowerCase().includes('column'));

      for (let i = 0; i < attempts.length; i++) {
        const payload = attempts[i];
        const isLast = i === attempts.length - 1;
        if (id) {
          const { error } = await supabase!.from('events').update(payload).eq('id', id);
          if (!error) break;
          if (isLast || !isMissingColumn(error)) throw error;
        } else {
          const { data, error } = await supabase!.from('events').insert(payload).select().single();
          if (!error) {
            eventId = data.id;
            createdEventId = data.id;
            break;
          }
          if (isLast || !isMissingColumn(error)) throw error;
        }
        if ('gospel_acclamation' in payload) acclamationDropped = true;
      }
      
      // 2. Inserir primeiro os novos cânticos (se falhar, o repertório antigo mantém-se intacto)
      let insertedIds: string[] = [];
      let settingsDropped = false;
      if (eventSongs.length > 0 && eventId) {
        const baseRows = eventSongs.map((es, index) => ({
          event_id: eventId,
          song_id: es.song_id,
          moment_name: es.moment_name || null,
          order_index: index
        }));
        // Tom/capo/notas (migração 021): só se enviam as colunas se algum cântico as usar
        const settingsRows = eventSongs.map(es => ({
          ...toEventKeyColumns(readEventKeySettings(es, es.song), es.song),
          notes: normalizeEventSongNotes(es.notes),
        }));
        const hasSettings = settingsRows.some(r => r.transpose_semitones !== null || r.notes !== null);
        let { data: inserted, error: insertError } = await supabase!
          .from('event_songs')
          .insert(hasSettings ? baseRows.map((row, i) => ({ ...row, ...settingsRows[i] })) : baseRows)
          .select('id');
        if (insertError && hasSettings && isMissingSettingsColumnError(insertError)) {
          // A BD ainda não tem as colunas: guarda o alinhamento sem tom/notas e avisa
          settingsDropped = true;
          ({ data: inserted, error: insertError } = await supabase!.from('event_songs').insert(baseRows).select('id'));
        }
        if (insertError) throw insertError;
        insertedIds = (inserted || []).map(row => row.id);
      }

      // 3. Remover as linhas antigas (todas as do evento exceto as acabadas de inserir)
      if (id) {
        let deleteQuery = supabase!.from('event_songs').delete().eq('event_id', id);
        if (insertedIds.length > 0) {
          deleteQuery = deleteQuery.not('id', 'in', `(${insertedIds.join(',')})`);
        }
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;
      }

      // 4. Anexar histórico de alterações de cânticos ao log de atividade se for uma edição
      if (id) {
        try {
          const oldIds = initialSongs.map(s => s.song_id);
          const newIds = eventSongs.map(s => s.song_id);
          const addedSongs = eventSongs
            .filter(s => !oldIds.includes(s.song_id))
            .map(s => s.song?.title || 'Cântico');
          const removedSongs = initialSongs
            .filter(s => !newIds.includes(s.song_id))
            .map(s => s.song?.title || 'Cântico');

          const songsModified = addedSongs.length > 0 || removedSongs.length > 0 || 
            initialSongs.length !== eventSongs.length ||
            initialSongs.some((s, idx) => s.song_id !== eventSongs[idx]?.song_id || s.moment_name !== eventSongs[idx]?.moment_name);

          // Tom/capo/notas alterados nos cânticos que continuam no evento
          const settingsChanges: Record<string, { old: string; new: string }> = {};
          if (!settingsDropped) {
            for (const es of eventSongs) {
              const before = initialSongs.find(s => s.song_id === es.song_id);
              if (!before) continue;
              const oldText = summarizeEventSong(before, before.song);
              const newText = summarizeEventSong(es, es.song);
              if (oldText !== newText) {
                settingsChanges[`Tom/notas — ${es.song?.title || 'Cântico'}`] = {
                  old: oldText || 'tom original',
                  new: newText || 'tom original'
                };
              }
            }
          }

          if (songsModified || Object.keys(settingsChanges).length > 0) {
            // Registo próprio (a BD não permite alterar registos existentes do histórico).
            // O ecrã do histórico mostra `details.changes.songs` como cânticos adicionados/removidos.
            await logAction({
              action: 'event_songs_updated',
              entity_type: 'event',
              entity_id: id,
              entity_title: title.trim() || 'Evento',
              details: {
                changes: {
                  ...(songsModified
                    ? {
                        songs: {
                          added: addedSongs,
                          removed: removedSongs,
                          total_old: initialSongs.length,
                          total_new: eventSongs.length
                        }
                      }
                    : {}),
                  ...settingsChanges
                }
              }
            });
          }
        } catch (logErr) {
          console.warn('Não foi possível anexar alterações de cânticos ao log:', logErr);
        }
      }
      
      if (acclamationDropped) {
        window.alert('O evento foi guardado, mas o versículo do Aleluia não: falta aplicar a migração 020 no Supabase.');
      }
      if (settingsDropped) {
        window.alert('O evento foi guardado, mas o tom, o capo e as notas dos cânticos não: falta aplicar a migração 021 no Supabase.');
      }

      // Uma proposta da Eucaristia fica no histórico do browser: substituí-la evita que "voltar" a preencha outra vez
      navigate('/admin', { replace: Boolean(draft) });
    } catch (error) {
      console.error(error);
      // Novo evento criado mas cânticos falharam: remover para não duplicar ao tentar novamente
      if (createdEventId) {
        await supabase!.from('events').delete().eq('id', createdEventId);
      }
      setErrorModal({
        isOpen: true,
        message: 'Ocorreu um erro ao guardar o evento. Por favor tenta novamente.'
      });
    } finally {
      setSaving(false);
    }
  };

  const addSong = (songId: string) => {
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    
    setEventSongs(prev => [
      ...prev,
      {
        song_id: song.id,
        moment_name: '',
        order_index: prev.length,
        song: song
      }
    ]);
  };

  const removeSong = (index: number) => {
    setEventSongs(prev => {
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  const moveUp = (index: number) => {
    setDraggedSongId(null);
    setDragOverSongId(null);
    if (index === 0) return;
    setEventSongs(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const moveDown = (index: number) => {
    setDraggedSongId(null);
    setDragOverSongId(null);
    setEventSongs(prev => {
      if (index === prev.length - 1) return prev;
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleConfirmClearAll = () => {
    setEventSongs([]);
    setDraggedSongId(null);
    setDragOverSongId(null);
  };

  const updateMoment = (index: number, moment_name: string) => {
    setEventSongs(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], moment_name };
      return copy;
    });
  };

  // Tom, capo e notas de um cântico neste evento
  const [openSettingsFor, setOpenSettingsFor] = useState<string | null>(null);

  const updateSongFields = (index: number, patch: Partial<EventSong>) => {
    setEventSongs(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const currentKeyOf = (es: Partial<EventSong>) =>
    readEventKeySettings(es, es.song) ?? { semitones: 0, capo: songBaseCapo(es.song) };

  // Escolher o tom dos acordes mantém o capo
  const selectShapeKey = (index: number, shapeOffset: number) => {
    const es = eventSongs[index];
    const current = currentKeyOf(es);
    updateSongFields(index, toEventKeyColumns(settingsFromShape(shapeOffset, current.capo, es.song), es.song));
  };

  // Mudar o capo mantém o tom em que se canta (como na página da música)
  const selectCapo = (index: number, capo: number) => {
    const es = eventSongs[index];
    const current = currentKeyOf(es);
    updateSongFields(index, toEventKeyColumns({ semitones: current.semitones, capo }, es.song));
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

    setEventSongs(prev => {
      const fromIndex = prev.findIndex(item => item.song_id === draggedSongId);
      const toIndex = prev.findIndex(item => item.song_id === targetSongId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const newSongs = [...prev];
      const [movedItem] = newSongs.splice(fromIndex, 1);
      newSongs.splice(toIndex, 0, movedItem);
      return newSongs;
    });

    setDraggedSongId(null);
    setDragOverSongId(null);
  };

  const handleDragEnd = () => {
    setDraggedSongId(null);
    setDragOverSongId(null);
  };

  // Conjunto dos IDs das músicas já selecionadas no evento
  const selectedSongIds = new Set(eventSongs.map(es => es.song_id));

  // Músicas disponíveis no catálogo (exclui as que já estão no evento)
  const filteredCatalogSongs = songs.filter(s => {
    if (selectedSongIds.has(s.id)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      (s.artist && s.artist.toLowerCase().includes(q)) ||
      (s.original_key && s.original_key.toLowerCase().includes(q)) ||
      (s.tags && s.tags.some(tag => tag.toLowerCase().includes(q)))
    );
  });

  if (loading) return <div className="p-8 text-center">A carregar...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <Link to="/admin" onClick={guardLink} className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-6">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Voltar ao Painel
      </Link>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Detalhes do Evento */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {id ? 'Editar Evento' : templateTitle ? 'Novo Evento (a partir de modelo)' : 'Novo Evento'}
            </h2>
            {id && !loadFailed && (
              <button
                type="button"
                onClick={() => {
                  if (confirmLeave()) navigate(`/admin/events/new?from=${id}`);
                }}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg border border-gray-200 dark:border-zinc-700 transition-colors cursor-pointer"
                title="Criar um novo evento com os mesmos dados e cânticos (a partir da versão guardada deste evento)"
              >
                <Copy className="w-3.5 h-3.5" />
                Duplicar
              </button>
            )}
          </div>

          {draft && (
            <div className="mb-6 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
              <span>
                Proposta de cânticos preparada na página <strong>Eucaristia</strong>. Revê o título, a data e os cânticos:
                nada é guardado até clicares em <strong>Guardar Evento</strong>.
              </span>
            </div>
          )}

          {templateTitle && (
            <div className="mb-6 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
              <span>
                Cópia de <strong>{templateTitle}</strong> com o mesmo local, leitores e cânticos. Revê a data e o título:
                nada é guardado até clicares em <strong>Guardar Evento</strong>.
              </span>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título *</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Missa de Promessas"
                className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-gray-900 dark:text-gray-100 py-2 px-3"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data *</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-gray-900 dark:text-gray-100 py-2 px-3"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Local / Igreja (Opcional)</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Ex: Igreja Matriz de Mafra"
                className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-gray-900 dark:text-gray-100 py-2 px-3"
              />
            </div>

            {/* Leitores e Salmista */}
            <div className="md:col-span-2 pt-4 border-t border-gray-100 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                <span>Leitores e Salmista</span>
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(Opcional)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    1ª Leitura
                  </label>
                  <input
                    type="text"
                    value={reader1}
                    onChange={e => setReader1(e.target.value)}
                    placeholder="Nome do leitor"
                    className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-gray-900 dark:text-gray-100 text-sm py-2 px-3"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Salmo Responsorial
                  </label>
                  <input
                    type="text"
                    value={psalmist}
                    onChange={e => setPsalmist(e.target.value)}
                    placeholder="Nome do salmista"
                    className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-gray-900 dark:text-gray-100 text-sm py-2 px-3"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    2ª Leitura
                  </label>
                  <input
                    type="text"
                    value={reader2}
                    onChange={e => setReader2(e.target.value)}
                    placeholder="Nome do leitor"
                    className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-gray-900 dark:text-gray-100 text-sm py-2 px-3"
                  />
                </div>
              </div>
            </div>

            {/* Versículo do Aleluia (aclamação ao Evangelho) */}
            <div className="md:col-span-2 pt-4 border-t border-gray-100 dark:border-zinc-800">
              <label htmlFor="gospel-acclamation" className="block mb-1 text-sm font-bold text-gray-800 dark:text-gray-200">
                Versículo do Aleluia <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(Opcional)</span>
              </label>
              <textarea
                id="gospel-acclamation"
                value={gospelAcclamation}
                onChange={e => setGospelAcclamation(e.target.value)}
                maxLength={600}
                rows={2}
                placeholder="Ex.: Vigiai e estai preparados, porque não sabeis a hora em que virá o Filho do homem."
                className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-gray-900 dark:text-gray-100 text-sm py-2 px-3"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Aparece por baixo do Aleluia na página do evento e na impressão. Copia-o da liturgia da data do evento.
              </p>
              <OfficialVerseLink dateISO={date} />
            </div>
          </div>
        </div>

        {/* Secção Dividida: Catálogo à esquerda | Repertório à direita */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Coluna Esquerda: Catálogo / Escolha de Músicas */}
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
                type="text"
                placeholder="Pesquisar por título, artista, tom..."
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
                      title="Adicionar ao evento"
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
                    {searchQuery ? 'Tenta outro termo na pesquisa.' : 'Para adicionar mais, podes remover alguma do repertório.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Repertório Selecionado */}
          <div className="lg:col-span-7 bg-white dark:bg-zinc-900 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 flex flex-col h-[650px]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ListMusic className="w-5 h-5 text-[#2d5016] dark:text-green-400" />
                <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Repertório do Evento</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#2d5016]/10 text-[#2d5016] dark:bg-green-950/60 dark:text-green-300 border border-green-200 dark:border-green-900/50">
                  {eventSongs.length} {eventSongs.length === 1 ? 'cântico' : 'cânticos'}
                </span>
                {eventSongs.length > 0 && (
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

            {/* Lista das músicas no evento */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              className="flex-1 overflow-y-auto space-y-2.5 pr-1"
            >
              {eventSongs.length > 0 ? (
                eventSongs.map((es, index) => {
                  const songId = es.song_id || `song-${index}`;
                  const isDragging = draggedSongId === songId;
                  const isDragOver = dragOverSongId === songId && !isDragging;

                  const keySettings = readEventKeySettings(es, es.song);
                  const notesText = normalizeEventSongNotes(es.notes);
                  const settingsOpen = openSettingsFor === songId;
                  const currentKey = currentKeyOf(es);
                  const originalKey = es.song?.original_key || '';
                  const shapeOffset = mod12(shapeSemitones(currentKey, es.song));
                  const keyOptions = originalKey ? getKeyOptions(originalKey, 'silabica') : [];
                  const baseCapo = songBaseCapo(es.song);
                  const summary = summarizeEventSong({ ...es, notes: null }, es.song);

                  return (
                    <div key={songId}>
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, songId)}
                      onDragOver={(e) => handleDragOver(e, songId)}
                      onDragLeave={(e) => handleDragLeave(e, songId)}
                      onDrop={(e) => handleDrop(e, songId)}
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
                          disabled={index === eventSongs.length - 1}
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
                        <div
                          className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate"
                          title={es.song?.title}
                        >
                          {es.song?.title || 'Cântico'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {es.song?.artist || 'Cancioneiro'}
                          {es.song?.original_key && ` • Tom: ${es.song.original_key}`}
                        </div>
                        {(keySettings || notesText) && (
                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[11px] font-semibold">
                            {keySettings && (
                              <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950/60 text-[#2d5016] dark:text-green-300">
                                Neste evento: {summary}
                              </span>
                            )}
                            {notesText && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300" title={notesText}>
                                <StickyNote className="w-3 h-3" /> Nota
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Seleção do Momento Litúrgico */}
                      <div className="w-36 sm:w-48 shrink-0">
                        <select
                          value={es.moment_name || ''}
                          onChange={(e) => updateMoment(index, e.target.value)}
                          className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md text-xs sm:text-sm py-1.5 px-2 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none cursor-pointer"
                        >
                          <option value="">Selecionar momento...</option>
                          {LITURGICAL_MOMENTS.map(moment => (
                            <option key={moment} value={moment}>
                              {moment}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Tom, capo e notas neste evento */}
                      <button
                        type="button"
                        onClick={() => setOpenSettingsFor(settingsOpen ? null : songId)}
                        title="Tom, capo e notas deste cântico neste evento"
                        aria-label="Tom, capo e notas"
                        aria-expanded={settingsOpen}
                        className={`p-1.5 rounded-md transition-colors shrink-0 cursor-pointer ${
                          settingsOpen || keySettings || notesText
                            ? 'text-[#2d5016] dark:text-green-400 bg-green-50 dark:bg-green-950/40'
                            : 'text-gray-400 hover:text-[#2d5016] dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>

                      {/* Botão de Remover */}
                      <button
                        type="button"
                        onClick={() => removeSong(index)}
                        title="Remover do evento"
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {settingsOpen && (
                      <div className="mt-1 ml-2 sm:ml-10 p-3 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {keyOptions.length > 0 && (
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                              Tom (acordes)
                              <select
                                value={shapeOffset}
                                onChange={e => selectShapeKey(index, Number(e.target.value))}
                                className="mt-1 w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md text-sm py-1.5 px-2 text-gray-900 dark:text-gray-100 cursor-pointer"
                              >
                                {keyOptions.map(opt => (
                                  <option key={opt.offset} value={opt.offset}>
                                    {opt.label}{opt.isOriginal ? ' (como está escrito)' : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                            Capo
                            <select
                              value={currentKey.capo}
                              onChange={e => selectCapo(index, Number(e.target.value))}
                              className="mt-1 w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md text-sm py-1.5 px-2 text-gray-900 dark:text-gray-100 cursor-pointer"
                            >
                              {Array.from({ length: 12 }, (_, fret) => (
                                <option key={fret} value={fret}>
                                  {fret === 0 ? 'Sem capo' : `${fret}.ª casa`}{fret === baseCapo ? ' (da música)' : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {originalKey && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Soa em <strong>{getKeyName(originalKey, currentKey.semitones + baseCapo, undefined, 'silabica')}</strong>
                            {' · '}mudar o capo mantém o tom em que se canta.
                            {keySettings && (
                              <button
                                type="button"
                                onClick={() => updateSongFields(index, { transpose_semitones: null, capo: null })}
                                className="ml-2 font-semibold text-[#2d5016] dark:text-green-400 hover:underline cursor-pointer"
                              >
                                Repor o tom original
                              </button>
                            )}
                          </p>
                        )}
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Notas <span className="font-normal text-gray-500 dark:text-gray-400">(aparecem na página do evento, na música e na impressão)</span>
                          <textarea
                            value={es.notes || ''}
                            onChange={e => updateSongFields(index, { notes: e.target.value })}
                            maxLength={EVENT_SONG_NOTES_MAX}
                            rows={2}
                            placeholder="Ex.: As mulheres fazem a 2.ª voz no refrão."
                            className="mt-1 w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md text-sm py-1.5 px-2 text-gray-900 dark:text-gray-100"
                          />
                        </label>
                      </div>
                    )}
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-xl bg-gray-50/50 dark:bg-zinc-900/30">
                  <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-gray-400 mb-3">
                    <ListMusic className="w-6 h-6" />
                  </div>
                  <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
                    Ainda não há músicas neste evento
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mt-1">
                    Clica nos cânticos do catálogo no lado esquerdo para construir o repertório deste evento.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Botões de Ação */}
        <div className="flex justify-end gap-3 pt-2">
          <Link
            to="/admin"
            onClick={guardLink}
            className="px-6 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 font-medium transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center px-6 py-2.5 bg-[#2d5016] text-white rounded-md font-medium hover:bg-[#3a681d] disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'A guardar...' : 'Guardar Evento'}
          </button>
        </div>
      </form>

      {/* Modal Amigável para Confirmar Limpeza */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClearAll}
        title="Limpar repertório?"
        message="Tens a certeza de que queres remover todas as músicas deste evento? Ficarás sem nenhum cântico selecionado."
        confirmText="Sim, limpar tudo"
        cancelText="Cancelar"
        variant="danger"
        icon="trash"
      />

      {/* Modal Amigável para Avisos de Erro */}
      <ConfirmModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, message: '' })}
        title="Atenção"
        message={errorModal.message}
        confirmText="Entendido"
        variant="warning"
        icon="warning"
        hideCancel
      />
    </div>
  );
};
