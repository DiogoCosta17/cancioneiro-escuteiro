import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const auth = { user: null as null | { id: string }, logout: vi.fn() };
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../hooks/useSongs', () => ({ useSongs: () => ({ songs: [], loading: false }) }));

import { Header } from '../../components/layout/Header';
import { CommandPalette } from '../../components/common/CommandPalette';
import { SongListProvider } from '../../hooks/useSongList';

function renderWithRoutes(ui: React.ReactNode) {
  render(
    <SongListProvider>
      <MemoryRouter initialEntries={['/']}>
        {ui}
        <Routes>
          <Route path="/" element={<p>Início</p>} />
          <Route path="/login" element={<p>Página de login</p>} />
          <Route path="/admin" element={<p>Página admin</p>} />
        </Routes>
      </MemoryRouter>
    </SongListProvider>
  );
}

beforeEach(() => {
  auth.user = null;
});

describe('Entrada na área de dirigentes', () => {
  it('cadeado no cabeçalho leva ao login sem ter de ir ao rodapé', () => {
    renderWithRoutes(<Header />);
    fireEvent.click(screen.getByRole('link', { name: 'Área de Dirigentes' }));
    expect(screen.getByText('Página de login')).toBeInTheDocument();
  });

  it('no menu do telemóvel há "Área de Dirigentes" no fim', () => {
    renderWithRoutes(<Header />);
    fireEvent.click(screen.getByRole('button', { name: 'Alternar menu' }));
    const links = screen.getAllByRole('link', { name: /Área de Dirigentes/ });
    expect(links).toHaveLength(2); // cadeado (computador) + item do menu
  });

  it('com sessão iniciada o cadeado desaparece (fica o botão Admin)', () => {
    auth.user = { id: 'u1' };
    renderWithRoutes(<Header />);
    expect(screen.queryByRole('link', { name: 'Área de Dirigentes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Admin/ })).toBeInTheDocument();
  });

  it('pesquisa rápida: "dirigentes" ou "login" abre a área; não aparece na lista inicial', () => {
    renderWithRoutes(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByLabelText('Pesquisa rápida');

    expect(screen.queryByText('Área de Dirigentes')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'lo' } });
    expect(screen.queryByText('Área de Dirigentes')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'login' } });
    expect(screen.getByText('Área de Dirigentes')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'dirigentes' } });
    fireEvent.click(screen.getByText('Área de Dirigentes'));
    expect(screen.getByText('Página admin')).toBeInTheDocument();
  });
});
