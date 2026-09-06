import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { DesktopIcon } from './DesktopIcon';
import { WindowLayer } from './WindowLayer';
import { useWindowManager } from '@/os/useWindowManager';
import { desktopApps } from '@/os/registry';
import { MENUBAR_HEIGHT } from '@/os/layout';
import { swapDesktopSlots, type DesktopSlot, type GridGeometry } from '@/os/iconLayout';
import { useIconLayout } from '@/os/useIconLayout';

const CELL_WIDTH = 96;
const CELL_HEIGHT = 92;
const SURFACE_PADDING = 12;
const DRAG_THRESHOLD = 6;

function geometryFor(width: number, height: number): GridGeometry {
  return {
    columns: Math.max(1, Math.floor((width - SURFACE_PADDING * 2) / CELL_WIDTH)),
    rows: Math.max(1, Math.floor((height - SURFACE_PADDING * 2) / CELL_HEIGHT)),
  };
}

/**
 * The desktop surface: dot-grid wallpaper, the app icons, and the layer the
 * windows are positioned inside. Window coordinates are relative to this box,
 * which is why it sits below the menu bar rather than at the viewport origin.
 */
export function Desktop() {
  const { openApp, windows, minimizeAll, closeAll } = useWindowManager();
  const [selected, setSelected] = useState<string | null>(null);
  const [surfaceSize, setSurfaceSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight - MENUBAR_HEIGHT }));
  const [dragging, setDragging] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<{ col: number; row: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedLayout, setPickedLayout] = useState<DesktopSlot[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pointerStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const apps = desktopApps();
  const geometry = useMemo(() => geometryFor(surfaceSize.width, surfaceSize.height), [surfaceSize]);
  const { layout, setDesktop, reset } = useIconLayout(apps.map((app) => app.id), geometry);
  const slots = layout.desktop;

  useEffect(() => {
    const onResize = () => setSurfaceSize({ width: window.innerWidth, height: window.innerHeight - MENUBAR_HEIGHT });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cellAt = useCallback((clientX: number, clientY: number) => ({
    col: Math.max(0, Math.min(geometry.columns - 1, Math.round((clientX - SURFACE_PADDING - 40) / CELL_WIDTH))),
    row: Math.max(0, Math.min(geometry.rows - 1, Math.round((clientY - MENUBAR_HEIGHT - SURFACE_PADDING - 38) / CELL_HEIGHT))),
  }), [geometry]);

  const move = useCallback((id: string, target: { col: number; row: number }) => {
    setDesktop((current) => swapDesktopSlots(current, id, target));
    const occupied = slots.find((slot) => slot.col === target.col && slot.row === target.row && slot.id !== id);
    setAnnouncement(occupied ? `${id} swapped positions with ${occupied.id}.` : `${id} moved to column ${target.col + 1}, row ${target.row + 1}.`);
  }, [setDesktop, slots]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const active = pointerStart.current;
    if (!active) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < DRAG_THRESHOLD) return;
    active.moved = true;
    setDragging(active.id);
    setCandidate(cellAt(event.clientX, event.clientY));
  }, [cellAt]);
  const finishPointer = useCallback((event: PointerEvent) => {
    const active = pointerStart.current;
    if (active?.moved) {
      const target = cellAt(event.clientX, event.clientY);
      move(active.id, target);
      setSelected(active.id);
    }
    pointerStart.current = null;
    setDragging(null);
    setCandidate(null);
  }, [cellAt, move]);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishPointer);
    window.addEventListener('pointercancel', finishPointer);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishPointer);
      window.removeEventListener('pointercancel', finishPointer);
    };
  }, [finishPointer, onPointerMove]);

  const iconKeyDown = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const slot = slots.find((item) => item.id === id);
    if (!slot) return;
    if (event.key === 'Escape' && picked) {
      event.preventDefault();
      if (pickedLayout) setDesktop(() => pickedLayout);
      setPicked(null);
      setPickedLayout(null);
      setAnnouncement('Move cancelled and original position restored.');
      return;
    }
    if (event.key === ' ' || (event.key === 'Enter' && picked === id)) {
      event.preventDefault();
      if (picked === id) {
        setPicked(null);
        setPickedLayout(null);
        setAnnouncement(`${id} dropped at column ${slot.col + 1}, row ${slot.row + 1}.`);
      } else {
        setPicked(id);
        setPickedLayout(slots);
        setAnnouncement(`${id} picked up. Use arrow keys to move, Enter to drop, Escape to cancel.`);
      }
      return;
    }
    const offsets: Record<string, { col: number; row: number }> = {
      ArrowLeft: { col: -1, row: 0 }, ArrowRight: { col: 1, row: 0 }, ArrowUp: { col: 0, row: -1 }, ArrowDown: { col: 0, row: 1 },
    };
    const offset = offsets[event.key];
    if (!offset || !picked) return;
    event.preventDefault();
    const target = { col: Math.max(0, Math.min(geometry.columns - 1, slot.col + offset.col)), row: Math.max(0, Math.min(geometry.rows - 1, slot.row + offset.row)) };
    move(id, target);
  };

  return (
    <>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <main
          className="os-desktop-surface absolute inset-x-0 bottom-0 overflow-hidden"
          style={{ top: MENUBAR_HEIGHT }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <div className="absolute inset-0" aria-label="Desktop app grid">
            {apps.map((app) => {
              const slot = slots.find((item) => item.id === app.id);
              if (!slot) return null;
              const isCandidate = dragging === app.id && candidate;
              const displaySlot = isCandidate ? candidate : slot;
              return (
                <DesktopIcon
                  key={app.id}
                  app={app}
                  selected={selected === app.id}
                  dragging={dragging === app.id}
                  pickedUp={picked === app.id}
                  tabIndex={selected === null || selected === app.id ? 0 : -1}
                  style={{ position: 'absolute', left: SURFACE_PADDING + displaySlot.col * CELL_WIDTH, top: SURFACE_PADDING + displaySlot.row * CELL_HEIGHT, zIndex: dragging === app.id ? 2 : 1 }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    pointerStart.current = { id: app.id, x: event.clientX, y: event.clientY, moved: false };
                    setSelected(app.id);
                  }}
                  onKeyDown={(event) => iconKeyDown(app.id, event)}
                  onSelect={() => { if (!pointerStart.current?.moved) setSelected(app.id); }}
                  onOpen={() => openApp(app.id)}
                />
              );
            })}
          </div>

          <WindowLayer />
        </main>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => openApp('feed')}>Open Feed</ContextMenuItem>
        <ContextMenuItem onSelect={() => openApp('settings')}>Open Settings</ContextMenuItem>
        <ContextMenuItem onSelect={() => { reset('desktop'); setAnnouncement('Desktop icon layout reset.'); }}>
          Reset desktop icon layout
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={windows.length === 0} onSelect={minimizeAll}>
          Minimize all windows
        </ContextMenuItem>
        <ContextMenuItem disabled={windows.length === 0} onSelect={closeAll}>
          Close all windows
        </ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>
      <span id="icon-layout-status" className="sr-only" aria-live="polite">{announcement}</span>
    </>
  );
}
