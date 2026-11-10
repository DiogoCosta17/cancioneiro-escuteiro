import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { reloadOnServiceWorkerUpdate } from './lib/sw-update';

// Após um novo deploy, os chunks lazy da versão antiga deixam de existir no servidor.
// Recarregar uma única vez para obter a versão nova em vez de mostrar o ecrã de erro.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('chunk_reload_at') || 0);
    if (Date.now() - last < 10000) return;
    sessionStorage.setItem('chunk_reload_at', String(Date.now()));
  } catch {
    // Sem sessionStorage não há forma segura de evitar ciclos de recarregamento
    return;
  }
  event.preventDefault();
  window.location.reload();
});

reloadOnServiceWorkerUpdate();

// Versões antigas do service worker guardavam as respostas da API do Supabase (incluindo dados de
// administração) na cache "supabase-api-cache". Já não é usada: apagá-la dos dispositivos.
try {
  if (typeof caches !== 'undefined') {
    caches.delete('supabase-api-cache').catch(() => {});
  }
} catch {
  // Cache Storage indisponível (ex.: contexto não seguro): nada a limpar
}

// Cópia local do histórico de missas usada por versões antigas da proposta de missa (já não é usada)
try {
  localStorage.removeItem('cancioneiro_song_usage_v1');
  // Leituras guardadas pelo feed antigo (sem refrão do salmo); as novas ficam em cancioneiro_readings_v2
  localStorage.removeItem('cancioneiro_readings_v1');
} catch {
  // Armazenamento indisponível: nada a limpar
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
