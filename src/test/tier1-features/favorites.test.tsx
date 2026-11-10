import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import {
  FAVORITES_STORAGE_KEY,
  MAX_FAVORITES,
  sanitizeFavoriteIds,
  getFavoriteIds,
  isFavoriteId,
  toggleFavoriteId,
  setFavoriteIds,
  resetFavoritesMemoryForTests,
  useFavorites,
} from '../../hooks/useFavorites';
import { FavoriteButton } from '../../components/songs/FavoriteButton';
import { ShareRepertoireModal } from '../../components/common/ShareRepertoireModal';
import { SongShareButton } from '../../components/songs/SongShareButton';

beforeEach(() => {
  localStorage.clear();
  resetFavoritesMemoryForTests();
});

describe('useFavorites — lógica de armazenamento', () => {
  it('sanitizeFavoriteIds aceita só listas de strings, remove duplicados e vazios', () => {
    expect(sanitizeFavoriteIds(null)).toEqual([]);
    expect(sanitizeFavoriteIds({ a: 1 })).toEqual([]);
    expect(sanitizeFavoriteIds('abc')).toEqual([]);
    expect(sanitizeFavoriteIds(['a', 'a', '', '  ', 3, null, 'b', { id: 'c' }])).toEqual(['a', 'b']);
    expect(sanitizeFavoriteIds(['x'.repeat(500)])).toEqual([]);
  });

  it('limita o número de favoritos', () => {
    const many = Array.from({ length: MAX_FAVORITES + 50 }, (_, i) => `id-${i}`);
    expect(sanitizeFavoriteIds(many)).toHaveLength(MAX_FAVORITES);
  });

  it('recupera de JSON corrompido ou formato inválido sem lançar erro', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, '{not-json');
    expect(getFavoriteIds()).toEqual([]);
    resetFavoritesMemoryForTests();
    localStorage.setItem(FAVORITES_STORAGE_KEY, '{"foo":"bar"}');
    expect(getFavoriteIds()).toEqual([]);
    resetFavoritesMemoryForTests();
    localStorage.setItem(FAVORITES_STORAGE_KEY, '["s1", 42, "s2"]');
    expect(getFavoriteIds()).toEqual(['s1', 's2']);
  });

  it('toggle adiciona à cabeça, remove, e persiste no localStorage', () => {
    expect(toggleFavoriteId('s1')).toBe(true);
    expect(toggleFavoriteId('s2')).toBe(true);
    expect(getFavoriteIds()).toEqual(['s2', 's1']);
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]')).toEqual(['s2', 's1']);

    expect(toggleFavoriteId('s2')).toBe(false);
    expect(isFavoriteId('s2')).toBe(false);
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]')).toEqual(['s1']);
  });

  it('ao exceder o limite, descarta o favorito mais antigo', () => {
    setFavoriteIds(Array.from({ length: MAX_FAVORITES }, (_, i) => `id-${i}`));
    toggleFavoriteId('novo');
    const ids = getFavoriteIds();
    expect(ids).toHaveLength(MAX_FAVORITES);
    expect(ids[0]).toBe('novo');
    expect(ids).not.toContain(`id-${MAX_FAVORITES - 1}`);
  });

  it('continua a funcionar em memória se o localStorage lançar erro', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => toggleFavoriteId('s1')).not.toThrow();
    expect(isFavoriteId('s1')).toBe(true);
    spy.mockRestore();
    warn.mockRestore();
  });

  it('sincroniza componentes no mesmo separador e entre separadores (evento storage)', () => {
    function Counter() {
      const { favoriteIds } = useFavorites();
      return <span data-testid="count">{favoriteIds.length}</span>;
    }
    render(
      <>
        <Counter />
        <FavoriteButton songId="s1" title="Alerta" />
      </>
    );
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: /Adicionar "Alerta" aos favoritos/i }));
    expect(screen.getByTestId('count')).toHaveTextContent('1');

    // Outro separador escreve na mesma chave
    act(() => {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(['s1', 's2', 's3']));
      window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_STORAGE_KEY }));
    });
    expect(screen.getByTestId('count')).toHaveTextContent('3');
  });
});

describe('FavoriteButton', () => {
  it('expõe aria-pressed e não navega quando está dentro de um Link', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <Link to="/song/s1">
                Cartão
                <FavoriteButton songId="s1" title="Alerta" />
              </Link>
            }
          />
          <Route path="/song/:id" element={<div>Página da música</div>} />
        </Routes>
      </MemoryRouter>
    );

    const btn = screen.getByRole('button', { name: /aos favoritos/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(screen.queryByText('Página da música')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remover "Alerta" dos favoritos/i })).toHaveAttribute('aria-pressed', 'true');
    expect(isFavoriteId('s1')).toBe(true);
  });
});

describe('Partilha', () => {
  it('ShareRepertoireModal mantém "Link copiado!" quando o pai re-renderiza com onClose inline', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const props = { isOpen: true, title: 'Missa', shareUrl: 'https://cancioneiro488.vercel.app/evento/1', songCount: 3 };
    const { rerender } = render(<ShareRepertoireModal {...props} onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar Link/i }));
    });
    expect(screen.getByText('Link copiado!')).toBeInTheDocument();

    rerender(<ShareRepertoireModal {...props} onClose={() => {}} />);
    expect(screen.getByText('Link copiado!')).toBeInTheDocument();
  });

  it('SongShareButton abre o diálogo com o link https do cântico e QR Code, sem navegar', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <Link to="/song/abc">
                <SongShareButton songId="abc" title="Sempre Alerta" artist="CNE" variant="icon" />
              </Link>
            }
          />
          <Route path="/song/:id" element={<div>Página da música</div>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Partilhar "Sempre Alerta"/i }));
    expect(screen.queryByText('Página da música')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/^https:\/\/.+\/song\/abc$/)).toBeInTheDocument();
    expect(screen.getByTestId('repertoire-qr-svg')).toBeInTheDocument();
    expect(screen.getByText('Link Direto do Cântico')).toBeInTheDocument();

    // Clicar dentro do diálogo também não deve navegar
    fireEvent.click(screen.getByText('Link Direto do Cântico'));
    expect(screen.queryByText('Página da música')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fechar janela de partilha/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
