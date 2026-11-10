import React from 'react';
import { useInstrument } from '../../hooks/useInstrument';
import { INSTRUMENTS, INSTRUMENT_IDS } from '../../lib/instrument-chords';

interface InstrumentToggleProps {
  className?: string;
  /** 'sm' usa rótulos abreviados (Guit. / Uke / Cavaq.), ideal para popovers estreitos */
  size?: 'sm' | 'md';
}

/**
 * Controlo segmentado para escolher o instrumento dos diagramas de acordes.
 * A escolha é partilhada por toda a aplicação através de `useInstrument`.
 */
export const InstrumentToggle: React.FC<InstrumentToggleProps> = ({ className = '', size = 'md' }) => {
  const { instrument, setInstrument } = useInstrument();
  const isSmall = size === 'sm';

  return (
    <div
      role="group"
      aria-label="Instrumento dos diagramas"
      className={`inline-flex items-center rounded-lg bg-gray-100 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-700/80 p-0.5 select-none ${className}`}
    >
      {INSTRUMENT_IDS.map((id) => {
        const info = INSTRUMENTS[id];
        const isActive = instrument === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setInstrument(id)}
            aria-pressed={isActive}
            aria-label={info.label}
            title={info.label}
            className={`${
              isSmall ? 'px-1 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
            } flex-1 rounded-md font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              isActive
                ? 'bg-amber-400/90 text-zinc-950 shadow-sm'
                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200'
            }`}
          >
            {isSmall ? info.shortLabel : info.label}
          </button>
        );
      })}
    </div>
  );
};
