import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Plus, Check } from 'lucide-react';
import { Song } from '../../lib/types';
import { useSongList } from '../../hooks/useSongList';
import { FavoriteButton } from './FavoriteButton';

interface SongCardProps {
  song: Song;
}

function areSongCardPropsEqual(prevProps: SongCardProps, nextProps: SongCardProps): boolean {
  if (prevProps.song === nextProps.song) return true;
  if (!prevProps.song || !nextProps.song) return false;
  if (prevProps.song.id !== nextProps.song.id) return false;
  if (prevProps.song.title !== nextProps.song.title) return false;
  if (prevProps.song.artist !== nextProps.song.artist) return false;
  if (prevProps.song.updated_at !== nextProps.song.updated_at) return false;

  const prevTags = prevProps.song.tags;
  const nextTags = nextProps.song.tags;
  if (prevTags !== nextTags) {
    if (!prevTags || !nextTags) return false;
    if (prevTags.length !== nextTags.length) return false;
    for (let i = 0; i < prevTags.length; i++) {
      if (prevTags[i] !== nextTags[i]) return false;
    }
  }
  return true;
}

export const SongCard = React.memo<SongCardProps>(function SongCard({ song }) {
  const { isInList, toggleSong } = useSongList();
  const isSelected = isInList(song.id);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSong(song.id);
    },
    [toggleSong, song.id]
  );

  const handleCardClick = useCallback(() => {
    try {
      sessionStorage.setItem('return_to_scroll_y', String(window.scrollY));
      sessionStorage.setItem('return_to_song_id', song.id);
    } catch {}
  }, [song.id]);

  return (
    <Link 
      id={`song-card-${song.id}`}
      to={`/song/${song.id}`}
      onClick={handleCardClick}
      className="block bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-5 hover:shadow-md hover:border-green-300 dark:hover:border-green-700/60 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-[#2d5016] dark:group-hover:text-green-400 transition-colors">
            {song.title}
          </h3>
          {song.artist && (
            <p className="text-sm text-gray-500 dark:text-zinc-400 truncate mt-1">
              {song.artist}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3">
          <FavoriteButton songId={song.id} title={song.title} />
          <button
            onClick={handleToggle}
            className={`flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer ${
              isSelected
                ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-400 dark:text-zinc-400 hover:border-amber-300 dark:hover:border-amber-600 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
            }`}
            title={isSelected ? 'Remover da Lista' : 'Adicionar à Lista'}
          >
            {isSelected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      <div className="mt-4 flex items-center text-xs">
        <div className="flex items-center text-gray-500 dark:text-zinc-400">
          <Tag className="w-3.5 h-3.5 mr-1" />
          <span className="font-medium text-gray-700 dark:text-zinc-300">
            {song.tags && song.tags.length > 0 ? song.tags.slice(0, 2).join(' • ') : 'Cancioneiro'}
          </span>
        </div>
      </div>
    </Link>
  );
}, areSongCardPropsEqual);

