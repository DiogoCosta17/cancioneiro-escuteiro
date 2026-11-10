import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SongEditor } from '../../components/admin/SongEditor';
import type { Song } from '../../lib/types';

const song: Song = {
  id: 's1',
  title: 'Ave Maria',
  artist: 'Tradicional',
  content: '[G]Ave',
  tags: ['Marianas'],
  original_key: 'G',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const getSong = vi.fn();
const updateSong = vi.fn();
// Referência estável: o SongEditor recarrega quando getSong muda
const songsApi = { songs: [song], getSong, createSong: vi.fn(), updateSong };

vi.mock('../../hooks/useSongs', () => ({ useSongs: () => songsApi }));

function renderEditor() {
  render(
    <MemoryRouter initialEntries={['/admin/edit/s1']}>
      <Routes>
        <Route path="/admin/edit/:songId" element={<SongEditor />} />
        <Route path="/admin" element={<p>Painel</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  getSong.mockReset();
  updateSong.mockReset();
});

describe('SongEditor — falha ao carregar a música', () => {
  it('não mostra o formulário vazio (guardar apagaria os dados) e permite tentar outra vez', async () => {
    getSong.mockRejectedValueOnce(new Error('Tempo limite ao carregar música')).mockResolvedValueOnce(song);
    renderEditor();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar esta música');
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByDisplayValue('Ave Maria')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(updateSong).not.toHaveBeenCalled();
  });

  it('música inexistente também bloqueia o formulário', async () => {
    getSong.mockResolvedValueOnce(null);
    renderEditor();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao painel' }));
    expect(screen.getByText('Painel')).toBeInTheDocument();
  });
});
