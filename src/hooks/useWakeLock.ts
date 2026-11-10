import { useEffect } from 'react';
import { requestScreenWakeLock } from '../lib/wake-lock';

/** Mantém o ecrã ligado enquanto `active` for verdadeiro (libertado ao desmontar). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return requestScreenWakeLock();
  }, [active]);
}
