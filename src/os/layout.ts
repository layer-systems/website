import type { Rect, Size, WindowState } from './types';

/** Height of the fixed menu bar in pixels. */
export const MENUBAR_HEIGHT = 28;

/** Minimum number of pixels of a window that must stay inside the viewport. */
const KEEP_VISIBLE = 80;

/** Offset applied to each successive window so they cascade instead of stack. */
const CASCADE_STEP = 28;
const CASCADE_WRAP = 6;

export interface Viewport {
  width: number;
  height: number;
}

export function getViewport(): Viewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight - MENUBAR_HEIGHT,
  };
}

/** Full-screen rect for a maximized window, in desktop coordinates. */
export function maximizedRect(viewport: Viewport): Rect {
  return { x: 0, y: 0, width: viewport.width, height: viewport.height };
}

/** Left or right half of the desktop, used by edge snapping. */
export function halfRect(side: 'left' | 'right', viewport: Viewport): Rect {
  const width = Math.round(viewport.width / 2);
  return {
    x: side === 'left' ? 0 : viewport.width - width,
    y: 0,
    width,
    height: viewport.height,
  };
}

/**
 * Keep a window reachable: never above the desktop origin, and always with a
 * usable strip inside the viewport horizontally and vertically.
 */
export function clampPosition(
  x: number,
  y: number,
  size: Size,
  viewport: Viewport,
): { x: number; y: number } {
  const maxX = viewport.width - KEEP_VISIBLE;
  const maxY = viewport.height - KEEP_VISIBLE;
  const minX = KEEP_VISIBLE - size.width;

  return {
    x: Math.round(Math.min(Math.max(x, minX), Math.max(maxX, minX))),
    y: Math.round(Math.min(Math.max(y, 0), Math.max(maxY, 0))),
  };
}

/** Shrink a window that no longer fits, then pull it back into view. */
export function clampRect(rect: Rect, minSize: Size, viewport: Viewport): Rect {
  const width = Math.max(minSize.width, Math.min(rect.width, viewport.width));
  const height = Math.max(minSize.height, Math.min(rect.height, viewport.height));
  const { x, y } = clampPosition(rect.x, rect.y, { width, height }, viewport);
  return { x, y, width, height };
}

/**
 * Where a newly opened window should appear: centred, then cascaded by the
 * number of windows already open so each one stays clickable.
 */
export function cascadePosition(
  size: Size,
  openCount: number,
  viewport: Viewport,
): { x: number; y: number } {
  const step = (openCount % CASCADE_WRAP) * CASCADE_STEP;
  const baseX = Math.round((viewport.width - size.width) / 2) - CASCADE_WRAP * CASCADE_STEP / 2;
  const baseY = Math.round((viewport.height - size.height) / 3) - CASCADE_WRAP * CASCADE_STEP / 2;

  return clampPosition(
    Math.max(baseX, 24) + step,
    Math.max(baseY, 24) + step,
    size,
    viewport,
  );
}

/** A window never exceeds the viewport it is opened into. */
export function fitSize(defaultSize: Size, minSize: Size, viewport: Viewport): Size {
  return {
    width: Math.max(minSize.width, Math.min(defaultSize.width, viewport.width - 48)),
    height: Math.max(minSize.height, Math.min(defaultSize.height, viewport.height - 48)),
  };
}

export function rectOf(win: WindowState): Rect {
  return { x: win.x, y: win.y, width: win.width, height: win.height };
}
