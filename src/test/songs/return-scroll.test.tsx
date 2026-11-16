import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRestoreReturnScroll } from '../../hooks/useRestoreReturnScroll';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useRestoreReturnScroll', () => {
  it('não rebenta quando o browser bloqueia o sessionStorage (cookies bloqueados)', () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);

    expect(() => renderHook(() => useRestoreReturnScroll([]))).not.toThrow();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('repõe a posição quando o cartão da música já está no ecrã e limpa a marca', () => {
    sessionStorage.setItem('return_to_scroll_y', '640');
    sessionStorage.setItem('return_to_song_id', 's1');
    const card = document.createElement('div');
    card.id = 'song-card-s1';
    document.body.appendChild(card);

    renderHook(() => useRestoreReturnScroll([]));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'instant' });
    expect(sessionStorage.getItem('return_to_scroll_y')).toBeNull();
    expect(sessionStorage.getItem('return_to_song_id')).toBeNull();
  });

  it('tenta outra vez quando a lista acaba de carregar', () => {
    sessionStorage.setItem('return_to_song_id', 's2');
    const { rerender } = renderHook(({ ready }) => useRestoreReturnScroll([ready]), { initialProps: { ready: false } });
    expect(window.scrollTo).not.toHaveBeenCalled();

    const card = document.createElement('div');
    card.id = 'song-card-s2';
    document.body.appendChild(card);
    rerender({ ready: true });

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });
});
