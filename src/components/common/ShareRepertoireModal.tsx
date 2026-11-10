import React, { useEffect, useState, useMemo, useRef, useId } from 'react';
import { QrCode, Copy, Check, Share2, X, MessageCircle, Music } from 'lucide-react';
import { generateQrMatrix } from '../../lib/qr-svg';

export interface ShareRepertoireModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  shareUrl: string;
  /** Número de cânticos (usado apenas em kind='repertoire') */
  songCount?: number;
  /** 'repertoire' (lista/evento, por omissão) ou 'song' (um único cântico) */
  kind?: 'repertoire' | 'song';
}

export const ShareRepertoireModal: React.FC<ShareRepertoireModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  shareUrl,
  songCount = 0,
  kind = 'repertoire',
}) => {
  const [copied, setCopied] = useState(false);
  const isSong = kind === 'song';
  const idPrefix = useId();
  const titleId = `${idPrefix}-share-title`;
  const inputId = `${idPrefix}-share-url`;

  // O pai pode passar um onClose inline (função nova a cada render). Guardá-lo numa ref
  // evita que o efeito de abertura volte a correr e reponha o estado "Link copiado!".
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    setCopied(false);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, [isOpen]);

  const qrMatrix = useMemo(() => {
    if (!isOpen || !shareUrl) return [];
    try {
      return generateQrMatrix(shareUrl);
    } catch (err) {
      console.warn('Erro ao gerar matriz QR:', err);
      return [];
    }
  }, [isOpen, shareUrl]);

  if (!isOpen) return null;

  const songCountLabel = `${songCount} ${songCount === 1 ? 'cântico' : 'cânticos'}`;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Não foi possível copiar o link:', err);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${title} — Cancioneiro 488`,
          text: isSong
            ? `${title}${subtitle ? ` (${subtitle})` : ''} — letra e acordes no Cancioneiro 488`
            : `Repertório "${title}" (${songCountLabel})`,
          url: shareUrl,
        });
      } catch {
        // Utilizador cancelou ou a partilha falhou
      }
    }
  };

  const whatsappText = encodeURIComponent(
    isSong
      ? `⚜️ *${title}*${subtitle ? ` — ${subtitle}` : ''}\nLetra e acordes no Cancioneiro 488:\n${shareUrl}`
      : `⚜️ *${title}* (${songCountLabel})\nAbre o repertório no Cancioneiro 488:\n${shareUrl}`
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappText}`;

  const qrSize = qrMatrix.length;
  const margin = 3;
  const totalViewBox = qrSize + margin * 2;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full p-6 relative transform transition-all animate-in zoom-in-95 duration-150 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão Fechar */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar janela de partilha"
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-4 pr-6">
          <div className="w-11 h-11 rounded-xl bg-green-50 dark:bg-green-950/50 border border-green-200/60 dark:border-green-900/40 flex items-center justify-center text-[#2d5016] dark:text-green-400 shrink-0">
            <QrCode className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              {title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5 min-w-0">
              {isSong ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[#2d5016] dark:text-green-400 min-w-0">
                  <Music className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{subtitle || 'Cântico'}</span>
                </span>
              ) : (
                <>
                  {subtitle && <span className="truncate">{subtitle} •</span>}
                  <span className="inline-flex items-center gap-1 font-semibold text-[#2d5016] dark:text-green-400">
                    <Music className="w-3.5 h-3.5" />
                    {songCountLabel}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Código QR em SVG */}
        <div className="bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col items-center justify-center mb-5">
          {qrSize > 0 ? (
            <div className="bg-white p-2 rounded-xl shadow-xs border border-gray-200">
              <svg
                data-testid="repertoire-qr-svg"
                xmlns="http://www.w3.org/2000/svg"
                viewBox={`0 0 ${totalViewBox} ${totalViewBox}`}
                shapeRendering="crispEdges"
                className="w-48 h-48 sm:w-52 sm:h-52 block"
                role="img"
                aria-label={`Código QR para ${title}`}
              >
                <rect width={totalViewBox} height={totalViewBox} fill="#ffffff" />
                {qrMatrix.map((row, r) =>
                  row.map((isDark, c) =>
                    isDark ? (
                      <rect
                        key={`${r}-${c}`}
                        x={c + margin}
                        y={r + margin}
                        width={1}
                        height={1}
                        fill="#111827"
                      />
                    ) : null
                  )
                )}
              </svg>
            </div>
          ) : (
            <div role="status" className="py-10 text-xs text-center text-gray-500 dark:text-gray-400">
              Não foi possível gerar o código QR (demasiados cânticos). O link abaixo continua a funcionar: usa "Copiar Link".
            </div>
          )}
          <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-3 max-w-xs">
            {isSong
              ? 'Aponta a câmara do telemóvel para abrir este cântico com letra e acordes.'
              : 'Aponta a câmara do telemóvel para abrir este repertório instantaneamente na missa ou fogo de conselho.'}
          </p>
        </div>

        {/* Link de Partilha + Copiar */}
        <div className="mb-4">
          <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
            {isSong ? 'Link Direto do Cântico' : 'Link Direto do Repertório'}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="text"
              readOnly
              value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 min-w-0 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-gray-700 dark:text-gray-200 font-mono outline-none"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-[#2d5016] hover:bg-[#3a681d] text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Link copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>
          </div>
          <span className="sr-only" aria-live="polite">
            {copied ? 'Link copiado para a área de transferência' : ''}
          </span>
        </div>

        {/* Botões de Partilha Rápida */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/30 font-semibold text-xs transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Partilhar no WhatsApp</span>
          </a>

          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-semibold text-xs transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Partilhar...</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
