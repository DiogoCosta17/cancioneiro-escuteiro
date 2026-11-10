import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { vi, beforeEach } from 'vitest';

// 1. matchMedia mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// 2. ResizeObserver mock
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// 3. IntersectionObserver mock
class IntersectionObserverMock {
  root = null;
  rootMargin = '';
  thresholds = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}
window.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;

// 4. scrollTo mock
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// 5. navigator.onLine mock with dynamic helper
let isOnline = true;
Object.defineProperty(window.navigator, 'onLine', {
  configurable: true,
  get: () => isOnline,
});

export function setMockOnline(status: boolean) {
  isOnline = status;
  window.dispatchEvent(new Event(status ? 'online' : 'offline'));
}

// 6. Reset storages before each test
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  isOnline = true;
  vi.clearAllMocks();
});
