import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { RouteErrorBoundary } from '../common/RouteErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 print:bg-white dark:bg-zinc-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#2d5016] focus:text-white focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 print:hidden"
      >
        Saltar para o conteúdo principal
      </a>
      <div className="print:hidden">
        <Header />
      </div>
      <main id="main-content" className="flex-1 w-full">
        <RouteErrorBoundary>
          <Suspense fallback={<LoadingSpinner message="A carregar página..." />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
};
