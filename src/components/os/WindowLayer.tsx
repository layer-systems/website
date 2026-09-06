import { useState } from 'react';
import { WindowFrame } from './WindowFrame';
import { useWindowManager } from '@/os/useWindowManager';
import { getApp } from '@/os/registry';
import { getViewport, halfRect, maximizedRect } from '@/os/layout';
import type { SnapZone } from '@/os/useDrag';

/** Ghost rectangle shown while a window hovers over a snap edge. */
function SnapPreview({ zone }: { zone: Exclude<SnapZone, null> }) {
  const viewport = getViewport();
  const rect = zone === 'maximize' ? maximizedRect(viewport) : halfRect(zone, viewport);

  return (
    <div
      aria-hidden
      className="os-fade-in pointer-events-none absolute z-0 rounded-xl border-2 border-primary/60 bg-primary/10"
      style={{
        transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}

export function WindowLayer() {
  // Deliberately the unsorted list. `windows` from the context is sorted by
  // z-order, so raising a window reorders the DOM nodes; the browser then
  // replays the enter animation on the moved element. Stacking is already
  // handled by the inline `z-index` each frame sets, so render order is free
  // to stay stable.
  const { state, focusedId } = useWindowManager();
  const windows = state.windows;
  const [snap, setSnap] = useState<SnapZone>(null);

  return (
    <div className="pointer-events-none absolute inset-0">
      {snap && <SnapPreview zone={snap} />}

      {windows.map((win) => {
        const app = getApp(win.appId);
        if (!app) return null;
        return (
          <WindowFrame
            key={win.id}
            win={win}
            app={app}
            focused={focusedId === win.id}
            onSnapChange={setSnap}
          />
        );
      })}
    </div>
  );
}
