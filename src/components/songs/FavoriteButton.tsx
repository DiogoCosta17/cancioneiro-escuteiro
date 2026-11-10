import React, { useCallback } from 'react';
import { Heart } from 'lucide-react';
import { toggleFavoriteId, useIsFavorite } from '../../hooks/useFavorites';

export interface FavoriteButtonProps {
  songId: string;
  /** Título do cântico, usado no rótulo acessível */
  title?: string;
  /** 'sm' = 32px (cartões), 'md' = 40px (página da música) */
  size?: 'sm' | 'md';
  className?: string;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({ songId, title, size = 'sm', className = '' }) => {
  const isFavorite = useIsFavorite(songId);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Pode estar dentro de um <Link> (SongCard): não navegar
      e.preventDefault();
      e.stopPropagation();
      toggleFavoriteId(songId);
    },
    [songId]
  );

  const label = isFavorite
    ? `Remover ${title ? `"${title}" ` : ''}dos favoritos`
    : `Adicionar ${title ? `"${title}" ` : ''}aos favoritos`;

  const sizeClasses = size === 'md' ? 'w-10 h-10' : 'w-8 h-8';
  const iconClasses = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isFavorite}
      aria-label={label}
      title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={`flex items-center justify-center ${sizeClasses} rounded-full border transition-colors cursor-pointer shrink-0 ${
        isFavorite
          ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400'
          : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-400 dark:text-zinc-400 hover:border-rose-300 dark:hover:border-rose-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
      } ${className}`}
    >
      <Heart className={`${iconClasses} ${isFavorite ? 'fill-current' : ''}`} aria-hidden="true" />
    </button>
  );
};
