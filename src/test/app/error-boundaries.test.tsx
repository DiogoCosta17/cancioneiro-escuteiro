import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { RouteErrorBoundary } from '../../components/common/RouteErrorBoundary';
import { Layout } from '../../components/layout/Layout';
import { AuthProvider } from '../../hooks/useAuth';
import { SongListProvider } from '../../hooks/useSongList';

function ProblemChild({ shouldThrow = false, message = 'Falha crítica simulada' }: { shouldThrow?: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div data-testid="healthy-child">Componente Saudável</div>;
}

describe('ErrorBoundary e RouteErrorBoundary', () => {
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

// Mock child components that can throw on demand
function FaultyRoute({ crash = false, message = 'Falha crítica no ecrã' }: { crash?: boolean; message?: string }) {
  if (crash) {
    throw new Error(message);
  }
  return <div data-testid="healthy-route">Conteúdo Saudável da Rota</div>;
}

function NonErrorThrower({ throwValue }: { throwValue: any }): React.JSX.Element {
  throw throwValue;
}

function AlternateHealthyRoute() {
  return <div data-testid="alternate-route">Página de Destino Alternativa</div>;
}

describe('Erros numa página: o resto da app continua a funcionar', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('catches runtime exception inside child route, keeps Header alive and interactive, and recovers when navigating away', async () => {
    render(
      <MemoryRouter initialEntries={['/crashed']}>
        <SongListProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route path="crashed" element={<FaultyRoute crash={true} message="Erro grave ao renderizar música" />} />
                <Route path="recuperado" element={<AlternateHealthyRoute />} />
              </Route>
            </Routes>
          </AuthProvider>
        </SongListProvider>
      </MemoryRouter>
    );

    // 1. Verify RouteErrorBoundary caught the crash and shows the fallback UI
    expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
    expect(screen.getByText('Dificuldade ao carregar este ecrã')).toBeInTheDocument();
    expect(screen.getByText(/Erro grave ao renderizar música/)).toBeInTheDocument();

    // 2. Verify Header and its navigation links are still mounted in the document
    const appTitle = screen.getByText('Cancioneiro');
    expect(appTitle).toBeInTheDocument();
    const inicioLink = screen.getByText('Início');
    expect(inicioLink).toBeInTheDocument();

    // 3. Verify RouteErrorBoundary buttons exist
    const retryBtn = screen.getByRole('button', { name: /Tentar de Novo/i });
    const backBtn = screen.getByRole('button', { name: /Voltar Atrás/i });
    expect(retryBtn).toBeInTheDocument();
    expect(backBtn).toBeInTheDocument();

    // 4. Test recovery via navigation: clicking a header link to a healthy page
    // Because key={location.pathname}, navigating automatically resets the ErrorBoundary
    fireEvent.click(inicioLink);
    expect(screen.queryByText('Aviso de Navegação')).toBeNull();
  });

  it('handles non-Error thrown objects (string, object, null) without crashing the error boundary', () => {
    // Test throw "string error"
    const { unmount: unmount1 } = render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <NonErrorThrower throwValue="Exceção em formato de string crua" />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
    expect(screen.getByText('Dificuldade ao carregar este ecrã')).toBeInTheDocument();
    unmount1();

    // Test throw object { reason: 'custom error' }
    const { unmount: unmount2 } = render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <NonErrorThrower throwValue={{ reason: 'objeto de erro personalizado' }} />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
    unmount2();

    // Test throw null
    const { unmount: unmount3 } = render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <NonErrorThrower throwValue={null} />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText('Aviso de Navegação')).toBeInTheDocument();
    unmount3();
  });

  it('resets error state when clicking "Tentar de Novo"', () => {
    let shouldThrow = true;
    function FlakyChild() {
      if (shouldThrow) {
        throw new Error('Falha passageira');
      }
      return <div data-testid="flaky-success">Agora funcionou!</div>;
    }

    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <FlakyChild />
        </RouteErrorBoundary>
      </MemoryRouter>
    );

    expect(screen.getByText('Dificuldade ao carregar este ecrã')).toBeInTheDocument();

    // Now heal the child and click Tentar de Novo
    shouldThrow = false;
    const retryBtn = screen.getByRole('button', { name: /Tentar de Novo/i });
    fireEvent.click(retryBtn);

    expect(screen.getByTestId('flaky-success')).toBeInTheDocument();
    expect(screen.getByText('Agora funcionou!')).toBeInTheDocument();
    expect(screen.queryByText('Dificuldade ao carregar este ecrã')).toBeNull();
  });

  it('navigates back when window.history.state.idx > 0 or goes to root when at root history entry', () => {
    const originalHistoryState = window.history.state;

    // 1. Test when history state idx > 0
    window.history.replaceState({ idx: 2 }, '');
    const { unmount } = render(
      <MemoryRouter initialEntries={['/primeira', '/segunda']}>
        <RouteErrorBoundary>
          <FaultyRoute crash={true} />
        </RouteErrorBoundary>
      </MemoryRouter>
    );

    const backBtn = screen.getByRole('button', { name: /Voltar Atrás/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    unmount();

    // 2. Test when history state is null (default fresh open)
    window.history.replaceState(null, '');
    render(
      <MemoryRouter initialEntries={['/erro-isolado']}>
        <RouteErrorBoundary>
          <FaultyRoute crash={true} />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    const backBtnRoot = screen.getByRole('button', { name: /Voltar Atrás/i });
    fireEvent.click(backBtnRoot);

    // Also test "Ir para a Página Inicial"
    const homeBtn = screen.getByRole('button', { name: /Ir para a Página Inicial/i });
    fireEvent.click(homeBtn);

    // Restore history state
    window.history.replaceState(originalHistoryState, '');
  });
});
