import { z } from 'zod';
import type { WindowManagerState } from './types';
import { clampRect, getViewport, maximizedRect } from './layout';
import { getApp, minSizeMap } from './registry';

const STORAGE_KEY = 'nostr:os-session';
const VERSION = 1;

const WindowSchema = z.object({
  id: z.string(),
  appId: z.string(),
  title: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  z: z.number(),
  minimized: z.boolean(),
  maximized: z.boolean(),
  prevRect: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
  params: z.record(z.string(), z.string()),
});

const SessionSchema = z.object({
  version: z.literal(VERSION),
  windows: z.array(WindowSchema),
  focusedId: z.string().nullable(),
  counter: z.number(),
  maxZ: z.number(),
});

/**
 * Read a saved session. Windows whose app no longer exists are dropped, and
 * geometry is re-clamped against the current viewport so nothing is stranded
 * off-screen after a resize between visits.
 */
export function loadSession(): WindowManagerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = SessionSchema.parse(JSON.parse(raw));
    const viewport = getViewport();
    const minSizes = minSizeMap();

    const windows = parsed.windows
      .filter((win) => getApp(win.appId))
      .map((win) => {
        const minSize = minSizes[win.appId];
        const rect = win.maximized
          ? maximizedRect(viewport)
          : clampRect(win, minSize, viewport);
        return { ...win, ...rect };
      });

    if (windows.length === 0) return null;

    const focusedId = windows.some((w) => w.id === parsed.focusedId) ? parsed.focusedId : null;

    return {
      windows,
      focusedId,
      counter: parsed.counter,
      maxZ: Math.max(parsed.maxZ, ...windows.map((w) => w.z)),
    };
  } catch {
    // A corrupt or outdated session should never keep the desktop from booting.
    return null;
  }
}

export function saveSession(state: WindowManagerState): void {
  try {
    if (state.windows.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...state }));
  } catch {
    // Private mode or a full quota: the session simply is not restored.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the caller resets in-memory state either way.
  }
}
