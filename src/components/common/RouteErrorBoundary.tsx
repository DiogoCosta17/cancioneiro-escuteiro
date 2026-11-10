import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { AlertCircle, RotateCcw, Home, ArrowLeft } from 'lucide-react';

export interface RouteErrorBoundaryProps {
  children: React.ReactNode;
}

export const RouteErrorBoundary: React.FC<RouteErrorBoundaryProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ErrorBoundary
      key={location.pathname}
      fallback={(error, reset) => (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-zinc-800 rounded-3xl shadow-xl border border-amber-200/80 dark:border-amber-900/40 p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mb-4 shadow-sm">
              <AlertCircle className="w-8 h-8" />
            </div>

            <span className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 mb-2 border border-amber-200/60 dark:border-amber-800/40">
              Aviso de Navegação
            </span>

            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Dificuldade ao carregar este ecrã
            </h2>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
              Ocorreu uma falha temporária ao carregar este conteúdo. O cabeçalho e as restantes secções do cancioneiro continuam disponíveis.
            </p>

            {error?.message && (
              <div className="text-xs bg-gray-50 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 p-3 rounded-xl font-mono mb-6 text-left overflow-auto max-h-32 border border-gray-100 dark:border-zinc-700">
                {error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl text-white bg-scout-green hover:bg-scout-green-light transition-all shadow-sm cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Tentar de Novo
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.history.state && window.history.state.idx > 0) {
                    navigate(-1);
                  } else {
                    navigate('/');
                  }
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-all cursor-pointer active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar Atrás
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-1.5 text-xs text-scout-green dark:text-green-400 hover:underline cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                Ir para a Página Inicial
              </button>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
};
