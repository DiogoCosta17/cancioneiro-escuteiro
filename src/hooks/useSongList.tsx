import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export interface SongListContextType {
  selectedSongIds: string[];
  addSong: (id: string) => void;
  removeSong: (id: string) => void;
  toggleSong: (id: string) => void;
  clearList: () => void;
  isInList: (id: string) => boolean;
  reorderSongs: (ids: string[]) => void;
}

const SongListContext = createContext<SongListContextType | undefined>(undefined);

export function SongListProvider({ children }: { children: React.ReactNode }) {
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('scout_song_list');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()));
      }
      return [];
    } catch (e) {
      console.warn('Erro ao carregar lista de cânticos do localStorage:', e);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('scout_song_list', JSON.stringify(selectedSongIds));
    } catch (e) {
      console.warn('Erro ao guardar lista de cânticos no localStorage:', e);
    }
  }, [selectedSongIds]);

  const addSong = useCallback((id: string) => {
    if (!id || typeof id !== 'string') return;
    const cleanId = id.trim();
    if (!cleanId) return;
    setSelectedSongIds(prev => prev.includes(cleanId) ? prev : [...prev, cleanId]);
  }, []);

  const removeSong = useCallback((id: string) => {
    if (!id || typeof id !== 'string') return;
    setSelectedSongIds(prev => prev.filter(songId => songId !== id));
  }, []);

  const toggleSong = useCallback((id: string) => {
    if (!id || typeof id !== 'string') return;
    const cleanId = id.trim();
    if (!cleanId) return;
    setSelectedSongIds(prev => 
      prev.includes(cleanId) ? prev.filter(songId => songId !== cleanId) : [...prev, cleanId]
    );
  }, []);

  const clearList = useCallback(() => {
    setSelectedSongIds([]);
  }, []);

  const reorderSongs = useCallback((ids: string[]) => {
    if (!Array.isArray(ids)) return;
    setSelectedSongIds(ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())));
  }, []);

  const selectedSet = useMemo(() => new Set(selectedSongIds), [selectedSongIds]);

  const isInList = useCallback((id: string) => {
    if (!id || typeof id !== 'string') return false;
    return selectedSet.has(id);
  }, [selectedSet]);

  const contextValue = useMemo<SongListContextType>(() => ({
    selectedSongIds,
    addSong,
    removeSong,
    toggleSong,
    clearList,
    isInList,
    reorderSongs
  }), [selectedSongIds, addSong, removeSong, toggleSong, clearList, isInList, reorderSongs]);

  return (
    <SongListContext.Provider value={contextValue}>
      {children}
    </SongListContext.Provider>
  );
}

export function useSongList() {
  const context = useContext(SongListContext);
  if (context === undefined) {
    throw new Error('useSongList must be used within a SongListProvider');
  }
  return context;
}
