export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState extends WindowBounds {
  appId: string;
  minimized: boolean;
  maximized: boolean;
  /** Bounds to restore to when un-maximizing. */
  prevBounds?: WindowBounds;
}

export interface WindowManagerSnapshot {
  windows: Record<string, WindowState>;
  zOrder: string[];
}
