import { describe, it, expect, vi } from 'vitest';
import { reloadOnServiceWorkerUpdate } from '../../lib/sw-update';

function fakeWindow(pathname: string, hasController: boolean) {
  const listeners: Record<string, () => void> = {};
  const reload = vi.fn();
  const win = {
    location: { pathname, reload },
    navigator: {
      serviceWorker: {
        controller: hasController ? {} : null,
        addEventListener: (type: string, fn: () => void) => {
          listeners[type] = fn;
        },
      },
    },
  } as unknown as Pick<Window, 'location' | 'navigator'>;
  return { win, reload, fire: () => listeners.controllerchange?.() };
}

describe('reloadOnServiceWorkerUpdate', () => {
  it('recarrega uma vez quando uma versão nova substitui a antiga', () => {
    const { win, reload, fire } = fakeWindow('/', true);
    reloadOnServiceWorkerUpdate(win);
    fire();
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('não recarrega na primeira instalação (não havia versão anterior)', () => {
    const { win, reload, fire } = fakeWindow('/', false);
    reloadOnServiceWorkerUpdate(win);
    fire();
    expect(reload).not.toHaveBeenCalled();
  });

  it('não recarrega na área de administração (formulários a meio)', () => {
    const { win, reload, fire } = fakeWindow('/admin/edit/s1', true);
    reloadOnServiceWorkerUpdate(win);
    fire();
    expect(reload).not.toHaveBeenCalled();
  });

  it('adia o reload enquanto a página está visível e recarrega quando fica escondida', () => {
    const { win, reload, fire } = fakeWindow('/', true);
    let handler: (() => void) | undefined;
    const doc = {
      visibilityState: 'visible',
      addEventListener: (_t: string, fn: () => void) => {
        handler = fn;
      },
      removeEventListener: vi.fn(),
    };
    (win as unknown as { document: unknown }).document = doc;
    reloadOnServiceWorkerUpdate(win);
    fire();
    expect(reload).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    handler?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('não faz nada em browsers sem service worker', () => {
    const win = { location: { pathname: '/', reload: vi.fn() }, navigator: {} } as unknown as Pick<Window, 'location' | 'navigator'>;
    expect(() => reloadOnServiceWorkerUpdate(win)).not.toThrow();
  });
});
