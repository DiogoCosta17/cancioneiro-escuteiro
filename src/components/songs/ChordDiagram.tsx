import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Volume2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ChordNotation, formatChordNotation } from '../../lib/chords';
import { Instrument, INSTRUMENTS } from '../../lib/instrument-chords';
import { chordVoicingKey, getChordVoicings, voicingSignature } from '../../lib/chord-voicings';
import { playInstrumentChord } from '../../lib/audio-synth';
import { useInstrument } from '../../hooks/useInstrument';
import { useChordVoicingChoice } from '../../hooks/useChordVoicing';

interface ChordDiagramProps {
  chord: string;
  notation: ChordNotation;
  compact?: boolean;
  /** Força um instrumento; por omissão usa a preferência global (useInstrument) */
  instrument?: Instrument;
}

export const ChordDiagram: React.FC<ChordDiagramProps> = ({ chord, notation, compact = false, instrument: instrumentProp }) => {
  const { instrument: preferredInstrument } = useInstrument();
  const instrument = instrumentProp ?? preferredInstrument;
  const instrumentInfo = INSTRUMENTS[instrument];
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const displayChord = notation === 'ocultar' ? '' : formatChordNotation(chord, notation as 'silabica' | 'alfabetica');
  const chordName = displayChord || chord;

  const chordLookup = chord
    .replace(/[-–—−]/g, 'm') // Normaliza qualquer tipo de traço para 'm'
    .replace(/♯/g, '#')      // Normaliza sustenidos reais para cardinal
    .replace(/♭/g, 'b')      // Normaliza bemóis reais
    .replace(/\s+/g, '');    // Remove espaços invisíveis

  // Várias maneiras de tocar o acorde: a 1.ª é a habitual; a escolha fica guardada por acorde e instrumento
  const voicings = useMemo(() => getChordVoicings(chordLookup, instrument), [chordLookup, instrument]);
  const voicingKey = useMemo(() => chordVoicingKey(chordLookup), [chordLookup]);
  const { signature, setSignature } = useChordVoicingChoice(instrument, voicingKey);
  const selectedIndex = Math.max(0, voicings.findIndex((v) => voicingSignature(v.frets) === signature));
  const chordDef = voicings[selectedIndex];

  if (!chordDef) {
    return (
      <div className={`flex flex-col items-center justify-center ${compact ? 'p-1' : 'p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm min-w-[80px] h-[100px]'}`}>
        <span className={`${compact ? 'text-xs' : 'text-base'} font-bold text-gray-800 dark:text-gray-200`}>{chordName}</span>
        <span className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1 text-center">Diagrama indisponível</span>
      </div>
    );
  }

  const { frets, fingers, baseFret = 1, barre } = chordDef;

  const numStrings = frets.length;
  const numFrets = 4;
  const stringSpacing = 12;
  const width = stringSpacing * (numStrings - 1);
  const height = 70;
  const fretSpacing = height / numFrets;
  const topMargin = 20;

  const handlePlay = () => {
    playInstrumentChord(frets, instrumentInfo.tuningMidi);
    setIsPlaying(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsPlaying(false), 650);
  };

  const goToVoicing = (delta: number) => {
    const next = (selectedIndex + delta + voicings.length) % voicings.length;
    // Voltar à 1.ª posição apaga a escolha (fica a habitual, mesmo que a lista mude no futuro)
    setSignature(next === 0 ? null : voicingSignature(voicings[next].frets));
  };

  const navButtonClass =
    'p-0.5 rounded-full text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:text-zinc-400 dark:hover:text-amber-300 dark:hover:bg-zinc-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors cursor-pointer';

  return (
    <div
      data-instrument={instrument}
      className={`flex flex-col items-center select-none ${
        compact
          ? 'p-1 bg-transparent'
          : `p-3 bg-white dark:bg-zinc-800/80 border rounded-lg shadow-sm transition-all hover:border-amber-400 dark:hover:border-amber-500/70 ${
              isPlaying
                ? 'border-amber-500 ring-2 ring-amber-400/50 scale-[0.98]'
                : 'border-gray-200 dark:border-zinc-700/80'
            }`
      }`}
    >
      <div
        onClick={handlePlay}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handlePlay();
          }
        }}
        title={`Ouvir acorde ${chordName} (${instrumentInfo.label})`}
        className="group flex flex-col items-center cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <div className={`flex items-center gap-1 ${compact ? 'mb-1' : 'mb-2'}`}>
          <span className={`${compact ? 'text-sm' : 'text-base'} font-bold text-gray-800 dark:text-gray-200`}>{chordName}</span>
          <Volume2
            className={`w-3 h-3 transition-opacity ${
              isPlaying
                ? 'text-amber-500 opacity-100 animate-pulse'
                : 'text-gray-400 dark:text-zinc-500 opacity-60 group-hover:opacity-100'
            }`}
          />
        </div>
        <svg aria-label={`Diagrama de ${instrumentInfo.label}`} data-strings={numStrings} data-frets={frets.join(',')} width={width + 24} height={height + topMargin + 4} viewBox={`-14 -4 ${width + 24} ${height + topMargin + 8}`}>
          {baseFret === 1 ? (
            <line x1={0} y1={topMargin} x2={width} y2={topMargin} stroke="currentColor" className="text-gray-800 dark:text-zinc-200" strokeWidth={4} />
          ) : (
            <text x={-14} y={topMargin + 12} fontSize="11" fontFamily="sans-serif" className="fill-gray-500 dark:fill-zinc-400" fontWeight="bold">
              {baseFret}
            </text>
          )}

          {Array.from({ length: numFrets + 1 }).map((_, i) => (
            <line
              key={`fret-${i}`}
              x1={0}
              y1={topMargin + i * fretSpacing}
              x2={width}
              y2={topMargin + i * fretSpacing}
              stroke={i === 0 && baseFret === 1 ? 'transparent' : 'currentColor'}
              className="text-gray-400 dark:text-zinc-600"
              strokeWidth={1}
            />
          ))}

          {Array.from({ length: numStrings }).map((_, i) => (
            <line
              key={`string-${i}`}
              x1={i * stringSpacing}
              y1={topMargin}
              x2={i * stringSpacing}
              y2={topMargin + height}
              stroke="currentColor"
              className="text-gray-300 dark:text-zinc-500"
              strokeWidth={1.5}
            />
          ))}

          {barre && (
            <rect
              x={barre.fromString * stringSpacing}
              y={topMargin + (barre.fret - baseFret) * fretSpacing + fretSpacing / 4}
              width={(barre.toString - barre.fromString) * stringSpacing}
              height={fretSpacing / 2}
              rx={fretSpacing / 4}
              fill="currentColor"
              className="text-gray-800 dark:text-sky-400"
            />
          )}

          {frets.map((fret, stringIndex) => {
            if (fret === -1) {
              return (
                <text key={`mute-${stringIndex}`} x={stringIndex * stringSpacing} y={12} fontSize="12" fontFamily="sans-serif" textAnchor="middle" fill="currentColor" className="text-gray-500 dark:text-zinc-400">
                  x
                </text>
              );
            } else if (fret === 0) {
              return (
                <circle key={`open-${stringIndex}`} cx={stringIndex * stringSpacing} cy={8} r={3} stroke="currentColor" className="text-gray-500 dark:text-zinc-400" strokeWidth={1.5} fill="none" />
              );
            } else {
              const cy = topMargin + (fret - baseFret) * fretSpacing + fretSpacing / 2;
              const cx = stringIndex * stringSpacing;
              return (
                <g key={`finger-${stringIndex}`}>
                  <circle cx={cx} cy={cy} r={5.5} fill="currentColor" className="text-gray-800 dark:text-sky-400" />
                  {fingers && fingers[stringIndex] > 0 && (
                    <text x={cx} y={cy + 3} fontSize="8" className="fill-white dark:fill-zinc-950" fontFamily="sans-serif" textAnchor="middle" fontWeight="bold">
                      {fingers[stringIndex]}
                    </text>
                  )}
                </g>
              );
            }
          })}
        </svg>
      </div>

      {voicings.length > 1 && (
        <div className="flex items-center justify-center gap-1 mt-1">
          <button type="button" onClick={() => goToVoicing(-1)} aria-label={`Posição anterior de ${chordName}`} title="Posição anterior" className={navButtonClass}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span
            className={`text-[10px] font-semibold tabular-nums min-w-[2.25rem] text-center ${
              selectedIndex > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-gray-500 dark:text-zinc-400'
            }`}
            aria-live="polite"
            aria-label={`Posição ${selectedIndex + 1} de ${voicings.length}`}
          >
            {selectedIndex + 1}/{voicings.length}
          </span>
          <button type="button" onClick={() => goToVoicing(1)} aria-label={`Posição seguinte de ${chordName}`} title="Posição seguinte" className={navButtonClass}>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
