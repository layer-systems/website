import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { WindowManagerContext, type WindowManagerContextType } from './WindowManagerContext';
import { initialState, windowReducer } from './windowReducer';
import { getApp, minSizeMap } from './registry';
import { getViewport } from './layout';
import { clearSession, loadSession, saveSession } from './persistence';
import type { AppParams, Rect } from './types';

const SAVE_DEBOUNCE_MS = 300;

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(windowReducer, initialState, (fallback) => {
    return loadSession() ?? fallback;
  });

  const openApp = useCallback((appId: string, params?: AppParams) => {
    const app = getApp(appId);
    if (!app) return;
    dispatch({ type: 'OPEN_APP', app, params, viewport: getViewport() });
  }, []);

  const closeWindow = useCallback((id: string) => dispatch({ type: 'CLOSE_WINDOW', id }), []);
  const focusWindow = useCallback((id: string) => dispatch({ type: 'FOCUS_WINDOW', id }), []);
  const minimizeWindow = useCallback((id: string) => dispatch({ type: 'MINIMIZE', id }), []);
  const restoreWindow = useCallback((id: string) => dispatch({ type: 'RESTORE', id }), []);
  const minimizeAll = useCallback(() => dispatch({ type: 'MINIMIZE_ALL' }), []);
  const closeAll = useCallback(() => dispatch({ type: 'CLOSE_ALL' }), []);

  const moveWindow = useCallback(
    (id: string, x: number, y: number) => dispatch({ type: 'MOVE_WINDOW', id, x, y }),
    [],
  );

  const resizeWindow = useCallback(
    (id: string, rect: Rect) => dispatch({ type: 'RESIZE_WINDOW', id, rect }),
    [],
  );

  const toggleMaximize = useCallback(
    (id: string) => dispatch({ type: 'TOGGLE_MAXIMIZE', id, viewport: getViewport() }),
    [],
  );

  const setWindowTitle = useCallback(
    (id: string, title: string) => dispatch({ type: 'SET_TITLE', id, title }),
    [],
  );

  const setWindowParams = useCallback(
    (id: string, params: AppParams) => dispatch({ type: 'SET_PARAMS', id, params }),
    [],
  );

  const resetSession = useCallback(() => {
    clearSession();
    dispatch({ type: 'CLOSE_ALL' });
  }, []);

  // Focus cycling walks the stack in z-order so repeated presses visit every
  // window rather than bouncing between the top two.
  const focusNext = useCallback(() => {
    const visible = [...state.windows].filter((w) => !w.minimized).sort((a, b) => a.z - b.z);
    if (visible.length < 2) {
      if (visible.length === 1) dispatch({ type: 'FOCUS_WINDOW', id: visible[0].id });
      return;
    }
    const index = visible.findIndex((w) => w.id === state.focusedId);
    const next = visible[(index + 1) % visible.length];
    dispatch({ type: 'FOCUS_WINDOW', id: next.id });
  }, [state.windows, state.focusedId]);

  // Re-fit windows when the browser window changes size.
  useEffect(() => {
    const onResize = () => {
      dispatch({ type: 'VIEWPORT_CHANGED', viewport: getViewport(), minSizes: minSizeMap() });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist the session, debounced so dragging does not thrash localStorage.
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveSession(state), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [state]);

  const windows = useMemo(
    () => [...state.windows].sort((a, b) => a.z - b.z),
    [state.windows],
  );

  const value = useMemo<WindowManagerContextType>(
    () => ({
      state,
      windows,
      focusedId: state.focusedId,
      openApp,
      closeWindow,
      focusWindow,
      moveWindow,
      resizeWindow,
      minimizeWindow,
      restoreWindow,
      toggleMaximize,
      setWindowTitle,
      setWindowParams,
      minimizeAll,
      closeAll,
      resetSession,
      focusNext,
    }),
    [
      state,
      windows,
      openApp,
      closeWindow,
      focusWindow,
      moveWindow,
      resizeWindow,
      minimizeWindow,
      restoreWindow,
      toggleMaximize,
      setWindowTitle,
      setWindowParams,
      minimizeAll,
      closeAll,
      resetSession,
      focusNext,
    ],
  );

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
}
