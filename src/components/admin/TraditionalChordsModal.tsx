import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wand2, Sparkles, X, HelpCircle, FileText, Trash2 } from 'lucide-react';
import { convertToChordPro, isChordLine } from '../../lib/chordpro-converter';

export interface TraditionalChordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConvert: (chordProContent: string) => void;
}

const EXAMPLE_TRADITIONAL_CHORDS = `{Intro} G  D  Em  C

      G             D
Sou o Sol do futuro que vai nascer
     Em            C
A crescer a brincar e a viver

[Refrão]
G           D
Avancemos com coragem
Em          C
Nesta grande viagem!`;

export function TraditionalChordsModal({ isOpen, onClose, onConvert }: TraditionalChordsModalProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Foco automático ao abrir e fechar com tecla ESC
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 80);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Estatísticas rápidas em tempo real
  const stats = useMemo(() => {
    if (!text.trim()) return null;
    const lines = text.split('\n');
    const totalLines = lines.length;
    const chordLines = lines.filter(l => isChordLine(l)).length;
    return { totalLines, chordLines };
  }, [text]);

  if (!isOpen) return null;

  const handleConvertAndInsert = () => {
    if (!text.trim()) return;
    const converted = convertToChordPro(text);
    onConvert(converted);
    onClose();
    setText('');
  };

  const handleLoadExample = () => {
    setText(EXAMPLE_TRADITIONAL_CHORDS);
  };

  const handleClear = () => {
    setText('');
    textareaRef.current?.focus();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="traditional-converter-title"
      >
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center shrink-0 shadow-2xs">
              <Wand2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="traditional-converter-title" className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                Conversor de Acordes / Pauta
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                Importa pauta com acordes por cima da letra para o formato ChordPro
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            title="Fechar (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
          {/* Caixa de Ajuda / Dica */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 text-xs text-emerald-900 dark:text-emerald-200">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-emerald-950 dark:text-emerald-200">Como funciona?</p>
              <p className="text-emerald-800 dark:text-emerald-300/90 leading-relaxed text-[11px] sm:text-xs">
                Cola a letra com os acordes como a tens no <strong>Word, Bloco de Notas ou pauta</strong> (com acordes por cima e letra em baixo). O sistema analisa as posições e junta tudo automaticamente em formato <code className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 px-1 py-0.5 rounded font-mono font-bold">[Acorde]</code>.
              </p>
            </div>
          </div>

          {/* Barra de Ações Rápidas (Exemplo / Limpar / Indicador) */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-zinc-400 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadExample}
                className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Colar Exemplo</span>
              </button>
              {text.trim() && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                </>
              )}
            </div>

            {stats && (
              <span className="text-[11px] font-medium bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-zinc-700">
                {stats.totalLines} linhas ({stats.chordLines} de acordes)
              </span>
            )}
          </div>

          {/* Caixa de Texto */}
          <textarea
            ref={textareaRef}
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Cola aqui a tua pauta com acordes, por exemplo:\n\n{Intro} G  D  Em  C\n\n      G             D\nSou o Sol do futuro que vai nascer\n     Em            C\nA crescer a brincar e a viver`}
            className="w-full font-mono text-xs sm:text-sm p-3.5 bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 border border-gray-300 dark:border-zinc-700/80 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-500 focus:outline-hidden leading-relaxed shadow-inner placeholder:text-gray-400 dark:placeholder:text-zinc-600 resize-y min-h-[180px] max-h-[45vh]"
          />
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400">
            <HelpCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Podes colar músicas completas com estrofes e refrão.</span>
          </div>

          <div className="flex items-center gap-2.5 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!text.trim()}
              onClick={handleConvertAndInsert}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 dark:bg-scout-green dark:hover:bg-scout-green/90 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
            >
              <Wand2 className="w-4 h-4" />
              <span>Converter e Inserir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

