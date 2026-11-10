import { useEffect, useRef } from 'react';
import {
  detectSwipe,
  getStageKeyDirection,
  isEditableTarget,
  isInsideHorizontalScroller,
  isModalOpen,
  type StageDirection,
} from '../lib/stage-gestures';

interface StageNavigationOptions {
  enabled: boolean;
  prevUrl: string | null;
  nextUrl: string | null;
  onNavigate: (url: string) => void;
}

/**
 * Atalhos do modo palco: setas ←/→ e PageUp/PageDown (pedais Bluetooth)
 * e deslize horizontal no ecrã tátil para mudar de música no alinhamento.
 */
export function useStageNavigation({ enabled, prevUrl, nextUrl, onNavigate }: StageNavigationOptions): void {
  // Refs para os listeners não serem recriados a cada render
  const latest = useRef({ prevUrl, nextUrl, onNavigate });
  useEffect(() => {
    latest.current = { prevUrl, nextUrl, onNavigate };
  }, [prevUrl, nextUrl, onNavigate]);

  useEffect(() => {
    if (!enabled) return;

    const go = (direction: StageDirection): boolean => {
      const url = direction === 'next' ? latest.current.nextUrl : latest.current.prevUrl;
      if (!url) return false;
      latest.current.onNavigate(url);
      return true;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const direction = getStageKeyDirection(e.key);
      if (!direction) return;
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement) || isModalOpen()) return;
      if (go(direction)) e.preventDefault();
    };

    let start: { x: number; y: number; time: number } | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1) return;
      // Com zoom ativo, o deslize horizontal serve para mover a vista
      if (window.visualViewport && window.visualViewport.scale > 1.01) return;
      if (isModalOpen() || isEditableTarget(e.target) || isInsideHorizontalScroller(e.target)) return;
      const touch = e.touches[0];
      // Junto às bordas o deslize é o gesto "voltar/avançar" do próprio navegador (iOS Safari)
      const EDGE_PX = 24;
      if (touch.clientX < EDGE_PX || touch.clientX > window.innerWidth - EDGE_PX) return;
      start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Um segundo dedo (pinça) cancela o gesto
      if (e.touches.length > 1) start = null;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.changedTouches[0];
      const origin = start;
      start = null;
      if (!touch) return;
      const direction = detectSwipe(touch.clientX - origin.x, touch.clientY - origin.y, Date.now() - origin.time);
      if (direction) go(direction);
    };

    const handleTouchCancel = () => {
      start = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    // Listeners passivos: nunca bloqueiam o scroll vertical nativo
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [enabled]);
}
