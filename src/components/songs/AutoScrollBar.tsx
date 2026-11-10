import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Flame } from 'lucide-react';
import { useWakeLock } from '../../hooks/useWakeLock';

export type ScrollSpeed = 1 | 2 | 3 | 4 | 5;

const SPEED_PX_PER_TICK: Record<ScrollSpeed, number> = {
  1: 0.6,
  2: 1.1,
  3: 1.8,
  4: 2.6,
  5: 3.6,
};

interface AutoScrollBarProps {
  /** O ecrã já está a ser mantido ligado por outro motivo (ex: Modo Palco) */
  keepAwakeExternally?: boolean;
}

export const AutoScrollBar: React.FC<AutoScrollBarProps> = ({ keepAwakeExternally = false }) => {
  const [isScrolling, setIsScrolling] = useState(false);
  const [speed, setSpeed] = useState<ScrollSpeed>(2);
  const [keepAwakeManual, setKeepAwakeManual] = useState(false);

  const subPixelAccumulator = useRef<number>(0);

  const shouldHoldWakeLock = isScrolling || keepAwakeManual;
  // Gestor partilhado: trata pedidos pendentes, libertação e novo pedido ao voltar ao separador
  useWakeLock(shouldHoldWakeLock);
  const screenKeptAwake = shouldHoldWakeLock || keepAwakeExternally;

  useEffect(() => {
    if (!isScrolling) {
      subPixelAccumulator.current = 0;
      return;
    }

    const interval = setInterval(() => {
      const increment = SPEED_PX_PER_TICK[speed];
      subPixelAccumulator.current += increment;

      if (subPixelAccumulator.current >= 1) {
        const pixelsToScroll = Math.floor(subPixelAccumulator.current);
        subPixelAccumulator.current -= pixelsToScroll;

        const maxScroll =
          document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll > 0 && window.scrollY >= maxScroll - 2) {
          setIsScrolling(false);
          return;
        }

        window.scrollBy({ top: pixelsToScroll, left: 0, behavior: 'instant' });
      }
    }, 30);

    return () => clearInterval(interval);
  }, [isScrolling, speed]);

  const cycleSpeed = () => {
    setSpeed((prev) => ((prev % 5) + 1) as ScrollSpeed);
  };

  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-40 print:hidden flex justify-center sm:justify-end pointer-events-none"
      aria-label="Controlos de palco e auto-scroll"
    >
      <div className="pointer-events-auto inline-flex items-center gap-1.5 bg-zinc-900/95 dark:bg-zinc-800/95 text-white px-3 py-2 rounded-full shadow-xl border border-zinc-700/80 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setIsScrolling((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            isScrolling
              ? 'bg-amber-500 text-zinc-950 shadow-sm hover:bg-amber-400'
              : 'bg-zinc-800 dark:bg-zinc-700 text-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-600'
          }`}
          title={isScrolling ? 'Pausar deslocamento automático' : 'Iniciar deslocamento automático (Auto-Scroll)'}
          aria-pressed={isScrolling}
        >
          {isScrolling ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pausar</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Auto-Scroll</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={cycleSpeed}
          className="px-2.5 py-1.5 rounded-full text-xs font-mono font-bold bg-zinc-800 dark:bg-zinc-700/80 text-amber-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          title="Alterar velocidade do Auto-Scroll"
          aria-label={`Velocidade do Auto-Scroll ${speed}x`}
        >
          {speed}x
        </button>

        <div className="w-px h-4 bg-zinc-700 mx-0.5" />

        <button
          type="button"
          onClick={() => setKeepAwakeManual((prev) => !prev)}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            screenKeptAwake
              ? 'bg-emerald-600/90 text-white shadow-xs'
              : 'bg-zinc-800 dark:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200'
          }`}
          title={
            keepAwakeExternally && !shouldHoldWakeLock
              ? 'Ecrã mantido ligado automaticamente no Modo Palco'
              : 'Manter ecrã sempre ligado enquanto tocas (Modo Fogo de Conselho)'
          }
          aria-pressed={keepAwakeManual}
        >
          <Flame className="w-3.5 h-3.5" />
          <span className="hidden xs:inline sm:inline">Ecrã Ligado</span>
        </button>
      </div>
    </div>
  );
};
