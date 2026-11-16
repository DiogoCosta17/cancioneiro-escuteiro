import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from '../../pages/NotFound';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('anuncia o carregamento a leitores de ecrã, com mensagem por omissão ou própria', () => {
    const { unmount } = render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getAllByText('A carregar...')[0]).toBeInTheDocument();
    unmount();

    render(<LoadingSpinner message="A preparar cancioneiro..." fullScreen={false} />);
    expect(screen.getAllByText('A preparar cancioneiro...')[0]).toBeInTheDocument();
  });
});

describe('Página 404', () => {
  it('mostra a página própria e muda o título do separador', () => {
    document.title = 'Cancioneiro';
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText(/Parece que saíste do trilho/i)).toBeInTheDocument();
    expect(document.title).toContain('Página Não Encontrada');
  });
});
