import React, { useState } from 'react';
import { CalendarCheck, Save, StickyNote, Undo2, LoaderCircle } from 'lucide-react';
import type { Song } from '../../lib/types';
import { getKeyName } from '../../lib/chords';
import {
  autoPreferFlats,
  shapeSemitones,
  songBaseCapo,
  type EventKeySettings,
} from '../../lib/event-song-settings';

export interface EventSongContext {
  eventTitle: string;
  /** Tom/capo guardados no evento (null = tom da música) */
  keySettings: EventKeySettings | null;
  notes: string | null;
  /** Versículo do Aleluia do evento (só no primeiro cântico do momento Aleluia) */
  gospelAcclamation?: string | null;
  /** Só dirigentes: grava o tom/capo atual no evento. Devolve uma mensagem de erro ou null. */
  onSaveKey?: (settings: EventKeySettings | null) => Promise<string | null>;
}

interface EventSongPanelProps {
  song: Song;
  context: EventSongContext;
  /** Estado atual dos controlos de tom */
  current: EventKeySettings;
  notation: 'silabica' | 'alfabetica';
  onApply: (settings: EventKeySettings) => void;
}

function keyText(song: Song, settings: EventKeySettings, notation: 'silabica' | 'alfabetica'): string {
  const shift = shapeSemitones(settings, song);
  const key = song.original_key ? getKeyName(song.original_key, shift, autoPreferFlats(song.original_key, shift), notation) : '';
  const capo = settings.capo > 0 ? `capo na ${settings.capo}.ª casa` : 'sem capo';
  return key ? `${key} · ${capo}` : capo;
}

/** Caixa do Modo Celebração: tom definido para o evento, notas e (para dirigentes) guardar o tom. */
export const EventSongPanel: React.FC<EventSongPanelProps> = ({ song, context, current, notation, onApply }) => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const base: EventKeySettings = { semitones: 0, capo: songBaseCapo(song) };
  const target = context.keySettings ?? base;
  const differs = current.semitones !== target.semitones || current.capo !== target.capo;
  const isOriginal = current.semitones === 0 && current.capo === base.capo;
  const canEdit = Boolean(context.onSaveKey);

  if (!context.keySettings && !context.notes && !canEdit) return null;

  const save = async (settings: EventKeySettings | null) => {
    if (!context.onSaveKey) return;
    setSaving(true);
    setMessage(null);
    const error = await context.onSaveKey(settings);
    setSaving(false);
    setMessage(error ? { kind: 'error', text: error } : { kind: 'ok', text: 'Guardado no evento.' });
  };

  return (
    <div className="mb-6 print:hidden rounded-2xl border border-green-200 dark:border-green-900/50 bg-green-50/70 dark:bg-green-950/20 p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarCheck className="w-4 h-4 text-green-700 dark:text-green-400 shrink-0" />
        <span className="text-gray-800 dark:text-zinc-200">
          {context.keySettings ? (
            <>
              Tom para <strong>{context.eventTitle}</strong>: <strong>{keyText(song, context.keySettings, notation)}</strong>
            </>
          ) : (
            <>
              <strong>{context.eventTitle}</strong>: tom original da música
            </>
          )}
        </span>
        {differs && context.keySettings && (
          <button
            type="button"
            onClick={() => onApply(context.keySettings!)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 dark:text-green-300 hover:underline cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Voltar ao tom do evento
          </button>
        )}
      </div>

      {context.notes && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-amber-950 dark:text-amber-100">
          <StickyNote className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="whitespace-pre-line">{context.notes}</p>
        </div>
      )}

      {canEdit && (differs || message) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {differs && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(isOriginal ? null : current)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2d5016] text-white text-xs font-semibold hover:bg-[#3a681d] disabled:opacity-60 cursor-pointer"
              title="Só para dirigentes: fica guardado neste evento para todos"
            >
              {saving ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {isOriginal ? 'Usar o tom original neste evento' : `Guardar ${keyText(song, current, notation)} neste evento`}
            </button>
          )}
          {message && (
            <span
              role={message.kind === 'error' ? 'alert' : 'status'}
              className={message.kind === 'error' ? 'text-xs text-red-700 dark:text-red-400' : 'text-xs text-green-800 dark:text-green-300'}
            >
              {message.text}
            </span>
          )}
        </div>
      )}
      {canEdit && !differs && !context.keySettings && (
        <p className="text-xs text-gray-600 dark:text-zinc-400">
          Muda o tom ou o capo em baixo para o guardar neste evento. As notas editam-se em <em>Editar Evento</em>.
        </p>
      )}
    </div>
  );
};
