import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';
import { clampPosition, getViewport } from './layout';
import type { Rect } from './types';

/** How close to an edge the pointer must get before a snap is offered. */
const SNAP_THRESHOLD = 12;

export type SnapZone = 'left' | 'right' | 'maximize' | null;

interface UseDragOptions {
  /** The element to move. Written to directly while the gesture is live. */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Current committed geometry of the window. */
  getRect: () => Rect;
  disabled?: boolean;
  onStart?: () => void;
  onSnapChange?: (zone: SnapZone) => void;
  /** Called once on pointer-up with the final position (or the snap zone). */
  onCommit: (position: { x: number; y: number }, snap: SnapZone) => void;
}

/**
 * Pointer-driven window dragging.
 *
 * The position is written straight to the DOM for the duration of the gesture
 * and only dispatched to the reducer on release. Routing every pointermove
 * through React state would re-render the whole window stack on each frame.
 */
export function useDrag({
  targetRef,
  getRect,
  disabled,
  onStart,
  onSnapChange,
  onCommit,
}: UseDragOptions) {
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(
    (event: ReactPointerEvent) => {
      if (disabled || event.button !== 0) return;
      const element = targetRef.current;
      if (!element) return;

      event.preventDefault();
      onStart?.();

      const rect = getRect();
      const startX = event.clientX;
      const startY = event.clientY;
      let position = { x: rect.x, y: rect.y };
      let snap: SnapZone = null;

      const detectSnap = (clientX: number, clientY: number): SnapZone => {
        const viewport = getViewport();
        if (clientY <= SNAP_THRESHOLD) return 'maximize';
        if (clientX <= SNAP_THRESHOLD) return 'left';
        if (clientX >= viewport.width - SNAP_THRESHOLD) return 'right';
        return null;
      };

      const onMove = (moveEvent: globalThis.PointerEvent) => {
        const viewport = getViewport();
        position = clampPosition(
          rect.x + (moveEvent.clientX - startX),
          rect.y + (moveEvent.clientY - startY),
          rect,
          viewport,
        );
        element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;

        const zone = detectSnap(moveEvent.clientX, moveEvent.clientY);
        if (zone !== snap) {
          snap = zone;
          onSnapChange?.(zone);
        }
      };

      const finish = () => {
        cleanupRef.current?.();
        onSnapChange?.(null);
        onCommit(position, snap);
      };

      const onUp = () => finish();
      const onCancel = () => {
        cleanupRef.current?.();
        onSnapChange?.(null);
        onCommit({ x: rect.x, y: rect.y }, null);
      };

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
    [disabled, getRect, onCommit, onSnapChange, onStart, targetRef],
  );
}
