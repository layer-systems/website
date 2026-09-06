import type { AppDefinition, AppParams, Rect, WindowManagerState, WindowState } from './types';
import {
  type Viewport,
  cascadePosition,
  clampRect,
  fitSize,
  maximizedRect,
  rectOf,
} from './layout';

/** Above this the z-index counter is renumbered to avoid unbounded drift. */
const Z_NORMALIZE_THRESHOLD = 9000;

/**
 * Apps title their window after the content they loaded, and relay content is
 * not length-checked — an article headline can be hundreds of characters. The
 * title bar, the Window menu and the browser tab all need it short.
 */
const MAX_TITLE_LENGTH = 48;

function truncateTitle(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TITLE_LENGTH ? `${clean.slice(0, MAX_TITLE_LENGTH - 1)}…` : clean;
}

export const initialState: WindowManagerState = {
  windows: [],
  focusedId: null,
  counter: 0,
  maxZ: 0,
};

export type WindowAction =
  | { type: 'OPEN_APP'; app: AppDefinition; params?: AppParams; viewport: Viewport }
  | { type: 'CLOSE_WINDOW'; id: string }
  | { type: 'FOCUS_WINDOW'; id: string }
  | { type: 'MOVE_WINDOW'; id: string; x: number; y: number }
  | { type: 'RESIZE_WINDOW'; id: string; rect: Rect }
  | { type: 'MINIMIZE'; id: string }
  | { type: 'RESTORE'; id: string }
  | { type: 'TOGGLE_MAXIMIZE'; id: string; viewport: Viewport }
  | { type: 'SET_TITLE'; id: string; title: string }
  | { type: 'SET_PARAMS'; id: string; params: AppParams }
  | { type: 'MINIMIZE_ALL' }
  | { type: 'CLOSE_ALL' }
  | { type: 'VIEWPORT_CHANGED'; viewport: Viewport; minSizes: Record<string, { width: number; height: number }> }
  | { type: 'HYDRATE'; state: WindowManagerState };

function mapWindow(
  state: WindowManagerState,
  id: string,
  fn: (win: WindowState) => WindowState,
): WindowManagerState {
  let changed = false;
  const windows = state.windows.map((win) => {
    if (win.id !== id) return win;
    const next = fn(win);
    // Only a window that actually came back different counts as a change:
    // returning a fresh state object for a no-op update makes every consumer
    // of the context re-render, which is enough to spin a render loop.
    if (next !== win) changed = true;
    return next;
  });
  return changed ? { ...state, windows } : state;
}

/**
 * Raise a window to the top of the stack. Renumbers every window once the
 * counter grows large so `z` never runs away over a long session.
 */
function raise(state: WindowManagerState, id: string): WindowManagerState {
  const target = state.windows.find((w) => w.id === id);
  if (!target) return state;

  // Already on top and focused: nothing to do.
  if (state.focusedId === id && target.z === state.maxZ) return state;

  if (state.maxZ + 1 > Z_NORMALIZE_THRESHOLD) {
    const ordered = [...state.windows].sort((a, b) => a.z - b.z);
    const renumbered = new Map(ordered.map((win, index) => [win.id, index + 1]));
    const top = ordered.length + 1;
    return {
      ...state,
      windows: state.windows.map((win) => ({
        ...win,
        z: win.id === id ? top : renumbered.get(win.id)!,
      })),
      focusedId: id,
      maxZ: top,
    };
  }

  const nextZ = state.maxZ + 1;
  return {
    ...mapWindow(state, id, (win) => ({ ...win, z: nextZ })),
    focusedId: id,
    maxZ: nextZ,
  };
}

/** The topmost non-minimized window, used after closing or minimizing. */
function topmostVisible(windows: WindowState[]): string | null {
  const visible = windows.filter((w) => !w.minimized);
  if (visible.length === 0) return null;
  return visible.reduce((best, win) => (win.z > best.z ? win : best)).id;
}

export function windowReducer(
  state: WindowManagerState,
  action: WindowAction,
): WindowManagerState {
  switch (action.type) {
    case 'OPEN_APP': {
      const { app, params = {}, viewport } = action;

      if (app.singleton !== false) {
        const existing = state.windows.find((w) => w.appId === app.id);
        if (existing) {
          const withParams = Object.keys(params).length > 0
            ? mapWindow(state, existing.id, (win) => ({ ...win, params }))
            : state;
          return raise(
            mapWindow(withParams, existing.id, (win) => ({ ...win, minimized: false })),
            existing.id,
          );
        }
      }

      const size = fitSize(app.defaultSize, app.minSize, viewport);
      const position = cascadePosition(size, state.windows.length, viewport);
      const id = `${app.id}-${state.counter + 1}`;
      const z = state.maxZ + 1;

      const win: WindowState = {
        id,
        appId: app.id,
        title: app.title,
        ...position,
        ...size,
        z,
        minimized: false,
        maximized: false,
        params,
      };

      return {
        windows: [...state.windows, win],
        focusedId: id,
        counter: state.counter + 1,
        maxZ: z,
      };
    }

    case 'CLOSE_WINDOW': {
      const windows = state.windows.filter((w) => w.id !== action.id);
      if (windows.length === state.windows.length) return state;
      return {
        ...state,
        windows,
        focusedId: state.focusedId === action.id ? topmostVisible(windows) : state.focusedId,
      };
    }

    case 'FOCUS_WINDOW':
      return raise(state, action.id);

    case 'MOVE_WINDOW':
      return mapWindow(state, action.id, (win) => ({ ...win, x: action.x, y: action.y }));

    case 'RESIZE_WINDOW':
      return mapWindow(state, action.id, (win) => ({ ...win, ...action.rect, maximized: false }));

    case 'MINIMIZE': {
      const next = mapWindow(state, action.id, (win) => ({ ...win, minimized: true }));
      if (next === state) return state;
      return { ...next, focusedId: topmostVisible(next.windows) };
    }

    case 'RESTORE':
      return raise(
        mapWindow(state, action.id, (win) => ({ ...win, minimized: false })),
        action.id,
      );

    case 'TOGGLE_MAXIMIZE': {
      const next = mapWindow(state, action.id, (win) => {
        if (win.maximized) {
          const restored = win.prevRect ?? rectOf(win);
          return { ...win, ...restored, maximized: false, prevRect: undefined };
        }
        return {
          ...win,
          prevRect: rectOf(win),
          ...maximizedRect(action.viewport),
          maximized: true,
        };
      });
      return raise(next, action.id);
    }

    case 'SET_TITLE': {
      const title = truncateTitle(action.title);
      if (!title) return state;
      return mapWindow(state, action.id, (win) =>
        win.title === title ? win : { ...win, title },
      );
    }

    case 'SET_PARAMS':
      return mapWindow(state, action.id, (win) => ({ ...win, params: action.params }));

    case 'MINIMIZE_ALL':
      return {
        ...state,
        windows: state.windows.map((win) => ({ ...win, minimized: true })),
        focusedId: null,
      };

    case 'CLOSE_ALL':
      return { ...state, windows: [], focusedId: null };

    case 'VIEWPORT_CHANGED': {
      const { viewport, minSizes } = action;
      return {
        ...state,
        windows: state.windows.map((win) => {
          const minSize = minSizes[win.appId] ?? { width: 240, height: 160 };
          if (win.maximized) {
            return { ...win, ...maximizedRect(viewport) };
          }
          return { ...win, ...clampRect(rectOf(win), minSize, viewport) };
        }),
      };
    }

    case 'HYDRATE':
      return action.state;

    default:
      return state;
  }
}
