import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ListPrint from '../../pages/ListPrint';
import { SongListProvider, useSongList } from '../../hooks/useSongList';
import { parseChordPro, transposeParsedLines } from '../../lib/chordpro-parser';
import { transposeChord } from '../../lib/chords';
import type { Song } from '../../lib/types';

const campfireCatalog: Song[] = [
  {
    id: 'cf-1',
    title: 'Hino da Flor de Lis',
    artist: 'B.P.',
    content: '{Refrão}\n[C]A flor de lis nos [G]guia pela honra e pelo [Am]bem [F]',
    tags: ['escutistas', 'fogo'],
    original_key: 'C',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'cf-2',
    title: 'À Volta da Fogueira',
    artist: 'Agrupamento 488',
    content: '{Refrão}\n[G]À volta da fogueira [D]vamos todos can[Em]tar [C]',
    tags: ['escutistas', 'fogo', 'lobitos'],
    original_key: 'G',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'cf-3',
    title: 'Canto da Despedida',
    artist: 'Tradição Escutista',
    content: '{Refrão}\n[F]Não é mais que um [C]até logo [Dm]que nos havemos de [Bb]dar',
    tags: ['escutistas', 'despedida'],
    original_key: 'F',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

vi.mock('../../hooks/useSongs', () => ({
  useSongs: () => ({
    songs: campfireCatalog,
    loading: false,
    error: null,
  }),
}));

function CampfireCoordinator({ onSelectSongs }: { onSelectSongs: (ids: string[]) => void }) {
  const { addSong, selectedSongIds } = useSongList();

  return (
    <div>
      <button
        onClick={() => {
          addSong('cf-1');
          addSong('cf-2');
          addSong('cf-3');
          onSelectSongs(['cf-1', 'cf-2', 'cf-3']);
        }}
      >
        Preparar Repertório Fogo de Conselho
      </button>
      <div data-testid="selected-count">{selectedSongIds.length}</div>
    </div>
  );
}

describe('Tier 4: Scenario A — Scout Campfire Session Workflow (Fogo de Conselho)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.print = vi.fn();
  });

  it('executes full scout campfire journey: filter songs, select into list, transpose chords, toggle notation, and print booklet', async () => {
    // 1. Scout leader filters catalog for campfire songs ("fogo")
    const filteredCampfireSongs = campfireCatalog.filter((s) => s.tags.includes('fogo'));
    expect(filteredCampfireSongs.length).toBe(2);
    expect(filteredCampfireSongs.map((s) => s.title)).toEqual([
      'Hino da Flor de Lis',
      'À Volta da Fogueira',
    ]);

    // 2. Scout leader adds songs into My List (A Minha Lista)
    let selectedList: string[] = [];
    const { unmount } = render(
      <SongListProvider>
        <CampfireCoordinator onSelectSongs={(ids) => { selectedList = ids; }} />
      </SongListProvider>
    );

    act(() => {
      screen.getByText('Preparar Repertório Fogo de Conselho').click();
    });

    expect(screen.getByTestId('selected-count')).toHaveTextContent('3');
    expect(selectedList).toEqual(['cf-1', 'cf-2', 'cf-3']);
    unmount();

    // 3. Scout leader transposes song keys for vocal comfort (+2 semitones for choir)
    const song1 = campfireCatalog[0]; // Original Key C
    const transposedKey = transposeChord(song1.original_key, 2);
    expect(transposedKey).toBe('D');

    // 4. Scout leader tests guitarist notation: Alphabetic ("D", "A", "Bm", "G") vs Syllabic ("Ré", "Lá", "Sim", "Sol")
    const parsedSong1 = parseChordPro(song1.content);
    const guitarChordsAlpha = transposeParsedLines(parsedSong1, 2, false, 'alfabetica')
      .flatMap((l) => l.tokens)
      .filter((t) => t.chord)
      .map((t) => t.chord);
    expect(guitarChordsAlpha).toEqual(['D', 'A', 'Bm', 'G']);

    const guitarChordsSilabica = transposeParsedLines(parsedSong1, 2, false, 'silabica')
      .flatMap((l) => l.tokens)
      .filter((t) => t.chord)
      .map((t) => t.chord);
    expect(guitarChordsSilabica).toEqual(['Ré', 'Lá', 'Sim', 'Sol']);

    // 5. Renders the complete campfire chord sheet booklet for printing
    render(
      <MemoryRouter initialEntries={['/lista/print']}>
        <SongListProvider>
          <Routes>
            <Route path="/lista/print" element={<ListPrint />} />
          </Routes>
        </SongListProvider>
      </MemoryRouter>
    );

    // Verify all 3 campfire songs render in booklet
    expect(await screen.findByText('Hino da Flor de Lis')).toBeInTheDocument();
    expect(screen.getByText('À Volta da Fogueira')).toBeInTheDocument();
    expect(screen.getByText('Canto da Despedida')).toBeInTheDocument();
    expect(screen.getByText(/3 músicas/i)).toBeInTheDocument();

    // Verify section badges render
    expect(screen.getAllByText(/Refrão/i).length).toBeGreaterThanOrEqual(3);
  });
});
