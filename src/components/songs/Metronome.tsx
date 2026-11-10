import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Timer, Play, Square, Minus, Plus, Hand, X } from 'lucide-react';
import {
  MetronomeEngine,
  MIN_BPM,
  MAX_BPM,
  BEATS_PER_BAR,
  DEFAULT_BPM,
  clampBpm,
  computeTapTempo,
  pushTap,
} from '../../lib/metronome';

interface MetronomeProps {
  /** BPM inicial (ex: da diretiva ChordPro {tempo: N}) */
  initialBpm?: number | null;
}

export const Metronome: React.FC<MetronomeProps> = ({ initialBpm }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [bpm, setBpm] = useState<number>(() => clampBpm(initialBpm ?? DEFAULT_BPM));
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const engineRef = useRef<MetronomeEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new MetronomeEngine({ onBeat: (beat) => setActiveBeat(beat) });
    }
    return engineRef.current;
  }, []);

  // Para sempre o metrónomo ao sair da música (desmontar / navegar)
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setBpm(bpm);
  }, [bpm]);

  // Fechar o painel com ESC ou clique fora (o metrónomo continua a tocar)
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handlePointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('pointerdown', handlePointer);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('pointerdown', handlePointer);
    };
  }, [isOpen]);

  const toggleRunning = () => {
    const engine = getEngine();
    if (engine.isRunning) {
      engine.stop();
      setIsRunning(false);
      setActiveBeat(null);
    } else if (engine.start(bpm)) {
      setIsRunning(true);
    }
  };

  const changeBpm = (value: number) => setBpm(clampBpm(value));

  const handleTap = () => {
    const next = pushTap(tapTimes, performance.now());
    setTapTimes(next);
    const tapped = computeTapTempo(next);
    if (tapped) setBpm(tapped);
  };

  const smallBtn =
    'h-9 w-9 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 hover:bg-gray-200 dark:hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all border text-sm shadow-sm cursor-pointer ${
          isRunning
            ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-700'
            : 'bg-white dark:bg-zinc-800/80 text-gray-700 dark:text-zinc-200 border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700'
        }`}
        title="Abrir metrónomo"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Timer className={`w-4 h-4 text-sky-600 dark:text-sky-400 ${isRunning ? 'animate-pulse' : ''}`} />
        <span>Metrónomo</span>
        {isRunning && <span className="font-mono text-xs">{bpm}</span>}
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full mt-2 z-30 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-xl p-4 space-y-4"
          role="group"
          aria-label="Metrónomo"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-sky-700 dark:text-sky-400">Metrónomo</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              title="Fechar metrónomo"
              aria-label="Fechar metrónomo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Indicador visual dos tempos (o 1.º tempo é acentuado) */}
          <div className="flex items-center justify-center gap-3" aria-hidden="true" data-testid="metronome-beats">
            {Array.from({ length: BEATS_PER_BAR }, (_, i) => {
              const isActive = isRunning && activeBeat === i;
              return (
                <span
                  key={i}
                  className={`rounded-full transition-all duration-75 ${i === 0 ? 'w-5 h-5' : 'w-4 h-4'} ${
                    isActive
                      ? i === 0
                        ? 'bg-amber-500 scale-125 shadow-md'
                        : 'bg-sky-500 scale-110'
                      : 'bg-gray-200 dark:bg-zinc-700'
                  }`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => changeBpm(bpm - 1)} className={smallBtn} title="Diminuir BPM" aria-label="Diminuir BPM">
              <Minus className="w-4 h-4" />
            </button>
            <div className="text-center">
              <div className="text-3xl font-black font-mono text-gray-900 dark:text-gray-100 leading-none" aria-live="polite">
                {bpm}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mt-1">BPM</div>
            </div>
            <button type="button" onClick={() => changeBpm(bpm + 1)} className={smallBtn} title="Aumentar BPM" aria-label="Aumentar BPM">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) => changeBpm(parseInt(e.target.value, 10))}
            className="w-full accent-sky-600 cursor-pointer"
            aria-label="Andamento em BPM"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleRunning}
              className={`flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-lg font-bold text-sm transition-all active:scale-95 cursor-pointer ${
                isRunning
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-[#2d5016] hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600 text-white'
              }`}
              aria-pressed={isRunning}
            >
              {isRunning ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>Parar</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Iniciar</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleTap}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg font-bold text-sm bg-amber-400/90 hover:bg-amber-400 text-zinc-950 active:scale-95 transition-all cursor-pointer"
              title="Toca ao ritmo da música para definir o andamento"
            >
              <Hand className="w-4 h-4" />
              <span>Tap</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
