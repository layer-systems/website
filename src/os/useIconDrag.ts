import { useCallback, useEffect, useRef, useState } from 'react';
import { menuOpenedAfter } from './menuTiming';

const DRAG_THRESHOLD = 8;
/** How long a finger rests on an icon before it lifts, like a phone home screen. */
const TOUCH_HOLD_MS = 350;

export interface DragPoint {
  x: number;
  y: number;
}

interface Options {
  onMove?: (id: string, point: DragPoint) => void;
  onDrop: (id: string, point: DragPoint) => void;
  onCancel?: (id: string) => void;
}

interface Active {
  id: string;
  x: number;
  y: number;
  startedAt: number;
  touch: boolean;
  armed: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Pointer dragging for home-screen icons that behaves on a phone the way a
 * phone does: a mouse drags as soon as it moves, but a finger has to rest on
 * the icon briefly first — a quick swipe still scrolls the page. Once an icon
 * is lifted, touch scrolling is blocked so the finger moves the icon instead.
 *
 * The lifted icon follows the pointer via `offset`; give it
 * `pointer-events: none` while dragging so hit-testing sees what is beneath.
 */
export function useIconDrag({ onMove, onDrop, onCancel }: Options) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const active = useRef<Active | null>(null);
  const dropped = useRef<{ id: string; at: number } | null>(null);
  const handlers = useRef({ onMove, onDrop, onCancel });
  useEffect(() => {
    handlers.current = { onMove, onDrop, onCancel };
  });

  const arm = useCallback((state: Active) => {
    state.armed = true;
    setDragging(state.id);
    setOffset({ dx: 0, dy: 0 });
    if (state.touch) navigator.vibrate?.(10);
  }, []);

  const clear = useCallback(() => {
    clearTimeout(active.current?.timer);
    active.current = null;
    setDragging(null);
    setOffset({ dx: 0, dy: 0 });
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const state = active.current;
      if (!state) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.armed) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (state.touch) {
          // Moved before the hold completed: that's a scroll, not a drag.
          clear();
          return;
        }
        arm(state);
      }
      // The long-press menu opened over a resting finger: the menu wins.
      if (menuOpenedAfter(state.startedAt)) {
        handlers.current.onCancel?.(state.id);
        clear();
        return;
      }
      setOffset({ dx, dy });
      handlers.current.onMove?.(state.id, { x: event.clientX, y: event.clientY });
    };
    const onPointerUp = (event: PointerEvent) => {
      const state = active.current;
      if (!state) return;
      if (state.armed && !menuOpenedAfter(state.startedAt)) {
        dropped.current = { id: state.id, at: Date.now() };
        handlers.current.onDrop(state.id, { x: event.clientX, y: event.clientY });
      } else if (state.armed) {
        handlers.current.onCancel?.(state.id);
      }
      clear();
    };
    const onPointerCancel = () => {
      const state = active.current;
      if (state?.armed) handlers.current.onCancel?.(state.id);
      clear();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (active.current?.armed) event.preventDefault();
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('touchmove', onTouchMove);
      clearTimeout(active.current?.timer);
    };
  }, [arm, clear]);

  const startDrag = useCallback((id: string, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    clearTimeout(active.current?.timer);
    const state: Active = {
      id,
      x: event.clientX,
      y: event.clientY,
      startedAt: Date.now(),
      touch: event.pointerType !== 'mouse',
      armed: false,
    };
    if (state.touch) state.timer = setTimeout(() => { if (active.current === state) arm(state); }, TOUCH_HOLD_MS);
    active.current = state;
  }, [arm]);

  /**
   * True for the click that follows dropping icon `id`, so it doesn't open
   * the app. Scoped to that icon and to a short window: touch browsers often
   * send no click after a drag at all, and a leftover flag would swallow the
   * next real tap — on this or any other icon.
   */
  const consumeClick = useCallback((id: string) => {
    const last = dropped.current;
    if (!last || last.id !== id || Date.now() - last.at > 400) return false;
    dropped.current = null;
    return true;
  }, []);

  return { dragging, offset, startDrag, consumeClick };
}
