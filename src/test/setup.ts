import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Unit tests should never open real relay sockets. In Node, the native
// WebSocket also uses an Event class incompatible with jsdom's global Event.
Object.defineProperty(globalThis, 'WebSocket', {
  configurable: true,
  value: class TestWebSocket {
    constructor() {
      throw new Error('WebSocket connections are disabled in unit tests');
    }
  },
});

// Node 26 defines a global localStorage getter that Vitest copies over jsdom's
// Storage. Without --localstorage-file that getter returns undefined.
const items = new Map<string, string>();
const localStorage: Storage = {
  get length() { return items.size; },
  clear() { items.clear(); },
  getItem(key) { return items.get(String(key)) ?? null; },
  key(index) { return [...items.keys()][index] ?? null; },
  removeItem(key) { items.delete(String(key)); },
  setItem(key, value) { items.set(String(key), String(value)); },
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorage });

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation((_callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation((_callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
