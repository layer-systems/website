import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';
import { getViewport } from './layout';
import type { Rect, Size } from './types';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

interface UseResizeOptions {
  targetRef: React.RefObject<HTMLElement | null>;
  getRect: () => Rect;
  minSize: Size;
  onStart?: () => void;
  onCommit: (rect: Rect) => void;
}

/**
 * Computes the new geometry for a drag on one of the eight handles.
 *
 * Dragging a north or west edge moves the origin as well as the size, and the
 * minimum size has to pin the moving edge — otherwise a window shrunk past its
 * minimum would keep sliding while refusing to get smaller.
 */
function resolveRect(
  handle: ResizeHandle,
  start: Rect,
  dx: number,
  dy: number,
  minSize: Size,
): Rect {
  let { x, y, width, height } = start;

  if (handle.includes('e')) {
    width = Math.max(minSize.width, start.width + dx);
  }
  if (handle.includes('s')) {
    height = Math.max(minSize.height, start.height + dy);
  }
  if (handle.includes('w')) {
    width = Math.max(minSize.width, start.width - dx);
    x = start.x + (start.width - width);
  }
  if (handle.includes('n')) {
    height = Math.max(minSize.height, start.height - dy);
    y = start.y + (start.height - height);
  }

  // Never let the title bar escape above the desktop origin.
  if (y < 0) {
    height += y;
    y = 0;
  }

  const viewport = getViewport();
  width = Math.min(width, viewport.width);
  height = Math.min(height, viewport.height);

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Pointer-driven window resizing, written to the DOM until release. */
export function useResize({ targetRef, getRect, minSize, onStart, onCommit }: UseResizeOptions) {
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(
    (handle: ResizeHandle) => (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      const element = targetRef.current;
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();
      onStart?.();

      const start = getRect();
      const startX = event.clientX;
      const startY = event.clientY;
      let rect = start;

      const onMove = (moveEvent: globalThis.PointerEvent) => {
        rect = resolveRect(
          handle,
          start,
          moveEvent.clientX - startX,
          moveEvent.clientY - startY,
          minSize,
        );
        element.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
      };

      const settle = (final: Rect) => {
        cleanupRef.current?.();
        onCommit(final);
      };

      const onUp = () => settle(rect);
      const onCancel = () => settle(start);

      cleanupRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        document.body.classList.remove('os-dragging');
        cleanupRef.current = undefined;
      };

      document.body.classList.add('os-dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [getRect, minSize, onCommit, onStart, targetRef],
  );
}
