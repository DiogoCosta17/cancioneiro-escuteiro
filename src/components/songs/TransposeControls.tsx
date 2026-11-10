import React, { useMemo } from 'react';
import { Music, BookmarkCheck } from 'lucide-react';
import { ChordNotation, getKeyName } from '../../lib/chords';
import { CapoSuggestion } from '../../lib/capo-advisor';
import { getKeyOptions, mod12 } from '../../lib/key-picker';

interface TransposeControlsProps {
  semitones: number;
  hasCustomState?: boolean;
  notation: ChordNotation;
  preferFlats: boolean;
  currentKey?: string;
  soundingKey?: string;
  capo?: number | null;
  onSelectCapo?: (capoFret: number) => void;
  capoSuggestion?: CapoSuggestion | null;
  onOpenTuner?: () => void;
  onTransposeUp: () => void;
  onTransposeDown: () => void;
  onReset: () => void;
  onToggleFlats: () => void;
  onSelectNotation: (notation: ChordNotation) => void;
  /** Tom original da música (ativa a lista de tons) */
  originalKey?: string;
  /** Deslocamento (meios-tons) do tom apresentado face ao original, já com o capo descontado */
  keyOffset?: number;
  /** Saltar diretamente para um tom (nome alfabético, ex: "Bb", "F#m") */
  onSelectKey?: (targetKey: string) => void;
  /** Há tom/capo guardados neste dispositivo para esta música */
  hasSavedPrefs?: boolean;
}

