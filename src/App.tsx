import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { LoadingSpinner } from './components/common/LoadingSpinner';

// Pages - Critical path / fast routes
import Home from './pages/Home';
import Song from './pages/Song';
import Login from './pages/Login';
import Thematics from './pages/Thematics';
import Eucharist from './pages/Eucharist';
import Liturgy from './pages/Liturgy';
import { MyList } from './pages/MyList';
import { EventsList } from './pages/EventsList';
import { EventView } from './pages/EventView';
import NotFound from './pages/NotFound';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { CommandPalette } from './components/common/CommandPalette';
import { SessionTimeoutHandler } from './components/auth/SessionTimeoutHandler';
import { SongListProvider } from './hooks/useSongList';

import { ErrorBoundary } from './components/common/ErrorBoundary';

// Heavy / admin routes & print views - Code-split with React.lazy()
const SongPrint = lazy(() => import('./pages/SongPrint'));
const ListPrint = lazy(() => import('./pages/ListPrint'));
const EventPrint = lazy(() => import('./pages/EventPrint'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminPanel = lazy(() => import('./components/admin/AdminPanel').then(m => ({ default: m.AdminPanel })));
const SongEditor = lazy(() => import('./components/admin/SongEditor').then(m => ({ default: m.SongEditor })));
const EventEditor = lazy(() => import('./components/admin/EventEditor').then(m => ({ default: m.EventEditor })));
const ImageConverter = lazy(() => import('./components/admin/ImageConverter').then(m => ({ default: m.ImageConverter })));

function AuthRedirectHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // If arriving via Supabase email invite or password recovery link
    const hash = window.location.hash;
    if (hash && (hash.includes('type=invite') || hash.includes('type=recovery'))) {
      if (location.pathname !== '/set-password') {
        navigate('/set-password' + hash, { replace: true });
      }
    }
  }, [location, navigate]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SongListProvider>
          <BrowserRouter>
            <AuthRedirectHandler />
            <SessionTimeoutHandler />
            <OfflineIndicator />
            <CommandPalette />
            <Analytics />
            <Suspense fallback={<LoadingSpinner message="A carregar..." />}>
              <Routes>
                <Route path="song/:id/print" element={<SongPrint />} />
                <Route path="lista/print" element={<ListPrint />} />
                <Route path="evento/:id/print" element={<EventPrint />} />
                <Route path="/" element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="song/:id" element={<Song />} />
                  <Route path="tematicas" element={<Thematics />} />
                  <Route path="eucaristia" element={<Eucharist />} />
                  <Route path="liturgia" element={<Liturgy />} />
                  <Route path="lista" element={<MyList />} />
                  <Route path="eventos" element={<EventsList />} />
                  <Route path="evento/:id" element={<EventView />} />
                  <Route path="login" element={<Login />} />
                  <Route path="set-password" element={<SetPassword />} />

                  <Route path="admin" element={<ProtectedRoute />}>
                    <Route element={<Admin />}>
                      <Route index element={<AdminPanel />} />
                      <Route path="new" element={<SongEditor />} />
                      <Route path="edit/:songId" element={<SongEditor />} />
                      <Route path="events/new" element={<EventEditor />} />
                      <Route path="events/edit/:id" element={<EventEditor />} />
                      <Route path="converter" element={<ImageConverter />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </SongListProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
