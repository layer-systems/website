import { createContext } from 'react';
import type { AppParams, WindowManagerState, WindowState } from './types';

export interface WindowManagerContextType {
  state: WindowManagerState;
  /** Windows sorted bottom-to-top, ready to render. */
  windows: WindowState[];
  focusedId: string | null;
  openApp: (appId: string, params?: AppParams) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, rect: { x: number; y: number; width: number; height: number }) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setWindowTitle: (id: string, title: string) => void;
  setWindowParams: (id: string, params: AppParams) => void;
  minimizeAll: () => void;
  closeAll: () => void;
  resetSession: () => void;
  /** Cycle focus to the next visible window. */
  focusNext: () => void;
}

export const WindowManagerContext = createContext<WindowManagerContextType | undefined>(undefined);
