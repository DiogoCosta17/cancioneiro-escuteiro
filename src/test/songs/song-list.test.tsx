import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
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

describe('A Minha Lista (useSongList)', () => {
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

describe('A Minha Lista: dados inválidos', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <SongListProvider>{children}</SongListProvider>;

  beforeEach(() => {
    localStorage.clear();
  });

  it('começa vazia quando o localStorage tem JSON corrompido ou que não é uma lista', () => {
    for (const stored of ['{"broken json: true', '12345']) {
      localStorage.setItem('scout_song_list', stored);
      const { result, unmount } = renderHook(() => useSongList(), { wrapper });
      expect(result.current.selectedSongIds).toEqual([]);
      unmount();
    }
  });

  it('descarta entradas guardadas que não são ids válidos', () => {
    localStorage.setItem('scout_song_list', JSON.stringify(['valid-1', null, 42, '   ', 'valid-2']));
    const { result } = renderHook(() => useSongList(), { wrapper });
    expect(result.current.selectedSongIds).toEqual(['valid-1', 'valid-2']);
  });

  it('não aceita ids vazios ou que não são texto', () => {
    const { result } = renderHook(() => useSongList(), { wrapper });
    act(() => {
      for (const invalid of ['', '   ', null, 123]) result.current.addSong(invalid as unknown as string);
    });
    expect(result.current.selectedSongIds).toEqual([]);

    act(() => {
      result.current.addSong('valid-song');
    });
    expect(result.current.selectedSongIds).toEqual(['valid-song']);
    for (const invalid of [null, undefined, '']) {
      expect(result.current.isInList(invalid as unknown as string)).toBe(false);
    }
  });

  it('as funções mantêm a mesma referência entre renders (evita re-renders dos cartões)', () => {
    const { result, rerender } = renderHook(() => useSongList(), { wrapper });
    const before = { ...result.current };
    rerender();
    for (const fn of ['addSong', 'removeSong', 'toggleSong', 'clearList', 'reorderSongs', 'isInList'] as const) {
      expect(result.current[fn]).toBe(before[fn]);
    }
  });
});
