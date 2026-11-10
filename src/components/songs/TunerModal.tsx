import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Volume2, Music, Mic, MicOff, Check, RotateCcw } from 'lucide-react';
import {
  TUNER_STRINGS,
  TunerStringInfo,
  playSingleString,
  playGuitarChord,
  playTunedChime,
  detectPitchAutocorrelation,
  analyzeGuitarPitch,
  PitchAnalysisResult,
} from '../../lib/audio-synth';

interface TunerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Disposição 3+3 de uma cabeça de guitarra acústica (como no GuitarTuna):
// Esquerda (de cima para baixo): 4ª Ré (D3), 5ª Lá (A2), 6ª Mi (E2)
// Direita  (de cima para baixo): 3ª Sol (G3), 2ª Si (B3), 1ª Mi (E4)
const LEFT_PEGS = [TUNER_STRINGS[2], TUNER_STRINGS[1], TUNER_STRINGS[0]];
const RIGHT_PEGS = [TUNER_STRINGS[3], TUNER_STRINGS[4], TUNER_STRINGS[5]];

export const TunerModal: React.FC<TunerModalProps> = ({ isOpen, onClose }) => {
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [lockedStringIndex, setLockedStringIndex] = useState<number | null>(null);
  const [activeStringIndex, setActiveStringIndex] = useState<number | null>(null);
  const [pitchResult, setPitchResult] = useState<PitchAnalysisResult | null>(null);
  const [tunedStrings, setTunedStrings] = useState<Record<number, boolean>>({});

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const smoothedFreqRef = useRef<number | null>(null);
  const inTuneFramesRef = useRef<Record<number, number>>({});
  const lastSignalTimeRef = useRef<number>(0);
  const isAutoModeRef = useRef(isAutoMode);
  const lockedStringRef = useRef(lockedStringIndex);
  const tunedStringsRef = useRef(tunedStrings);
  // Incrementado a cada start/stop: invalida pedidos de microfone pendentes (ex: modal fechado durante o pedido de permissão)
  const micSessionRef = useRef(0);

  useEffect(() => {
    isAutoModeRef.current = isAutoMode;
  }, [isAutoMode]);

  useEffect(() => {
    lockedStringRef.current = lockedStringIndex;
  }, [lockedStringIndex]);

  useEffect(() => {
    tunedStringsRef.current = tunedStrings;
  }, [tunedStrings]);

  const stopMicrophone = useCallback(() => {
    micSessionRef.current++;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    smoothedFreqRef.current = null;
    setIsListening(false);
    setPitchResult(null);
  }, []);

  const startMicrophone = useCallback(async () => {
    setMicError(null);
    const session = ++micSessionRef.current;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setMicError('O teu navegador não suporta acesso ao microfone neste dispositivo.');
      return;
    }

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        setMicError('Web Audio API não disponível neste navegador.');
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (session !== micSessionRef.current) {
        // Fechado/parado enquanto aguardava permissão: libertar o microfone em vez de o deixar ligado
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        return;
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      setIsListening(true);

      const buffer = new Float32Array(analyser.fftSize);

      const updatePitch = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;

        analyserRef.current.getFloatTimeDomainData(buffer);
        const rawFreq = detectPitchAutocorrelation(buffer, audioCtxRef.current.sampleRate);
        const now = performance.now();

        if (rawFreq !== null) {
          lastSignalTimeRef.current = now;

          // Suavização exponencial para agulha fluida sem saltos bruscos
          if (
            smoothedFreqRef.current === null ||
            Math.abs(rawFreq - smoothedFreqRef.current) / smoothedFreqRef.current > 0.08
          ) {
            smoothedFreqRef.current = rawFreq;
          } else {
            smoothedFreqRef.current = smoothedFreqRef.current * 0.65 + rawFreq * 0.35;
          }

          const targetIdx = isAutoModeRef.current ? null : lockedStringRef.current;
          const analysis = analyzeGuitarPitch(smoothedFreqRef.current, targetIdx);

          setPitchResult(analysis);
          setActiveStringIndex(analysis.targetString.index);

          // Contabilizar frames seguidos afinados (±5 cents) para marcar corda como afinada ✓
          const sIdx = analysis.targetString.index;
          if (analysis.status === 'in-tune') {
            const count = (inTuneFramesRef.current[sIdx] || 0) + 1;
            inTuneFramesRef.current[sIdx] = count;
            if (count === 12 && !tunedStringsRef.current[sIdx]) {
              setTunedStrings((prev) => ({ ...prev, [sIdx]: true }));
              playTunedChime();
            }
          } else {
            inTuneFramesRef.current[sIdx] = 0;
          }
        } else if (now - lastSignalTimeRef.current > 1400) {
          // Limpar leitura após 1.4s de silêncio
          smoothedFreqRef.current = null;
          setPitchResult(null);
        }

        rafIdRef.current = requestAnimationFrame(updatePitch);
      };

      rafIdRef.current = requestAnimationFrame(updatePitch);
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
      if (session !== micSessionRef.current) return;
      setMicError(
        'Permissão de microfone recusada ou indisponível. Podes continuar a afinar de ouvido clicando nas cordas abaixo.'
      );
      setIsListening(false);
    }
  }, []);

  // O microfone só depende de isOpen: um `onClose` inline do pai muda a cada render e não deve desligar o afinador
  useEffect(() => {
    if (!isOpen) {
      stopMicrophone();
      setActiveStringIndex(null);
      setMicError(null);
      return;
    }
    return () => {
      stopMicrophone();
    };
  }, [isOpen, stopMicrophone]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleAuto = () => {
    setIsAutoMode((prev) => {
      const next = !prev;
      if (next) {
        setLockedStringIndex(null);
      } else if (lockedStringIndex === null) {
        setLockedStringIndex(activeStringIndex ?? 0);
      }
      return next;
    });
  };

  const handleSelectPeg = (str: TunerStringInfo) => {
    setActiveStringIndex(str.index);
    playSingleString(str.index);

    // Se clicar na corda já fixada, volta ao modo AUTO; caso contrário fixa essa corda
    if (!isAutoMode && lockedStringIndex === str.index) {
      setIsAutoMode(true);
      setLockedStringIndex(null);
    } else {
      setIsAutoMode(false);
      setLockedStringIndex(str.index);
    }
  };

  const handlePlayAllOpen = () => {
    setActiveStringIndex(-1);
    playGuitarChord([0, 0, 0, 0, 0, 0], 1);
  };

  const handleResetTuned = () => {
    setTunedStrings({});
    inTuneFramesRef.current = {};
  };

  const displayedString: TunerStringInfo | null =
    pitchResult?.targetString ??
    (lockedStringIndex !== null
      ? TUNER_STRINGS[lockedStringIndex]
      : activeStringIndex !== null && activeStringIndex >= 0
        ? TUNER_STRINGS[activeStringIndex]
        : null);

  const needlePercent = pitchResult ? 50 + pitchResult.clampedCents : 50;
  const isInTune = pitchResult?.status === 'in-tune';
  const isClose = pitchResult && Math.abs(pitchResult.cents) <= 15;
  const tunedCount = Object.values(tunedStrings).filter(Boolean).length;

  const renderPegButton = (str: TunerStringInfo, align: 'left' | 'right') => {
    const isSelected =
      pitchResult?.targetString.index === str.index ||
      lockedStringIndex === str.index ||
      activeStringIndex === str.index;
    const isTuned = Boolean(tunedStrings[str.index]);

    return (
      <button
        key={str.index}
        type="button"
        onClick={() => handleSelectPeg(str)}
        className={`relative flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
          align === 'right' ? 'flex-row-reverse text-right' : ''
        } ${
          isSelected && isInTune
            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 ring-2 ring-emerald-500/40'
            : isSelected
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/40'
              : isTuned
                ? 'bg-emerald-50/50 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-800/70 hover:border-emerald-400'
                : 'bg-gray-50 dark:bg-zinc-800/70 border-gray-200 dark:border-zinc-700/80 hover:border-amber-300 dark:hover:border-amber-700'
        }`}
      >
        <div className="min-w-0">
          <div
            className={`flex items-center gap-1 text-xs font-black text-gray-900 dark:text-gray-100 ${
              align === 'right' ? 'justify-end' : ''
            }`}
          >
            <span>{str.shortLabel}</span>
            <Volume2
              className={`w-3 h-3 shrink-0 ${
                isSelected ? 'text-amber-600 dark:text-amber-400 animate-pulse' : 'text-gray-400'
              }`}
            />
          </div>
          <div className="text-[11px] font-mono font-bold text-[#0073a8] dark:text-sky-400">
            {str.note} • {str.freq} Hz
          </div>
        </div>

        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 transition-colors ${
            isTuned
              ? 'bg-emerald-500 text-white shadow-xs'
              : isSelected
                ? 'bg-amber-500 text-white'
                : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300'
          }`}
          title={isTuned ? 'Corda afinada!' : `Ouvir / Fixar ${str.shortLabel}`}
        >
          {isTuned ? <Check className="w-4 h-4" /> : str.note.replace(/[0-9]/g, '')}
        </div>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4 print:hidden overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Diapasão e Afinador Automático de Guitarra"
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 text-gray-900 dark:text-gray-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                Afinador Escuteiro
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                Automático (GuitarTuna) & Referência • 440 Hz
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Switch AUTO (estilo GuitarTuna) */}
            <button
              type="button"
              onClick={handleToggleAuto}
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wider uppercase transition-all cursor-pointer border ${
                isAutoMode
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-zinc-700'
              }`}
              title={
                isAutoMode
                  ? 'Deteção automática de corda ativa'
                  : 'Modo manual (clica para voltar a AUTO)'
              }
            >
              AUTO {isAutoMode ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Fechar afinador"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Botão de Microfone + Estado */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={isListening ? stopMicrophone : startMicrophone}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs ${
              isListening
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/30'
                : 'bg-[#0073a8] hover:bg-[#005f8b] text-white'
            }`}
          >
            {isListening ? (
              <>
                <Mic className="w-4 h-4 animate-pulse" />
                <span>Microfone Ativo — Toca uma corda</span>
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4" />
                <span>Ativar Afinador por Microfone</span>
              </>
            )}
          </button>

          {tunedCount > 0 && (
            <button
              type="button"
              onClick={handleResetTuned}
              className="p-2.5 rounded-xl bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Limpar cordas marcadas como afinadas"
              aria-label="Limpar cordas afinadas"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>

        {micError && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-300">
            {micError}
          </div>
        )}

        {/* Mostrador e Agulha estilo GuitarTuna */}
        <div className="mt-3.5 p-4 rounded-2xl bg-gray-900 dark:bg-zinc-950 text-white border border-gray-800 relative overflow-hidden">
          {/* Escala graduada (-50 a +50 cents) */}
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1.5 px-1">
            <span>-50 (Grave)</span>
            <span className="text-emerald-400 font-bold">0</span>
            <span>+50 (Agudo)</span>
          </div>

          <div className="relative h-8 bg-zinc-800/90 rounded-xl border border-zinc-700/80 flex items-center px-2">
            {/* Zona verde central de afinação perfeita (±5 cents -> 10% da largura total) */}
            <div className="absolute left-1/2 -translate-x-1/2 w-[12%] h-full bg-emerald-500/20 border-x border-emerald-500/50" />
            {/* Linha central exata */}
            <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-full bg-emerald-400" />

            {/* Marcas de graduação */}
            <div className="w-full flex justify-between items-center pointer-events-none px-1">
              {Array.from({ length: 11 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-px ${
                    idx === 5 ? 'h-5 bg-emerald-400' : idx % 2 === 0 ? 'h-3 bg-zinc-500' : 'h-2 bg-zinc-600'
                  }`}
                />
              ))}
            </div>

            {/* Agulha / Indicador móvel com leitura de cents */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-100 ease-out"
              style={{ left: `${Math.max(6, Math.min(94, needlePercent))}%` }}
            >
              <div
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-extrabold shadow-md border ${
                  !pitchResult
                    ? 'bg-zinc-700 text-zinc-300 border-zinc-500'
                    : isInTune
                      ? 'bg-emerald-500 text-white border-emerald-300 scale-105'
                      : isClose
                        ? 'bg-amber-500 text-zinc-950 border-amber-300'
                        : 'bg-rose-500 text-white border-rose-300'
                }`}
              >
                {pitchResult
                  ? `${pitchResult.cents > 0 ? '+' : ''}${Math.round(pitchResult.cents)}`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Nota Central e Instrução Direta */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-black transition-colors border ${
                  isInTune
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : pitchResult
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                <span className="text-lg leading-none">
                  {displayedString ? displayedString.note : '--'}
                </span>
                <span className="text-[10px] font-semibold opacity-80 mt-0.5">
                  {displayedString ? displayedString.shortLabel.split(' ')[1] : ''}
                </span>
              </div>

              <div>
                <div className="text-xs font-extrabold tracking-tight">
                  {!isListening && !displayedString && 'Ativa o microfone ou toca numa corda'}
                  {isListening && !pitchResult && 'À escuta... toca uma corda solta'}
                  {!isListening && displayedString && `Referência: ${displayedString.solfege}`}
                  {pitchResult && isInTune && 'Afinada! Perfeito ✓'}
                  {pitchResult && pitchResult.status === 'flat' && 'Grave — Aperta a cravelha ↑'}
                  {pitchResult && pitchResult.status === 'sharp' && 'Aguda — Desaperta a cravelha ↓'}
                </div>
                <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  {pitchResult
                    ? `Detetado: ${pitchResult.detectedFreq.toFixed(1)} Hz • Alvo: ${pitchResult.targetString.freq.toFixed(2)} Hz`
                    : displayedString
                      ? `Alvo: ${displayedString.freq.toFixed(2)} Hz (${displayedString.shortLabel})`
                      : 'Afinação Standard: E2 A2 D3 G3 B3 E4'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cabeça da Guitarra 3+3 (Cravelhas Esquerda e Direita) */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-zinc-400 mb-2">
            <span>Clica numa corda para ouvir ou fixar:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {tunedCount}/6 afinadas
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Cravelhas da Esquerda: 4ª Ré, 5ª Lá, 6ª Mi */}
            <div className="flex flex-col gap-2">
              {LEFT_PEGS.map((str) => renderPegButton(str, 'left'))}
            </div>

            {/* Cravelhas da Direita: 3ª Sol, 2ª Si, 1ª Mi */}
            <div className="flex flex-col gap-2">
              {RIGHT_PEGS.map((str) => renderPegButton(str, 'right'))}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handlePlayAllOpen}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-[#0073a8] dark:text-sky-400" />
            <span>Ouvir Todas (Rasgado)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl font-semibold text-xs bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