export const TransposeControls: React.FC<TransposeControlsProps> = ({
  semitones,
  hasCustomState,
  notation,
  preferFlats,
  currentKey,
  soundingKey,
  capo,
  onSelectCapo,
  capoSuggestion,
  onOpenTuner,
  onTransposeUp,
  onTransposeDown,
  onReset,
  onToggleFlats,
  onSelectNotation,
  originalKey,
  keyOffset,
  onSelectKey,
  hasSavedPrefs,
}) => {
  const activeCapo = capo && capo > 0 ? capo : 0;
  const canReset = hasCustomState !== undefined ? hasCustomState : semitones !== 0 || activeCapo > 0;
  const displayNotation = notation === 'silabica' ? 'silabica' : 'alfabetica';

  const keyOptions = useMemo(
    () => (originalKey && onSelectKey ? getKeyOptions(originalKey, displayNotation) : []),
    [originalKey, onSelectKey, displayNotation]
  );
  const activeKeyOffset = mod12(keyOffset ?? semitones);

  return (
    <div className="bg-[#4d7285] dark:bg-zinc-800/95 dark:border dark:border-zinc-700/80 p-3 sm:p-4 rounded-xl shadow-md text-white select-none">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        {/* Bloco TOM */}
        <div>
          <div className="text-[11px] font-bold tracking-wider text-slate-200/90 dark:text-zinc-300 uppercase mb-1.5 flex items-center flex-wrap gap-1">
            <div className="flex items-center">
              <span>TOM</span>
              {currentKey ? (
                <>
                  <span className="text-slate-300/80 dark:text-zinc-400 mx-0.5">:</span>
                  <span className="text-amber-300 dark:text-amber-400 font-bold text-xs tracking-normal normal-case">
                    {currentKey}
                  </span>
                </>
              ) : (
                semitones !== 0 && (
                  <span className="text-amber-300 dark:text-amber-400 font-mono text-xs ml-1">
                    ({semitones > 0 ? `+${semitones}` : semitones})
                  </span>
                )
              )}
            </div>
            {hasSavedPrefs && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold tracking-normal normal-case text-emerald-200 dark:text-emerald-400"
                title="Tom e capo guardados neste dispositivo para esta música. Usa «Repor» para voltar ao original."
              >
                <BookmarkCheck className="w-3 h-3" />
                Guardado
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onTransposeDown}
              className="min-w-[42px] h-9 px-2.5 bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-zinc-600 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              title="Baixar meio tom (-1/2)"
            >
              - ½
            </button>

            <button
              onClick={onTransposeUp}
              className="min-w-[42px] h-9 px-2.5 bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-zinc-600 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              title="Subir meio tom (+1/2)"
            >
              + ½
            </button>

            {keyOptions.length > 0 && onSelectKey && (
              <select
                aria-label="Escolher tom"
                value={keyOptions[activeKeyOffset]?.key ?? ''}
                onChange={(e) => onSelectKey(e.target.value)}
                className={`h-9 px-2 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer outline-none ${
                  activeKeyOffset !== 0
                    ? 'bg-amber-100 dark:bg-amber-950/90 text-amber-950 dark:text-amber-200 ring-2 ring-amber-400/80'
                    : 'bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-600'
                }`}
                title="Saltar diretamente para um tom"
              >
                {keyOptions.map((option) => (
                  <option
                    key={option.offset}
                    value={option.key}
                    className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100"
                  >
                    {option.label}{option.isOriginal ? ' (original)' : ''}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={onReset}
              disabled={!canReset}
              className={`h-9 px-3 text-sm font-medium rounded-lg shadow-sm transition-all flex items-center justify-center cursor-pointer ${
                !canReset
                  ? 'bg-white/60 dark:bg-zinc-700/30 text-gray-400 dark:text-zinc-500 cursor-default'
                  : 'bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-600 active:scale-95'
              }`}
              title="Repor tom original"
              aria-label="Repor tom e capo originais"
            >
              Repor
            </button>

            <button
              onClick={onToggleFlats}
              className={`h-9 px-3 text-sm font-serif rounded-lg shadow-sm transition-all flex items-center justify-center cursor-pointer ${
                preferFlats
                  ? 'bg-[#0073a8] dark:bg-sky-600 text-white font-bold ring-2 ring-white/50 dark:ring-sky-300/60'
                  : 'bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-600'
              }`}
              title={preferFlats ? 'A usar bemóis (♭). Clica para sustenidos (#)' : 'Clica para usar bemóis (♭)'}
            >
              ♭
            </button>

            {onOpenTuner && (
              <button
                type="button"
                onClick={onOpenTuner}
                className="h-9 px-3 bg-amber-400/90 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Abrir Diapasão / Afinador Escuteiro (440 Hz)"
              >
                <Music className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Diapasão</span>
              </button>
            )}
          </div>
        </div>

        {/* Bloco CAPO (Interativo para todos os utilizadores) */}
        {onSelectCapo && (
          <div>
            <div className="text-[11px] font-bold tracking-wider text-slate-200/90 dark:text-zinc-300 uppercase mb-1.5 flex items-center gap-1">
              <span>CAPO</span>
              {activeCapo > 0 && (
                <span className="text-amber-300 dark:text-amber-400 font-bold text-xs normal-case">
                  : {activeCapo}ª
                </span>
              )}
            </div>
            <select
              aria-label="Selecionar casa da braçadeira (Capo)"
              value={activeCapo}
              onChange={(e) => onSelectCapo(parseInt(e.target.value, 10) || 0)}
              className={`h-9 px-2.5 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer outline-none ${
                activeCapo > 0
                  ? 'bg-amber-100 dark:bg-amber-950/90 text-amber-950 dark:text-amber-200 ring-2 ring-amber-400/80'
                  : 'bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-600'
              }`}
              title="Escolhe a casa do Capo (os acordes ajustam-se automaticamente)"
            >
              <option value={0} className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100">
                Sem Capo {soundingKey ? `(${getKeyName(soundingKey, 0, preferFlats, displayNotation)})` : ''}
              </option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((fret) => {
                const isSuggested = capoSuggestion?.capoFret === fret;
                const shapeKey = soundingKey
                  ? getKeyName(soundingKey, -fret, preferFlats, displayNotation)
                  : '';
                return (
                  <option
                    key={fret}
                    value={fret}
                    className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100"
                  >
                    {fret}ª Casa{shapeKey ? ` (${shapeKey})` : ''}{isSuggested ? ' ★ Sugerido' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Bloco ACORDES */}
        <div>
          <div className="text-[11px] font-bold tracking-wider text-slate-200/90 dark:text-zinc-300 uppercase mb-1.5">
            ACORDES
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onSelectNotation('silabica')}
              className={`h-9 px-3.5 text-sm font-medium rounded-lg shadow-sm transition-all cursor-pointer ${
                notation === 'silabica'
                  ? 'bg-[#0073a8] dark:bg-sky-600 text-white font-semibold shadow-md'
                  : 'bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-600'
              }`}
            >
              Silábica
            </button>

            <button
              onClick={() => onSelectNotation('alfabetica')}
              className={`h-9 px-3.5 text-sm font-medium rounded-lg shadow-sm transition-all cursor-pointer ${
                notation === 'alfabetica'
                  ? 'bg-[#0073a8] dark:bg-sky-600 text-white font-semibold shadow-md'
                  : 'bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-600'
              }`}
            >
              Alfabética
            </button>

            <button
              onClick={() => onSelectNotation('ocultar')}
              className={`h-9 px-3.5 text-sm font-medium rounded-lg shadow-sm transition-all cursor-pointer ${
                notation === 'ocultar'
                  ? 'bg-[#0073a8] dark:bg-sky-600 text-white font-semibold shadow-md'
                  : 'bg-white dark:bg-zinc-700/80 text-gray-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-600'
              }`}
            >
              Ocultar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
