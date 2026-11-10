import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export default function Admin() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Suspense fallback={<LoadingSpinner message="A carregar módulo..." />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

