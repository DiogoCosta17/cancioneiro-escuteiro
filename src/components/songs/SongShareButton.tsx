import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2 } from 'lucide-react';
import { ShareRepertoireModal } from '../common/ShareRepertoireModal';
import { getSongShareUrl } from '../../lib/share-url';

export interface SongShareButtonProps {
  songId: string;
  title: string;
  artist?: string | null;
  /** 'icon' = botão redondo só com ícone; 'button' = ícone + texto "Partilhar" */
  variant?: 'icon' | 'button';
  className?: string;
}

export const SongShareButton: React.FC<SongShareButtonProps> = ({
  songId,
  title,
  artist,
  variant = 'button',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    // Pode estar dentro de um <Link>: não navegar
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => setIsOpen(false), []);

  const label = `Partilhar "${title}"`;

  const modal =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          // Os eventos React de um portal sobem pela árvore React até um eventual <Link> pai
          <div onClick={(e) => e.stopPropagation()}>
            <ShareRepertoireModal
              isOpen={isOpen}
              onClose={handleClose}
              kind="song"
              title={title}
              subtitle={artist || undefined}
              shareUrl={getSongShareUrl(songId)}
            />
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={label}
          aria-haspopup="dialog"
          title="Partilhar / QR Code"
          className={`flex items-center justify-center w-8 h-8 rounded-full border bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-400 dark:text-zinc-400 hover:border-green-300 dark:hover:border-green-700 hover:text-[#2d5016] dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors cursor-pointer shrink-0 ${className}`}
        >
          <Share2 className="w-4 h-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={label}
          aria-haspopup="dialog"
          className={`flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors border border-gray-200 dark:border-zinc-700 shadow-xs justify-center cursor-pointer ${className}`}
        >
          <Share2 className="w-4 h-4 text-[#2d5016] dark:text-green-400" aria-hidden="true" />
          <span>Partilhar</span>
        </button>
      )}
      {modal}
    </>
  );
};
