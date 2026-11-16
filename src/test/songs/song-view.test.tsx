import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { YouTubePlayer, getYouTubeVideoId } from '../../components/songs/YouTubePlayer';
import { SongView } from '../../components/songs/SongView';
import { SongListProvider } from '../../hooks/useSongList';
import type { Song } from '../../lib/types';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, adminProfile: null, isAdmin: false, loading: false, logout: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('getYouTubeVideoId', () => {
  it('lê o ID de links /shorts/, /watch, youtu.be e /embed (com espaços e parâmetros extra)', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/shorts/abcDEF12345')).toBe('abcDEF12345');
    expect(getYouTubeVideoId('https://youtube.com/shorts/abcDEF12345?feature=share')).toBe('abcDEF12345');
    expect(getYouTubeVideoId('http://m.youtube.com/shorts/12345678901')).toBe('12345678901');
    expect(getYouTubeVideoId('  https://www.youtube.com/watch?v=abcDEF12345  ')).toBe('abcDEF12345');
    expect(getYouTubeVideoId('https://youtu.be/abcDEF12345')).toBe('abcDEF12345');
    expect(getYouTubeVideoId('https://www.youtube.com/embed/abcDEF12345')).toBe('abcDEF12345');
  });

  it('aceita um ID de 11 caracteres escrito diretamente', () => {
    expect(getYouTubeVideoId('abcDEF12345')).toBe('abcDEF12345');
    expect(getYouTubeVideoId('  abc_123-XYZ  ')).toBe('abc_123-XYZ');
  });

  it('devolve null para valores vazios, inválidos ou de outros sites', () => {
    for (const invalid of [null, undefined, '', '   ', 'not-a-url', 'https://spotify.com/track/123', 42]) {
      expect(getYouTubeVideoId(invalid as string)).toBeNull();
    }
  });
});

describe('YouTubePlayer', () => {
  it('incorpora o vídeo pelo domínio youtube-nocookie', () => {
    render(<YouTubePlayer url="https://www.youtube.com/shorts/abcDEF12345" />);
    expect(screen.getByTitle('Vídeo da Música')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abcDEF12345?rel=0'
    );
  });

  it('para links http(s) de outros sites mostra um botão para abrir o link', () => {
    render(<YouTubePlayer url="https://vimeo.com/12345678" />);
    expect(screen.getByRole('link', { name: /Ouvir Música/i })).toHaveAttribute('href', 'https://vimeo.com/12345678');
  });

  it('não mostra nada para valores vazios ou perigosos (javascript:)', () => {
    for (const url of ['', null, 'javascript:alert(1)']) {
      const { container, unmount } = render(<YouTubePlayer url={url} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe('SongView: layout com e sem vídeo', () => {
  const baseSong: Song = {
    id: 'song-v1',
    title: 'Canção de Teste',
    artist: 'Grupo de Teste',
    content: '{Refrão}\n[C]Sempre em [G]frente',
    tags: ['escutistas'],
    original_key: 'C',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const renderSong = (song: Song) =>
    render(
      <MemoryRouter>
        <SongListProvider>
          <SongView song={song} />
        </SongListProvider>
      </MemoryRouter>
    );

  it('sem vídeo (vazio ou inválido) a letra ocupa a largura toda', () => {
    for (const youtube_url of ['   ', 'not-a-valid-url-or-id']) {
      const { container, unmount } = renderSong({ ...baseSong, youtube_url });
      expect(container.querySelector('.lg\\:col-span-12')).toBeInTheDocument();
      expect(container.querySelector('.lg\\:col-span-4')).toBeNull();
      unmount();
    }
  });

  it('com vídeo válido divide em letra (8 colunas) e vídeo (4 colunas)', () => {
    const { container } = renderSong({ ...baseSong, youtube_url: 'https://www.youtube.com/shorts/abcDEF12345' });
    expect(container.querySelector('.lg\\:col-span-8')).toBeInTheDocument();
    expect(container.querySelector('.lg\\:col-span-4')).toBeInTheDocument();
    expect(screen.getByText('ÁUDIO / VÍDEO')).toBeInTheDocument();
  });

  it('não rebenta com campos opcionais a null', () => {
    const sparseSong = {
      id: 'sparse-1',
      title: 'Cântico Sem Detalhes',
      artist: null,
      content: '[D]Letra simples',
      tags: null,
      original_key: null,
      youtube_url: null,
      capo: null,
    } as unknown as Song;
    renderSong(sparseSong);
    expect(screen.getByText('Cântico Sem Detalhes')).toBeInTheDocument();
    expect(screen.getByText(/Letra simples/)).toBeInTheDocument();
  });
});
