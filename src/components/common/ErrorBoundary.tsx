import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Home, Trash2 } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (err) {
        console.error('Error during ErrorBoundary onReset:', err);
      }
    }
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleResetLocalStorage = (): void => {
    try {
      localStorage.removeItem('scout_song_list');
      localStorage.removeItem('cancioneiro_cached_songs');
      localStorage.removeItem('cancioneiro_cached_events');
      localStorage.removeItem('scout_recently_viewed');
      Object.keys(localStorage)
        .filter((key) => key.startsWith('cancioneiro_cached_event_detail_'))
        .forEach((key) => localStorage.removeItem(key));
    } catch (e) {
      console.warn('Erro ao limpar storage:', e);
    }
    // A cache offline principal vive no IndexedDB e é lida antes do localStorage:
    // sem a apagar, dados corrompidos voltariam a ser carregados após o recarregamento
    try {
      window.indexedDB?.deleteDatabase('cancioneiro_offline_db');
    } catch (e) {
      console.warn('Erro ao limpar IndexedDB:', e);
    }
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(
            this.state.error || new Error('Erro desconhecido'),
            this.handleReset
          );
        }
        return this.props.fallback;
      }

      // Fallback padrão com tema de emergência escutista (Sempre Alerta)
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4">
          <div className="max-w-lg w-full bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-amber-200/80 dark:border-amber-900/40 p-8 text-center relative overflow-hidden">
            {/* Faixa decorativa escutista */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-scout-green via-scout-yellow to-scout-accent" />

            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mb-5 shadow-sm">
              <AlertTriangle className="w-9 h-9" />
            </div>

            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 mb-3">
              Sempre Alerta!
            </span>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Algo não correu como esperado
            </h1>

            <p className="text-gray-600 dark:text-gray-300 text-sm mb-6 leading-relaxed">
              Encontrámos um obstáculo no caminho. Podes tentar restabelecer esta vista ou recarregar a aplicação para continuar.
            </p>

            {this.state.error?.message && (
              <details className="mb-6 text-left group">
                <summary className="text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  Ver detalhes do erro
                </summary>
                <div className="mt-2 p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-red-600 dark:text-red-400 overflow-x-auto max-h-36">
                  {this.state.error.message}
                  {this.state.error.stack && (
                    <div className="mt-2 text-[10px] text-gray-500 whitespace-pre">
                      {this.state.error.stack}
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-scout-green hover:bg-scout-green-light transition-all shadow-md cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Tentar de Novo
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-all cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                Recarregar App
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-scout-green dark:hover:text-green-400 transition-colors cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                Voltar à Página Principal
              </button>
              <span className="text-gray-300 dark:text-zinc-700">•</span>
              <button
                type="button"
                onClick={this.handleResetLocalStorage}
                className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:underline transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Cache Local
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
