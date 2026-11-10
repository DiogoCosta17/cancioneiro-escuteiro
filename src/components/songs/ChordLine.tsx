import React from 'react';
import { ChordToken } from '../../lib/types';
import { ChordNotation } from '../../lib/chords';
import { useChordTooltip } from './ChordTooltipContext';

interface ChordLineProps {
  tokens: ChordToken[];
  showChords?: boolean;
  notation?: ChordNotation;
  interactive?: boolean;
}

export const ChordLine: React.FC<ChordLineProps> = ({
  tokens,
  showChords = true,
  notation = 'silabica',
  interactive = false,
}) => {
  const tooltip = useChordTooltip();
  const hasAnyChord = showChords && tokens.some(token => !!token.chord);
  const hasLyrics = tokens.some(token => !!token.text && token.text.trim().length > 0);

  // Se os acordes estiverem ocultos, renderiza apenas o texto corrido da letra
  if (!showChords) {
    const textContent = tokens.map(t => t.text).join('');
    // Se a linha só tinha acordes e não tem texto (ex: introdução instrumental), omite a linha
    if (!textContent.trim()) {
      return null;
    }
    return (
      <div className="chordline-lyrics leading-relaxed text-gray-800 dark:text-gray-200 print:text-black whitespace-pre-wrap">
        {textContent}
      </div>
    );
  }

  const handleChordClick = (chord: string, e: React.MouseEvent<HTMLSpanElement>) => {
    if (!interactive || !tooltip) return;
    e.stopPropagation();
    const el = e.currentTarget;
    if (tooltip.activeEl === el) {
      tooltip.hideChord(true);
    } else {
      tooltip.showChord(chord, el, notation, true);
    }
  };

  const handleChordMouseEnter = (chord: string, e: React.MouseEvent<HTMLSpanElement>) => {
    if (!interactive || !tooltip) return;
    tooltip.showChord(chord, e.currentTarget, notation, false);
  };

  const handleChordMouseLeave = () => {
    if (!interactive || !tooltip) return;
    tooltip.hideChord(false);
  };

  const handleChordKeyDown = (chord: string, e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (!interactive || !tooltip) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const el = e.currentTarget;
      if (tooltip.activeEl === el) {
        tooltip.hideChord(true);
      } else {
        tooltip.showChord(chord, el, notation, true);
      }
    }
  };

  return (
    <div className="flex flex-wrap items-end my-0.5">
      {tokens.map((token, index) => {
        // Apenas aplica largura mínima expandida se a linha for puramente instrumental (sem letra)
        const isInstrumentalChord = !hasLyrics && token.chord;

        return (
          <span
            key={index}
            className={`inline-flex flex-col items-start relative min-w-0 ${
              isInstrumentalChord ? 'min-w-[2em] mr-2' : ''
            }`}
          >
            {token.chord && (
              interactive && tooltip ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleChordClick(token.chord!, e)}
                  onMouseEnter={(e) => handleChordMouseEnter(token.chord!, e)}
                  onMouseLeave={handleChordMouseLeave}
                  onKeyDown={(e) => handleChordKeyDown(token.chord!, e)}
                  aria-label={`Ver como se toca o acorde ${token.chord}`}
                  className="chord-text self-start w-fit inline-block text-[#0073a8] dark:text-sky-400 hover:text-amber-600 dark:hover:text-amber-300 active:text-amber-700 dark:active:text-amber-200 hover:underline underline-offset-2 font-bold text-[0.82em] leading-[1.2] min-h-[1.2em] whitespace-pre select-none pr-1 print:text-blue-800 print:no-underline print:cursor-default cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 rounded-xs transition-colors"
                >
                  {token.chord}
                </span>
              ) : (
                <span className="chord-text self-start w-fit inline-block text-[#0073a8] dark:text-sky-400 font-bold text-[0.82em] leading-[1.2] min-h-[1.2em] whitespace-pre select-none pr-1 print:text-blue-800">
                  {token.chord}
                </span>
              )
            )}
            {/* Só reserva espaço de acorde se houver algum acorde na linha */}
            {!token.chord && hasAnyChord && (
              <span
                className="self-start text-[0.82em] leading-[1.2] min-h-[1.2em] invisible select-none pr-1"
                aria-hidden="true"
              >
                &nbsp;
              </span>
            )}
            <span className="lyrics-text text-[1em] leading-normal text-gray-800 dark:text-gray-200 print:text-black whitespace-pre">
              {token.text ? (
                token.text
              ) : (
                <span className="invisible select-none" aria-hidden="true">
                  &nbsp;
                </span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
};
