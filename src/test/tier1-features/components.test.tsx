import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SongCard } from '../../components/songs/SongCard';
import { ChordDiagram } from '../../components/songs/ChordDiagram';
import { TransposeControls } from '../../components/songs/TransposeControls';
import { SongListProvider } from '../../hooks/useSongList';
import type { Song } from '../../lib/types';

describe('Tier 1: Core Song Components', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('SongCard', () => {
    const testSong: Song = {
      id: 'song-alpha',
      title: 'Hino da Flor de Lis',
      artist: 'Baden-Powell',
      content: '[C]Partir para a aventura',
      tags: ['escutistas', 'pioneiros'],
      original_key: 'C',
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    it('renders song title, artist, and tags', () => {
      render(
        <MemoryRouter>
          <SongListProvider>
            <SongCard song={testSong} />
          </SongListProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('Hino da Flor de Lis')).toBeInTheDocument();
      expect(screen.getByText('Baden-Powell')).toBeInTheDocument();
      expect(screen.getByText(/escutistas • pioneiros/)).toBeInTheDocument();
      expect(screen.queryByText('Cifrada')).not.toBeInTheDocument();
    });

    it('toggles selection button when clicked', () => {
      render(
        <MemoryRouter>
          <SongListProvider>
            <SongCard song={testSong} />
          </SongListProvider>
        </MemoryRouter>
      );

      const addBtn = screen.getByTitle('Adicionar à Lista');
      expect(addBtn).toBeInTheDocument();

      fireEvent.click(addBtn);
      expect(screen.getByTitle('Remover da Lista')).toBeInTheDocument();

      // Check localStorage updated
      expect(JSON.parse(localStorage.getItem('scout_song_list') || '[]')).toContain('song-alpha');
    });

    it('records return scroll position in sessionStorage on click', () => {
      render(
        <MemoryRouter>
          <SongListProvider>
            <SongCard song={testSong} />
          </SongListProvider>
        </MemoryRouter>
      );

      const link = screen.getByText('Hino da Flor de Lis').closest('a');
      expect(link).not.toBeNull();
      fireEvent.click(link!);

      expect(sessionStorage.getItem('return_to_song_id')).toBe('song-alpha');
    });
  });

  describe('ChordDiagram', () => {
    it('renders guitar chord diagram for known chord (C)', () => {
      render(<ChordDiagram chord="C" notation="alfabetica" />);
      expect(screen.getByText('C')).toBeInTheDocument();
      // Verifies SVG rendering
      const svg = document.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('renders syllabic notation in chord diagram (Dó for C)', () => {
      render(<ChordDiagram chord="C" notation="silabica" />);
      expect(screen.getByText('Dó')).toBeInTheDocument();
    });

    it('renders fallback when chord diagram is not available', () => {
      render(<ChordDiagram chord="XYZ99" notation="alfabetica" />);
      expect(screen.getByText('XYZ99')).toBeInTheDocument();
      expect(screen.getByText('Diagrama indisponível')).toBeInTheDocument();
    });
  });

  describe('TransposeControls', () => {
    it('renders key and semitone delta and responds to transpose actions', () => {
      const onTransposeUp = vi.fn();
      const onTransposeDown = vi.fn();
      const onReset = vi.fn();
      const onToggleFlats = vi.fn();
      const onSelectNotation = vi.fn();

      render(
        <TransposeControls
          semitones={2}
          notation="alfabetica"
          preferFlats={false}
          currentKey="D"
          onTransposeUp={onTransposeUp}
          onTransposeDown={onTransposeDown}
          onReset={onReset}
          onToggleFlats={onToggleFlats}
          onSelectNotation={onSelectNotation}
        />
      );

      expect(screen.getByText('D')).toBeInTheDocument();

      // Transpose buttons
      fireEvent.click(screen.getByTitle('Subir meio tom (+1/2)'));
      expect(onTransposeUp).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTitle('Baixar meio tom (-1/2)'));
      expect(onTransposeDown).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTitle('Repor tom original'));
      expect(onReset).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTitle('Clica para usar bemóis (♭)'));
      expect(onToggleFlats).toHaveBeenCalledTimes(1);

      // Notation toggles
      fireEvent.click(screen.getByRole('button', { name: 'Silábica' }));
      expect(onSelectNotation).toHaveBeenCalledWith('silabica');

      fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
      expect(onSelectNotation).toHaveBeenCalledWith('ocultar');
    });
  });
});
