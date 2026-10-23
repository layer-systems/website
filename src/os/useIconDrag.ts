import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD = 6;
const LONG_PRESS_MS = 300;
const CLICK_SUPPRESS_MS = 400;

/** Classes that stop a long press from selecting text or opening the iOS callout. */
export const NO_TOUCH_CALLOUT = 'select-none [-webkit-touch-callout:none]';

/** Whether a point lies inside the open folder dialog. */
export function isInFolderDialog(x: number, y: number) {
  const rect = document.querySelector('[data-folder-dialog]')?.getBoundingClientRect();
  return Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
}

export interface IconDrag<T> {
  id: string;
  /** Folder the app is being dragged out of, if any. */
  fromFolder: string | null;
  x: number;
  y: number;
  target: T | null;
}

interface PendingDrag {
  id: string;
  fromFolder: string | null;
  x: number;
  y: number;
  active: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

interface Options<T> {
  resolveTarget: (drag: Omit<IconDrag<T>, 'target'>) => T | null;
  onDrop: (drag: IconDrag<T>) => void;
  onMove?: (drag: IconDrag<T>) => void;
}

/**
 * Pointer dragging for launcher icons. A mouse drag starts after a few pixels
 * of movement; touch needs a short press first so swipes still scroll.
 */
export function useIconDrag<T>(options: Options<T>) {
  const [drag, setDrag] = useState<IconDrag<T> | null>(null);
  const pending = useRef<PendingDrag | null>(null);
  const lastDrop = useRef(0);
  // The window listeners outlive renders, so they read the latest callbacks.
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });

  const update = useCallback((x: number, y: number) => {
    const current = pending.current;
    if (!current) return null;
    const base = { id: current.id, fromFolder: current.fromFolder, x, y };
    const next = { ...base, target: latest.current.resolveTarget(base) };
    setDrag(next);
    latest.current.onMove?.(next);
    return next;
  }, []);

  const clear = useCallback(() => {
    clearTimeout(pending.current?.timer);
    pending.current = null;
    setDrag(null);
  }, []);

  const begin = useCallback((id: string, event: React.PointerEvent, fromFolder: string | null = null) => {
    if (event.button !== 0) return;
    clearTimeout(pending.current?.timer);
    const { clientX: x, clientY: y } = event;
    const next: PendingDrag = { id, fromFolder, x, y, active: false };
    if (event.pointerType !== 'mouse') {
      next.timer = setTimeout(() => {
        if (pending.current !== next) return;
        next.active = true;
        navigator.vibrate?.(10);
        update(next.x, next.y);
      }, LONG_PRESS_MS);
    }
    pending.current = next;
  }, [update]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const current = pending.current;
      if (!current) return;
      if (!current.active) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD) return;
        if (event.pointerType !== 'mouse') {
          // Moved before the long press finished: the user is scrolling.
          clear();
          return;
        }
        current.active = true;
      }
      current.x = event.clientX;
      current.y = event.clientY;
      update(event.clientX, event.clientY);
    };
    const onPointerUp = (event: PointerEvent) => {
      const current = pending.current;
      if (current?.active) {
        lastDrop.current = Date.now();
        const next = update(event.clientX, event.clientY);
        if (next) latest.current.onDrop(next);
      }
      clear();
    };
    // While a touch drag is active the page must not scroll underneath it.
    const onTouchMove = (event: TouchEvent) => {
      if (pending.current?.active) event.preventDefault();
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', clear);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', clear);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [clear, update]);

  /** True for the click that a browser fires right after a drop. */
  const isDropClick = useCallback(() => Date.now() - lastDrop.current < CLICK_SUPPRESS_MS, []);

  return { drag, begin, isDropClick };
}
