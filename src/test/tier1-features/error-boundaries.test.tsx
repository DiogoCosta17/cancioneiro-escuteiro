import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { RouteErrorBoundary } from '../../components/common/RouteErrorBoundary';

function ProblemChild({ shouldThrow = false, message = 'Falha crítica simulada' }: { shouldThrow?: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div data-testid="healthy-child">Componente Saudável</div>;
}

describe('Tier 1: Error Boundaries (ErrorBoundary & RouteErrorBoundary)', () => {
  // Suppress console.error in tests where exceptions are intentionally thrown
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  describe('ErrorBoundary', () => {
    it('renders normal children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
      expect(screen.getByText('Componente Saudável')).toBeInTheDocument();
    });

    it('catches runtime exceptions and displays the scout fallback UI', () => {
      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} message="Erro grave no leitor" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Sempre Alerta!')).toBeInTheDocument();
      expect(screen.getByText('Algo não correu como esperado')).toBeInTheDocument();
      expect(screen.getAllByText(/Erro grave no leitor/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /Tentar de Novo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Recarregar App/i })).toBeInTheDocument();
    });

    it('supports custom function fallback and reset trigger', () => {
      const onResetMock = vi.fn();

      render(
        <ErrorBoundary
          onReset={onResetMock}
          fallback={(error, reset) => {
            return (
              <div>
                <p>Fallback personalizado: {error.message}</p>
                <button onClick={reset}>Tentar Restabelecer</button>
              </div>
            );
          }}
        >
          <ProblemChild shouldThrow={true} message="Erro teste custom" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Fallback personalizado: Erro teste custom/)).toBeInTheDocument();

      // Click reset
      fireEvent.click(screen.getByRole('button', { name: /Tentar Restabelecer/i }));
      expect(onResetMock).toHaveBeenCalledTimes(1);
    });

    it('clears localStorage keys when "Limpar Cache Local" is clicked', () => {
      localStorage.setItem('scout_song_list', '["1", "2"]');
      localStorage.setItem('cancioneiro_cached_songs', '[{"id":"1"}]');

      // Mock window.location
      const originalLocation = window.location;
      // @ts-expect-error test override
      delete window.location;
      window.location = { ...originalLocation, href: '', reload: vi.fn() } as any;

      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );

      const clearCacheBtn = screen.getByRole('button', { name: /Limpar Cache Local/i });
      fireEvent.click(clearCacheBtn);

      expect(localStorage.getItem('scout_song_list')).toBeNull();
      expect(localStorage.getItem('cancioneiro_cached_songs')).toBeNull();

      window.location = originalLocation as any;
    });
  });

  describe('RouteErrorBoundary', () => {
    it('renders normal route child without errors', () => {
      render(
        <MemoryRouter>
          <RouteErrorBoundary>
            <div data-testid="route-page">Página de Músicas</div>
          </RouteErrorBoundary>
        </MemoryRouter>
      );

      expect(screen.getByTestId('route-page')).toBeInTheDocument();
    });

    it('catches route-level crashes and preserves route navigation UI', () => {
      render(
        <MemoryRouter>
          <RouteErrorBoundary>
            <ProblemChild shouldThrow={true} message="Falha de rota" />
          </RouteErrorBoundary>
        </MemoryRouter>
      );

      expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
      expect(screen.getByText('Dificuldade ao carregar este ecrã')).toBeInTheDocument();
      expect(screen.getByText(/Falha de rota/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tentar de Novo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Voltar Atrás/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Ir para a Página Inicial/i })).toBeInTheDocument();
    });
  });
});
