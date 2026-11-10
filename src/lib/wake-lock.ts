/**
 * Gestor partilhado do Screen Wake Lock (manter o ecrã ligado).
 * Vários componentes (Modo Palco, Auto-Scroll, botão "Ecrã Ligado") podem pedir o bloqueio
 * em simultâneo: é mantido um único sentinel enquanto houver pelo menos um pedido ativo,
 * libertado quando o último termina e voltado a pedir quando o separador volta a ficar visível
 * (o navegador liberta-o automaticamente ao esconder a página).
 */

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
}

interface WakeLockApiLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

let holders = 0;
let sentinel: WakeLockSentinelLike | null = null;
let pending: Promise<WakeLockSentinelLike> | null = null;
let visibilityListenerInstalled = false;

function getApi(): WakeLockApiLike | null {
  if (typeof navigator === 'undefined') return null;
  const api = (navigator as unknown as { wakeLock?: WakeLockApiLike }).wakeLock;
  return api && typeof api.request === 'function' ? api : null;
}

async function ensureLock(): Promise<void> {
  const api = getApi();
  if (!api || holders === 0 || pending) return;
  if (sentinel && !sentinel.released) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  try {
    pending = api.request('screen');
    const acquired = await pending;
    if (holders === 0) {
      // Todos os pedidos terminaram enquanto a permissão estava pendente: liberta já
      acquired.release().catch(() => {});
      return;
    }
    sentinel = acquired;
    acquired.addEventListener?.('release', () => {
      if (sentinel === acquired) sentinel = null;
    });
  } catch {
    // Permissão negada, bateria fraca ou ambiente de teste
  } finally {
    pending = null;
  }
}

function releaseLock(): void {
  const current = sentinel;
  sentinel = null;
  if (current && !current.released) {
    current.release().catch(() => {});
  }
}

function installVisibilityListener(): void {
  if (visibilityListenerInstalled || typeof document === 'undefined') return;
  visibilityListenerInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && holders > 0) {
      void ensureLock();
    }
  });
}

/**
 * Pede para manter o ecrã ligado. Devolve uma função que liberta este pedido
 * (idempotente). O bloqueio real só é libertado quando já ninguém o pede.
 */
export function requestScreenWakeLock(): () => void {
  holders += 1;
  installVisibilityListener();
  void ensureLock();

  let done = false;
  return () => {
    if (done) return;
    done = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) releaseLock();
  };
}
