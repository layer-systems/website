import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type { WindowBounds, WindowManagerSnapshot } from './types';
import { WindowManagerContext, type WindowManagerApi } from './context';

const STORAGE_KEY = 'nostr:os-window-layout';
const BASE_Z = 20;

type Action =
  | { type: 'OPEN'; appId: string; defaultBounds: WindowBounds }
  | { type: 'CLOSE'; appId: string }
  | { type: 'FOCUS'; appId: string }
  | { type: 'MINIMIZE'; appId: string }
  | { type: 'TOGGLE_MAXIMIZE'; appId: string; viewport: WindowBounds }
  | { type: 'MOVE'; appId: string; x: number; y: number }
  | { type: 'RESIZE'; appId: string; bounds: WindowBounds }
  | { type: 'RESTORE'; snapshot: WindowManagerSnapshot };

function reducer(state: WindowManagerSnapshot, action: Action): WindowManagerSnapshot {
  switch (action.type) {
    case 'RESTORE':
      return action.snapshot;

    case 'OPEN': {
      const existing = state.windows[action.appId];
      if (existing) {
        return {
          windows: {
            ...state.windows,
            [action.appId]: { ...existing, minimized: false },
          },
          zOrder: [...state.zOrder.filter((id) => id !== action.appId), action.appId],
        };
      }
      return {
        windows: {
          ...state.windows,
          [action.appId]: {
            appId: action.appId,
            ...action.defaultBounds,
            minimized: false,
            maximized: false,
          },
        },
        zOrder: [...state.zOrder, action.appId],
      };
    }

    case 'CLOSE': {
      if (!state.windows[action.appId]) return state;
      const { [action.appId]: _removed, ...rest } = state.windows;
      return {
        windows: rest,
        zOrder: state.zOrder.filter((id) => id !== action.appId),
      };
    }

    case 'FOCUS': {
      if (!state.windows[action.appId]) return state;
      const win = state.windows[action.appId];
      return {
        windows: win.minimized
          ? { ...state.windows, [action.appId]: { ...win, minimized: false } }
          : state.windows,
        zOrder: [...state.zOrder.filter((id) => id !== action.appId), action.appId],
      };
    }

    case 'MINIMIZE': {
      const win = state.windows[action.appId];
      if (!win) return state;
      return {
        ...state,
        windows: { ...state.windows, [action.appId]: { ...win, minimized: true } },
      };
    }

    case 'TOGGLE_MAXIMIZE': {
      const win = state.windows[action.appId];
      if (!win) return state;
      if (win.maximized) {
        const restored = win.prevBounds ?? { x: 80, y: 80, width: 640, height: 480 };
        return {
          ...state,
          windows: {
            ...state.windows,
            [action.appId]: { ...win, ...restored, maximized: false, prevBounds: undefined },
          },
        };
      }
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.appId]: {
            ...win,
            maximized: true,
            prevBounds: { x: win.x, y: win.y, width: win.width, height: win.height },
            ...action.viewport,
          },
        },
      };
    }

    case 'MOVE': {
      const win = state.windows[action.appId];
      if (!win || win.maximized) return state;
      return {
        ...state,
        windows: { ...state.windows, [action.appId]: { ...win, x: action.x, y: action.y } },
      };
    }

    case 'RESIZE': {
      const win = state.windows[action.appId];
      if (!win) return state;
      return {
        ...state,
        windows: { ...state.windows, [action.appId]: { ...win, ...action.bounds, maximized: false, prevBounds: undefined } },
      };
    }

    default:
      return state;
  }
}

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { windows: {}, zOrder: [] });
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const snapshot = JSON.parse(raw) as WindowManagerSnapshot;
        dispatch({ type: 'RESTORE', snapshot });
      }
    } catch (error) {
      console.warn('Failed to restore OS window layout:', error);
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.warn('Failed to persist OS window layout:', error);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [state]);

  const openApp = useCallback((appId: string, defaultBounds: WindowBounds) => {
    dispatch({ type: 'OPEN', appId, defaultBounds });
  }, []);
  const closeApp = useCallback((appId: string) => dispatch({ type: 'CLOSE', appId }), []);
  const focusApp = useCallback((appId: string) => dispatch({ type: 'FOCUS', appId }), []);
  const minimizeApp = useCallback((appId: string) => dispatch({ type: 'MINIMIZE', appId }), []);
  const toggleMaximize = useCallback(
    (appId: string, viewport: WindowBounds) => dispatch({ type: 'TOGGLE_MAXIMIZE', appId, viewport }),
    [],
  );
  const moveApp = useCallback((appId: string, x: number, y: number) => dispatch({ type: 'MOVE', appId, x, y }), []);
  const resizeApp = useCallback((appId: string, bounds: WindowBounds) => dispatch({ type: 'RESIZE', appId, bounds }), []);

  const cycleFocus = useCallback(() => {
    // Focusing the least-recently-used window moves it to the end of zOrder,
    // so repeated calls round-robin through every open window (Cmd/Ctrl+` equivalent).
    if (state.zOrder.length < 2) return;
    dispatch({ type: 'FOCUS', appId: state.zOrder[0] });
  }, [state.zOrder]);

  const focusedAppId = state.zOrder[state.zOrder.length - 1];

  const zIndexFor = useCallback(
    (appId: string) => BASE_Z + Math.max(0, state.zOrder.indexOf(appId)),
    [state.zOrder],
  );

  const value = useMemo<WindowManagerApi>(
    () => ({
      windows: state.windows,
      zOrder: state.zOrder,
      focusedAppId,
      openApp,
      closeApp,
      focusApp,
      minimizeApp,
      toggleMaximize,
      moveApp,
      resizeApp,
      cycleFocus,
      zIndexFor,
    }),
    [state.windows, state.zOrder, focusedAppId, openApp, closeApp, focusApp, minimizeApp, toggleMaximize, moveApp, resizeApp, cycleFocus, zIndexFor],
  );

  return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>;
}
