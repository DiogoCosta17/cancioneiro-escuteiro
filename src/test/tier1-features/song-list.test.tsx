import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SongListProvider, useSongList } from '../../hooks/useSongList';

function TestSongConsumer() {
  const {
    selectedSongIds,
    addSong,
    removeSong,
    toggleSong,
    clearList,
    isInList,
    reorderSongs,
  } = useSongList();

  return (
    <div>
      <div data-testid="count">{selectedSongIds.length}</div>
      <div data-testid="ids">{selectedSongIds.join(',')}</div>
      <div data-testid="is-song1-in">{isInList('song-1') ? 'yes' : 'no'}</div>

      <button onClick={() => addSong('song-1')}>Add 1</button>
      <button onClick={() => addSong('song-2')}>Add 2</button>
      <button onClick={() => addSong('song-1')}>Add 1 Again</button>
      <button onClick={() => removeSong('song-1')}>Remove 1</button>
      <button onClick={() => toggleSong('song-3')}>Toggle 3</button>
      <button onClick={() => clearList()}>Clear</button>
      <button onClick={() => reorderSongs(['song-2', 'song-1'])}>Reorder</button>
    </div>
  );
}

describe('Tier 1: Song List Management (useSongList & SongListProvider)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with empty list when localStorage is empty', () => {
    render(
      <SongListProvider>
        <TestSongConsumer />
      </SongListProvider>
    );

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('is-song1-in')).toHaveTextContent('no');
  });

  it('initializes with saved IDs from localStorage', () => {
    localStorage.setItem('scout_song_list', JSON.stringify(['song-1', 'song-99']));

    render(
      <SongListProvider>
        <TestSongConsumer />
      </SongListProvider>
    );

    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByTestId('is-song1-in')).toHaveTextContent('yes');
    expect(screen.getByTestId('ids')).toHaveTextContent('song-1,song-99');
  });

  it('adds songs and prevents duplicates', () => {
    render(
      <SongListProvider>
        <TestSongConsumer />
      </SongListProvider>
    );

    act(() => {
      screen.getByText('Add 1').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('is-song1-in')).toHaveTextContent('yes');

    // Adding duplicate does not increase count
    act(() => {
      screen.getByText('Add 1 Again').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    act(() => {
      screen.getByText('Add 2').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByTestId('ids')).toHaveTextContent('song-1,song-2');

    // Verify localStorage persistence
    const saved = JSON.parse(localStorage.getItem('scout_song_list') || '[]');
    expect(saved).toEqual(['song-1', 'song-2']);
  });

  it('removes songs from list', () => {
    localStorage.setItem('scout_song_list', JSON.stringify(['song-1', 'song-2']));

    render(
      <SongListProvider>
        <TestSongConsumer />
      </SongListProvider>
    );

    act(() => {
      screen.getByText('Remove 1').click();
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('is-song1-in')).toHaveTextContent('no');
    expect(screen.getByTestId('ids')).toHaveTextContent('song-2');
  });

  it('toggles song membership', () => {
    render(
      <SongListProvider>
        <TestSongConsumer />
      </SongListProvider>
    );

    // Toggle on
    act(() => {
      screen.getByText('Toggle 3').click();
    });
    expect(screen.getByTestId('ids')).toHaveTextContent('song-3');

    // Toggle off
    act(() => {
      screen.getByText('Toggle 3').click();
    });
    expect(screen.getByTestId('ids')).toHaveTextContent('');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('clears the entire list', () => {
    localStorage.setItem('scout_song_list', JSON.stringify(['song-1', 'song-2']));

    render(
      <SongListProvider>
        <TestSongConsumer />
      </SongListProvider>
    );

    act(() => {
      screen.getByText('Clear').click();
    });

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(JSON.parse(localStorage.getItem('scout_song_list') || '[]')).toEqual([]);
  });

  it('reorders songs', () => {
    localStorage.setItem('scout_song_list', JSON.stringify(['song-1', 'song-2']));

    render(
      <SongListProvider>
        <TestSongConsumer />
      </SongListProvider>
    );

    act(() => {
      screen.getByText('Reorder').click();
    });

    expect(screen.getByTestId('ids')).toHaveTextContent('song-2,song-1');
  });

  it('throws an error when useSongList is used without SongListProvider', () => {
    // Suppress React error logging
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestSongConsumer />);
    }).toThrow('useSongList must be used within a SongListProvider');

    spy.mockRestore();
  });
});
