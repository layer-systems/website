import { createContext } from 'react';
import type { WindowBounds, WindowState } from './types';

export interface WindowManagerApi {
  windows: Record<string, WindowState>;
  zOrder: string[];
  focusedAppId: string | undefined;
  openApp: (appId: string, defaultBounds: WindowBounds) => void;
  closeApp: (appId: string) => void;
  focusApp: (appId: string) => void;
  minimizeApp: (appId: string) => void;
  toggleMaximize: (appId: string, viewport: WindowBounds) => void;
  moveApp: (appId: string, x: number, y: number) => void;
  resizeApp: (appId: string, bounds: WindowBounds) => void;
  cycleFocus: () => void;
  zIndexFor: (appId: string) => number;
}

export const WindowManagerContext = createContext<WindowManagerApi | undefined>(undefined);
