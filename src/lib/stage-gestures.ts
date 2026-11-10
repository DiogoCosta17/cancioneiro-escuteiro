/**
 * Lógica pura do modo palco: gestos de deslize e teclas de navegação
 * (setas e PageUp/PageDown — as teclas enviadas pelos pedais Bluetooth de virar páginas).
 */

export type StageDirection = 'prev' | 'next';

export const SWIPE_MIN_DISTANCE_PX = 60;
export const SWIPE_HORIZONTAL_RATIO = 1.5;
export const SWIPE_MAX_DURATION_MS = 800;

/**
 * Interpreta um deslize: só conta se for claramente horizontal
 * (|dx| > 60px e |dx| > 1,5 × |dy|) e rápido o suficiente.
 * Deslizar para a esquerda (dx < 0) avança; para a direita recua.
 */
export function detectSwipe(
  dx: number,
  dy: number,
  durationMs: number = 0,
  minDistance: number = SWIPE_MIN_DISTANCE_PX,
  ratio: number = SWIPE_HORIZONTAL_RATIO
): StageDirection | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (durationMs > SWIPE_MAX_DURATION_MS) return null;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < minDistance) return null;
  if (absX <= ratio * absY) return null;
  return dx < 0 ? 'next' : 'prev';
}

/** Traduz uma tecla em direção de navegação de palco. */
export function getStageKeyDirection(key: string): StageDirection | null {
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
      return 'next';
    case 'ArrowLeft':
    case 'PageUp':
      return 'prev';
    default:
      return null;
  }
}

/** Indica se o foco está num campo editável (onde as teclas pertencem ao utilizador). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

/** Indica se há um modal aberto na página (ex: Afinador, Partilhar). */
export function isModalOpen(doc: Document = document): boolean {
  return Boolean(doc.querySelector('[aria-modal="true"]'));
}

/**
 * Indica se o toque começou dentro de um elemento com scroll horizontal real
 * (ex: linhas de acordes largas, barra de controlos de tom) — aí o deslize é do elemento.
 */
export function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      if (el.dataset.noSwipe !== undefined) return true;
      if (el.scrollWidth > el.clientWidth + 1) {
        const overflowX = window.getComputedStyle(el).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}
