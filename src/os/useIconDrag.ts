import { useCallback, useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD = 6;
/** Fingers wobble; a resting finger may drift this far before it counts as a swipe. */
const TOUCH_SLOP = 10;
/** How long a finger rests on an icon before it lifts, like a phone home screen. */
const TOUCH_HOLD_MS = 400;

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
  element: HTMLElement;
  x: number;
  y: number;
  touch: boolean;
  /** Touch: the hold completed and the icon is lifted. Mouse: the drag started. */
  lifted: boolean;
  /** Moved since lifting — a drag rather than a long-press. */
  dragging: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Pointer dragging for home-screen icons, shared by the desktop grid, the
 * mobile home screen and open folders.
 *
 * - **Mouse:** drags as soon as it moves a few pixels; right-click is the menu.
 * - **Touch / pen:** behaves like a phone. Resting a finger on an icon for a
 *   moment lifts it. Moving then drags it; letting go without moving opens the
 *   icon's long-press menu instead. A quick swipe never lifts anything, so the
 *   page still scrolls.
 *
 * The long-press menu is owned by this hook on touch: the browser's own
 * long-press `contextmenu` and Radix's long-press timer would otherwise pop the
 * menu up while the user is about to drag. Icons pass `onContextMenu` from
 * `iconProps` so that can be suppressed.
 *
 * While dragging, the icon follows the pointer via `offset`; give it
 * `pointer-events: none` so hit-testing sees what is beneath it.
 */
export function useIconDrag({ onMove, onDrop, onCancel }: Options) {
  const [lifted, setLifted] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const active = useRef<Active | null>(null);
  const dropped = useRef<{ id: string; at: number } | null>(null);
  /** Set while this hook itself opens a menu, so its own block lets it through. */
  const openingMenu = useRef(false);
  const handlers = useRef({ onMove, onDrop, onCancel });
  useEffect(() => {
    handlers.current = { onMove, onDrop, onCancel };
  });

  const clear = useCallback(() => {
    clearTimeout(active.current?.timer);
    active.current = null;
    setLifted(null);
    setDragging(null);
    setOffset({ dx: 0, dy: 0 });
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const state = active.current;
      if (!state) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.dragging) {
        const distance = Math.hypot(dx, dy);
        if (state.touch && !state.lifted) {
          // Moved before the hold completed: that's a scroll, not a drag.
          if (distance > TOUCH_SLOP) clear();
          return;
        }
        if (distance < (state.touch ? TOUCH_SLOP : DRAG_THRESHOLD)) return;
        state.lifted = true;
        state.dragging = true;
        setLifted(state.id);
        setDragging(state.id);
      }
      setOffset({ dx, dy });
      handlers.current.onMove?.(state.id, { x: event.clientX, y: event.clientY });
    };
    const onPointerUp = (event: PointerEvent) => {
      const state = active.current;
      if (!state) return;
      clear();
      if (state.dragging) {
        dropped.current = { id: state.id, at: Date.now() };
        handlers.current.onDrop(state.id, { x: event.clientX, y: event.clientY });
      } else if (state.touch && state.lifted) {
        // Held and released in place: the phone's long-press menu.
        dropped.current = { id: state.id, at: Date.now() };
        openingMenu.current = true;
        state.element.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
        }));
        openingMenu.current = false;
      }
    };
    const onPointerCancel = () => {
      const state = active.current;
      if (state?.dragging) handlers.current.onCancel?.(state.id);
      clear();
    };
    const onTouchMove = (event: TouchEvent) => {
      // A lifted icon moves with the finger instead of the page scrolling.
      if (active.current?.lifted && event.cancelable) event.preventDefault();
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
  }, [clear]);

  const onPointerDown = useCallback((id: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    clearTimeout(active.current?.timer);
    const state: Active = {
      id,
      element: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType !== 'mouse',
      lifted: false,
      dragging: false,
    };
    if (state.touch) {
      // Stops Radix's own long-press timer (it skips prevented events); this
      // hook decides between "drag" and "menu" once the finger moves or lifts.
      event.preventDefault();
      state.timer = setTimeout(() => {
        if (active.current !== state) return;
        state.lifted = true;
        setLifted(id);
        navigator.vibrate?.(10);
      }, TOUCH_HOLD_MS);
    }
    active.current = state;
  }, []);

  const onContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    // The browser's own long-press menu (Android) fires mid-hold; on touch the
    // menu only opens on release, from `onPointerUp` above.
    if (active.current?.touch && !openingMenu.current) event.preventDefault();
  }, []);

  /**
   * True for the click that follows dropping icon `id` (or its long-press), so
   * it doesn't also open the app. Scoped to that icon and a short window:
   * touch browsers often send no click at all, and a leftover flag would
   * swallow the next real tap.
   */
  const consumeClick = useCallback((id: string) => {
    const last = dropped.current;
    if (!last || last.id !== id || Date.now() - last.at > 600) return false;
    dropped.current = null;
    return true;
  }, []);

  /** Spread onto the icon element. */
  const iconProps = useCallback((id: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => onPointerDown(id, event),
    onContextMenu,
  }), [onContextMenu, onPointerDown]);

  return { lifted, dragging, offset, iconProps, consumeClick };
}

/**
 * The icon under `point`, found by geometry rather than `elementFromPoint`:
 * an open folder dialog makes the rest of the page inert to hit-testing, and
 * an app dragged out of it still has to find what it was released over.
 *
 * `onTile` is true over the icon's tile (padded a little, so it is easy to hit)
 * — the "group into a folder" zone; the label and gaps mean "move".
 */
export function iconAtPoint(
  point: DragPoint,
  attribute: string,
  exclude?: string,
): { id: string; onTile: boolean } | null {
  const inside = (rect: DOMRect, pad = 0) =>
    point.x >= rect.left - pad && point.x <= rect.right + pad && point.y >= rect.top - pad && point.y <= rect.bottom + pad;
  for (const element of document.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    const id = element.getAttribute(attribute);
    if (!id || id === exclude) continue;
    const tile = element.querySelector('[data-home-glyph]')?.getBoundingClientRect();
    if (tile && inside(tile, 8)) return { id, onTile: true };
    if (inside(element.getBoundingClientRect())) return { id, onTile: false };
  }
  return null;
}
