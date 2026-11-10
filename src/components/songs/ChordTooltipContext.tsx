import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChordDiagram } from './ChordDiagram';
import { InstrumentToggle } from './InstrumentToggle';
import { ChordNotation } from '../../lib/chords';
import { X } from 'lucide-react';

interface ChordTooltipContextType {
  showChord: (chord: string, targetEl: HTMLElement, notation: ChordNotation, isPinned?: boolean) => void;
  hideChord: (force?: boolean) => void;
  activeChord: string | null;
  activeEl: HTMLElement | null;
}

const ChordTooltipContext = createContext<ChordTooltipContextType | null>(null);

export const useChordTooltip = () => useContext(ChordTooltipContext);

interface TooltipPosition {
  top: number;
  left: number;
  arrowLeft: number;
  isBelow: boolean;
}

// Largura suficiente para o diagrama e para o seletor de instrumento (Guit. / Uke / Cavaq.)
const POPOVER_WIDTH = 140;

export const ChordTooltipProvider: React.FC<{
  children: React.ReactNode;
  notation?: ChordNotation;
}> = ({ children, notation = 'silabica' }) => {
  const [activeChord, setActiveChord] = useState<string | null>(null);
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null);
  const [activeNotation, setActiveNotation] = useState<ChordNotation>(notation);
  const [isPinned, setIsPinned] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza notação padrão se mudar externamente
  useEffect(() => {
    setActiveNotation(notation);
  }, [notation]);

  const calculatePosition = useCallback((el: HTMLElement): TooltipPosition => {
    const rect = el.getBoundingClientRect();
    const chordCenterX = rect.left + rect.width / 2;

    // Se estiver muito próximo do topo do viewport, abre para baixo
    const isBelow = rect.top < 190;

    const top = isBelow
      ? rect.bottom + 8
      : rect.top - 8;

    const clampedLeft = Math.max(
      12,
      Math.min(window.innerWidth - POPOVER_WIDTH - 12, chordCenterX - POPOVER_WIDTH / 2)
    );

    // Posição da seta centrada com o acorde, mas mantida dentro do cartão arredondado
    const arrowLeft = Math.max(
      16,
      Math.min(POPOVER_WIDTH - 16, chordCenterX - clampedLeft)
    );

    return { top, left: clampedLeft, arrowLeft, isBelow };
  }, []);

  const close = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setActiveChord(null);
    setActiveEl(null);
    setIsPinned(false);
    setPosition(null);
  }, []);

  const showChord = useCallback((chord: string, targetEl: HTMLElement, currentNotation: ChordNotation, pinned = false) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setActiveChord(chord);
    setActiveEl(targetEl);
    setActiveNotation(currentNotation);
    setIsPinned(pinned);
    setPosition(calculatePosition(targetEl));
  }, [calculatePosition]);

  const hideChord = useCallback((force = false) => {
    if (force || !isPinned) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = setTimeout(() => {
        close();
      }, 150);
    }
  }, [isPinned, close]);

  // Recalcula posição ao rolar ou redimensionar a janela
  useEffect(() => {
    if (!activeEl) return;

    const handleUpdate = () => {
      const rect = activeEl.getBoundingClientRect();
      // Se o elemento saiu totalmente do viewport, fecha
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        close();
        return;
      }
      setPosition(calculatePosition(activeEl));
    };

    window.addEventListener('scroll', handleUpdate, { passive: true });
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [activeEl, calculatePosition, close]);

  // Fecha ao clicar fora ou pressionar ESC
  useEffect(() => {
    if (!activeEl) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current && popoverRef.current.contains(target)) {
        return;
      }
      if (activeEl && activeEl.contains(target)) {
        return;
      }
      close();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        activeEl?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeEl, close]);

  const handlePopoverMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handlePopoverMouseLeave = () => {
    if (!isPinned) {
      hideChord(true);
    }
  };

  return (
    <ChordTooltipContext.Provider
      value={{
        showChord,
        hideChord,
        activeChord,
        activeEl,
      }}
    >
      {children}

      {/* Popover flutuante renderizado via Portal para nunca ser cortado por overflow */}
      {activeChord && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${POPOVER_WIDTH}px`,
            transform: position.isBelow ? 'none' : 'translateY(-100%)',
            zIndex: 9999,
          }}
          className="print:hidden bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/80 rounded-2xl shadow-xl shadow-black/15 dark:shadow-black/50 p-2 flex flex-col items-center select-none"
          role="dialog"
          aria-label={`Diagrama do acorde ${activeChord}`}
        >
          {/* Botão fechar para maior facilidade no telemóvel */}
          <button
            type="button"
            onClick={close}
            className="absolute top-1.5 right-1.5 p-1 text-gray-400 hover:text-gray-600 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
            aria-label="Fechar diagrama"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Seta indicadora a apontar para o acorde */}
          <div
            className={`absolute w-3 h-3 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700/80 ${
              position.isBelow
                ? '-top-1.5 border-t border-l'
                : '-bottom-1.5 border-b border-r'
            }`}
            style={{
              left: `${position.arrowLeft}px`,
              transform: 'translateX(-50%) rotate(45deg)',
            }}
          />

          <ChordDiagram chord={activeChord} notation={activeNotation} compact={true} />

          {/* Seletor de instrumento: todos os diagramas da app mudam em simultâneo */}
          <InstrumentToggle size="sm" className="mt-1.5 w-full" />
        </div>,
        document.body
      )}
    </ChordTooltipContext.Provider>
  );
};
