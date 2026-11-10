import React, { useState, useEffect, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import { ChordNotation, formatChordNotation, parseChord } from '../../lib/chords';
import { getInstrumentChordDefinition, Instrument, INSTRUMENTS } from '../../lib/instrument-chords';
import { playInstrumentChord } from '../../lib/audio-synth';
import { useInstrument } from '../../hooks/useInstrument';

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
  
  let chordLookup = chord
    .replace(/[-–—−]/g, 'm') // Normaliza qualquer tipo de traço para 'm'
    .replace(/♯/g, '#')      // Normaliza sustenidos reais para cardinal
    .replace(/♭/g, 'b')      // Normaliza bemóis reais
    .replace(/\s+/g, '');    // Remove espaços invisíveis

  let chordDef = getInstrumentChordDefinition(chordLookup, instrument);

  if (!chordDef) {
    const parsed = parseChord(chordLookup);
    if (parsed) {
      chordDef = getInstrumentChordDefinition(parsed.root + parsed.suffix, instrument);
    }
  }

  if (!chordDef) {
    return (
      <div className={`flex flex-col items-center justify-center ${compact ? 'p-1' : 'p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm min-w-[80px] h-[100px]'}`}>
        <span className={`${compact ? 'text-xs' : 'text-base'} font-bold text-gray-800 dark:text-gray-200`}>{displayChord || chord}</span>
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

  return (
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
      title={`Ouvir acorde ${displayChord || chord} (${instrumentInfo.label})`}
      data-instrument={instrument}
      className={`group flex flex-col items-center justify-center transition-all cursor-pointer select-none ${
        compact
          ? 'p-1 bg-transparent'
          : `p-3 bg-white dark:bg-zinc-800/80 border rounded-lg shadow-sm hover:border-amber-400 dark:hover:border-amber-500/70 ${
              isPlaying
                ? 'border-amber-500 ring-2 ring-amber-400/50 scale-[0.98]'
                : 'border-gray-200 dark:border-zinc-700/80'
            }`
      }`}
    >
      <div className={`flex items-center gap-1 ${compact ? 'mb-1' : 'mb-2'}`}>
        <span className={`${compact ? 'text-sm' : 'text-base'} font-bold text-gray-800 dark:text-gray-200`}>{displayChord || chord}</span>
        <Volume2
          className={`w-3 h-3 transition-opacity ${
            isPlaying
              ? 'text-amber-500 opacity-100 animate-pulse'
              : 'text-gray-400 dark:text-zinc-500 opacity-60 group-hover:opacity-100'
          }`}
        />
      </div>
      <svg aria-label={`Diagrama de ${instrumentInfo.label}`} data-strings={numStrings} width={width + 24} height={height + topMargin + 4} viewBox={`-14 -4 ${width + 24} ${height + topMargin + 8}`}>
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
  );
};
