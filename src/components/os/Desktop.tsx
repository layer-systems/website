import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { DesktopIcon } from './DesktopIcon';
import { FolderView } from './FolderView';
import { AppGlyph, FolderGlyph } from './HomeGlyph';
import { HomeIconMenu } from './HomeIconMenu';
import { WindowLayer } from './WindowLayer';
import { useWindowManager } from '@/os/useWindowManager';
import { MENUBAR_HEIGHT } from '@/os/layout';
import { swapDesktopSlots, type DesktopSlot, type GridGeometry } from '@/os/iconLayout';
import { useHomeScreen } from '@/hooks/useHomeScreen';
import { isFolderId } from '@/lib/appFolders';
import type { DragPoint } from '@/os/useIconDrag';

const CELL_WIDTH = 96;
const CELL_HEIGHT = 92;
const SURFACE_PADDING = 12;
const DRAG_THRESHOLD = 6;
/** Offsets from a cell's corner to the centre of its icon tile (button padding + half the tile). */
const GLYPH_CENTER_X = 40;
const GLYPH_CENTER_Y = 32;
/** How close to an icon's centre a drop has to land to group rather than move. */
const MERGE_RADIUS = 28;

function geometryFor(width: number, height: number): GridGeometry {
  return {
    columns: Math.max(1, Math.floor((width - SURFACE_PADDING * 2) / CELL_WIDTH)),
    rows: Math.max(1, Math.floor((height - SURFACE_PADDING * 2) / CELL_HEIGHT)),
  };
}

/**
 * The desktop surface: dot-grid wallpaper, the app and folder icons, and the
 * layer the windows are positioned inside. Window coordinates are relative to
 * this box, which is why it sits below the menu bar rather than at the
 * viewport origin.
 */
export function Desktop() {
  const { openApp, windows, minimizeAll, closeAll } = useWindowManager();
  const [selected, setSelected] = useState<string | null>(null);
  const [surfaceSize, setSurfaceSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight - MENUBAR_HEIGHT }));
  const [dragging, setDragging] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<{ col: number; row: number } | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedLayout, setPickedLayout] = useState<DesktopSlot[] | null>(null);
  const [openFolder, setOpenFolder] = useState<{ id: string; renaming: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pointerStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const geometry = useMemo(() => geometryFor(surfaceSize.width, surfaceSize.height), [surfaceSize]);
  const home = useHomeScreen(geometry);
  const { appsById, foldersById, items, layout, setDesktop, reset, labelOf } = home;
  const slots = layout.desktop;

  useEffect(() => {
    const onResize = () => setSurfaceSize({ width: window.innerWidth, height: window.innerHeight - MENUBAR_HEIGHT });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cellAt = useCallback((clientX: number, clientY: number) => ({
    col: Math.max(0, Math.min(geometry.columns - 1, Math.round((clientX - SURFACE_PADDING - GLYPH_CENTER_X) / CELL_WIDTH))),
    row: Math.max(0, Math.min(geometry.rows - 1, Math.round((clientY - MENUBAR_HEIGHT - SURFACE_PADDING - 38) / CELL_HEIGHT))),
  }), [geometry]);

  /** The icon an app dragged to this point would be grouped with, if any. Folders never group. */
  const mergeTargetAt = useCallback((point: DragPoint, draggedId: string): string | null => {
    if (isFolderId(draggedId)) return null;
    const cell = cellAt(point.x, point.y);
    const occupant = slots.find((slot) => slot.col === cell.col && slot.row === cell.row && slot.id !== draggedId);
    if (!occupant) return null;
    const centerX = SURFACE_PADDING + cell.col * CELL_WIDTH + GLYPH_CENTER_X;
    const centerY = MENUBAR_HEIGHT + SURFACE_PADDING + cell.row * CELL_HEIGHT + GLYPH_CENTER_Y;
    return Math.hypot(point.x - centerX, point.y - centerY) <= MERGE_RADIUS ? occupant.id : null;
  }, [cellAt, slots]);

  const move = useCallback((id: string, target: { col: number; row: number }) => {
    setDesktop((current) => swapDesktopSlots(current, id, target));
    const occupied = slots.find((slot) => slot.col === target.col && slot.row === target.row && slot.id !== id);
    setAnnouncement(occupied
      ? `${labelOf(id)} swapped positions with ${labelOf(occupied.id)}.`
      : `${labelOf(id)} moved to column ${target.col + 1}, row ${target.row + 1}.`);
  }, [labelOf, setDesktop, slots]);

  /** Groups `draggedId` with `targetId` and says so. */
  const group = useCallback((draggedId: string, targetId: string) => {
    const folder = home.merge(draggedId, targetId);
    if (!folder) return;
    setSelected(folder.id);
    setAnnouncement(isFolderId(targetId)
      ? `${labelOf(draggedId)} added to ${folder.name}.`
      : `New folder ${folder.name} with ${labelOf(targetId)} and ${labelOf(draggedId)}.`);
  }, [home, labelOf]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const active = pointerStart.current;
    if (!active) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < DRAG_THRESHOLD) return;
    active.moved = true;
    setDragging(active.id);
    const point = { x: event.clientX, y: event.clientY };
    const over = mergeTargetAt(point, active.id);
    setMergeTarget(over);
    setCandidate(over ? null : cellAt(point.x, point.y));
  }, [cellAt, mergeTargetAt]);
  const finishPointer = useCallback((event: PointerEvent) => {
    const active = pointerStart.current;
    if (active?.moved) {
      const point = { x: event.clientX, y: event.clientY };
      const over = event.type === 'pointerup' ? mergeTargetAt(point, active.id) : null;
      if (over) group(active.id, over);
      else if (event.type === 'pointerup') {
        move(active.id, cellAt(point.x, point.y));
        setSelected(active.id);
      }
    }
    pointerStart.current = null;
    setDragging(null);
    setCandidate(null);
    setMergeTarget(null);
  }, [cellAt, group, mergeTargetAt, move]);

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
        setAnnouncement(`${labelOf(id)} dropped at column ${slot.col + 1}, row ${slot.row + 1}.`);
      } else {
        setPicked(id);
        setPickedLayout(slots);
        setAnnouncement(`${labelOf(id)} picked up. Use arrow keys to move, Enter to drop, Escape to cancel. To group it into a folder, open its menu with Shift+F10.`);
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

  const openItem = (id: string) => {
    if (isFolderId(id)) setOpenFolder({ id, renaming: false });
    else openApp(id);
  };

  const dropOutOfFolder = (appId: string, point: DragPoint) => {
    setOpenFolder(null);
    const over = mergeTargetAt(point, appId);
    if (over) {
      group(appId, over);
      return;
    }
    const source = home.folders.find((folder) => folder.apps.includes(appId));
    home.moveOut(appId, { cell: cellAt(point.x, point.y) });
    setSelected(appId);
    setAnnouncement(`${labelOf(appId)} moved out of ${source?.name ?? 'the folder'}.`);
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
          {/* `isolate` keeps the icons' z-indexes local so they stay beneath the
              (also isolated) window layer that follows in DOM order. */}
          <div className="absolute inset-0 isolate" aria-label="Desktop app grid">
            {items.map((id) => {
              const slot = slots.find((item) => item.id === id);
              const folder = foldersById.get(id);
              const app = appsById.get(id);
              if (!slot || (!folder && !app)) return null;
              const isCandidate = dragging === id && candidate;
              const displaySlot = isCandidate ? candidate : slot;
              const isMergeTarget = mergeTarget === id;
              return (
                <HomeIconMenu
                  key={id}
                  id={id}
                  home={home}
                  announce={setAnnouncement}
                  onOpen={() => openItem(id)}
                  onRename={folder ? () => setOpenFolder({ id, renaming: true }) : undefined}
                >
                  <DesktopIcon
                    itemId={id}
                    label={folder?.name ?? app!.title}
                    aria-label={folder
                      ? `Folder ${folder.name}, ${folder.apps.length} apps`
                      : `${app!.title} — ${app!.description}`}
                    glyph={folder
                      ? <FolderGlyph folder={folder} appsById={appsById} size="desktop" mergeTarget={isMergeTarget} />
                      : <AppGlyph app={app!} size="desktop" mergeTarget={isMergeTarget} />}
                    selected={selected === id}
                    dragging={dragging === id}
                    pickedUp={picked === id}
                    tabIndex={0}
                    style={{ position: 'absolute', left: SURFACE_PADDING + displaySlot.col * CELL_WIDTH, top: SURFACE_PADDING + displaySlot.row * CELL_HEIGHT, zIndex: dragging === id ? 2 : 1 }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      pointerStart.current = { id, x: event.clientX, y: event.clientY, moved: false };
                      setSelected(id);
                    }}
                    onKeyDown={(event) => iconKeyDown(id, event)}
                    onSelect={() => { if (!pointerStart.current?.moved) setSelected(id); }}
                    onOpen={() => openItem(id)}
                  />
                </HomeIconMenu>
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
      <FolderView
        folder={openFolder ? foldersById.get(openFolder.id) : undefined}
        home={home}
        size="desktop"
        renaming={openFolder?.renaming ?? false}
        onClose={() => setOpenFolder(null)}
        onOpenApp={(appId) => {
          setOpenFolder(null);
          openApp(appId);
        }}
        onDropOutside={dropOutOfFolder}
      />
      <span id="icon-layout-status" className="sr-only" aria-live="polite">{announcement}</span>
    </>
  );
}
