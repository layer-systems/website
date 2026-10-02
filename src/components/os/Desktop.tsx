import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { desktopApps, getApp } from '@/os/registry';
import { MENUBAR_HEIGHT } from '@/os/layout';
import { swapDesktopSlots, type DesktopSlot, type GridGeometry } from '@/os/iconLayout';
import { useIconLayout } from '@/os/useIconLayout';
import { isInFolderDialog, useIconDrag, type IconDrag } from '@/os/useIconDrag';
import { useAppFolders } from '@/os/appFoldersContext';
import { AppContextMenu, AppFolderControls, DragGhost, FolderTile } from './AppFolderControls';

const CELL_WIDTH = 96;
const CELL_HEIGHT = 92;
const SURFACE_PADDING = 12;
/** Half the size of the square around an icon's center that groups apps on release. */
const MERGE_RADIUS = 28;

type DropTarget = { kind: 'merge'; id: string } | { kind: 'cell'; col: number; row: number };

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
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [surfaceSize, setSurfaceSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight - MENUBAR_HEIGHT }));
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedLayout, setPickedLayout] = useState<DesktopSlot[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const apps = desktopApps();
  const { folders, moveApp, groupApps } = useAppFolders();
  const nested = new Set(folders.flatMap((folder) => folder.appIds));
  const topApps = apps.filter((app) => !nested.has(app.id));
  const topIds = [...topApps.map((app) => app.id), ...folders.map((folder) => folder.id)];
  const geometry = useMemo(() => geometryFor(surfaceSize.width, surfaceSize.height), [surfaceSize]);
  const { layout, setDesktop, reset } = useIconLayout(topIds, geometry);
  const slots = layout.desktop;
  const labelFor = useCallback(
    (id: string) => getApp(id)?.title ?? folders.find((folder) => folder.id === id)?.name ?? id,
    [folders],
  );

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
    setAnnouncement(occupied ? `${labelFor(id)} swapped positions with ${labelFor(occupied.id)}.` : `${labelFor(id)} moved to column ${target.col + 1}, row ${target.row + 1}.`);
  }, [labelFor, setDesktop, slots]);

  const resolveTarget = ({ id, fromFolder, x, y }: Omit<IconDrag<DropTarget>, 'target'>): DropTarget | null => {
    // Releasing inside the open folder keeps the app where it is.
    if (fromFolder && openFolder && isInFolderDialog(x, y)) return null;
    const cell = cellAt(x, y);
    const occupant = slots.find((slot) => slot.col === cell.col && slot.row === cell.row && slot.id !== id);
    if (occupant && !id.startsWith('folder:')) {
      const centerX = SURFACE_PADDING + cell.col * CELL_WIDTH + 40;
      const centerY = MENUBAR_HEIGHT + SURFACE_PADDING + cell.row * CELL_HEIGHT + 32;
      if (Math.abs(x - centerX) <= MERGE_RADIUS && Math.abs(y - centerY) <= MERGE_RADIUS) return { kind: 'merge', id: occupant.id };
    }
    return { kind: 'cell', ...cell };
  };

  const onDrop = ({ id, fromFolder, target }: IconDrag<DropTarget>) => {
    if (!target) return;
    if (target.kind === 'merge') {
      if (target.id.startsWith('folder:')) {
        moveApp(id, target.id);
        setSelected(target.id);
        setAnnouncement(`${labelFor(id)} moved into ${labelFor(target.id)}.`);
        return;
      }
      const folder = groupApps(target.id, id);
      if (!folder) return;
      // The new folder takes the place of the app it was dropped on.
      setDesktop((current) => current.map((slot) => slot.id === target.id ? { ...slot, id: folder.id } : slot));
      setSelected(folder.id);
      setAnnouncement(`Created folder ${folder.name} with ${labelFor(target.id)} and ${labelFor(id)}.`);
      return;
    }
    setSelected(id);
    if (fromFolder) {
      moveApp(id, null);
      setDesktop((current) => [...current, { id, col: target.col, row: target.row }]);
      setAnnouncement(`${labelFor(id)} removed from ${labelFor(fromFolder)}.`);
      return;
    }
    move(id, target);
  };

  const { drag, begin, isDropClick } = useIconDrag<DropTarget>({
    resolveTarget,
    onDrop,
    onMove: ({ fromFolder, x, y }) => {
      // Leaving the folder with an app closes it, so the desktop is visible for the drop.
      if (fromFolder && openFolder && !isInFolderDialog(x, y)) setOpenFolder(null);
    },
  });
  const mergeId = drag?.target?.kind === 'merge' ? drag.target.id : null;
  const dropCell = drag?.target?.kind === 'cell' ? drag.target : null;
  const sourceSlot = drag ? slots.find((slot) => slot.id === drag.id) : undefined;
  const showDropCell = dropCell && !(sourceSlot && sourceSlot.col === dropCell.col && sourceSlot.row === dropCell.row);

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
        setAnnouncement(`${labelFor(id)} dropped at column ${slot.col + 1}, row ${slot.row + 1}.`);
      } else {
        setPicked(id);
        setPickedLayout(slots);
        setAnnouncement(`${labelFor(id)} picked up. Use arrow keys to move, Enter to drop, Escape to cancel.`);
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
          {/* `isolate` keeps the icons' z-indexes local so they stay beneath the
              (also isolated) window layer that follows in DOM order. */}
          <div className="absolute inset-0 isolate" aria-label="Desktop app grid">
            {showDropCell && (
              <div
                aria-hidden
                className="pointer-events-none absolute size-20 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5"
                style={{ left: SURFACE_PADDING + dropCell.col * CELL_WIDTH, top: SURFACE_PADDING + dropCell.row * CELL_HEIGHT }}
              />
            )}
            {topApps.map((app) => {
              const slot = slots.find((item) => item.id === app.id);
              if (!slot) return null;
              return (
                <AppContextMenu key={app.id} appId={app.id} onOpen={() => openApp(app.id)}>
                  <div style={{ position: 'absolute', left: SURFACE_PADDING + slot.col * CELL_WIDTH, top: SURFACE_PADDING + slot.row * CELL_HEIGHT, zIndex: mergeId === app.id ? 2 : 1 }}>
                    <DesktopIcon
                      app={app}
                      selected={selected === app.id}
                      dragging={drag?.id === app.id}
                      pickedUp={picked === app.id}
                      mergeTarget={mergeId === app.id}
                      tabIndex={0}
                      onPointerDown={(event) => {
                        begin(app.id, event);
                        if (event.button === 0) setSelected(app.id);
                      }}
                      onKeyDown={(event) => iconKeyDown(app.id, event)}
                      onSelect={() => { if (!isDropClick()) setSelected(app.id); }}
                      onOpen={() => openApp(app.id)}
                    />
                  </div>
                </AppContextMenu>
              );
            })}
            {folders.map((folder) => {
              const slot = slots.find((item) => item.id === folder.id);
              if (!slot) return null;
              return (
                <FolderTile
                  key={folder.id}
                  folder={folder}
                  selected={selected === folder.id}
                  dragging={drag?.id === folder.id}
                  pickedUp={picked === folder.id}
                  dropTarget={mergeId === folder.id}
                  onPointerDown={(event) => {
                    begin(folder.id, event);
                    if (event.button === 0) setSelected(folder.id);
                  }}
                  onKeyDown={(event) => iconKeyDown(folder.id, event)}
                  onSelect={() => { if (!isDropClick()) setSelected(folder.id); }}
                  onOpen={() => setOpenFolder(folder.id)}
                  style={{ position: 'absolute', left: SURFACE_PADDING + slot.col * CELL_WIDTH, top: SURFACE_PADDING + slot.row * CELL_HEIGHT, zIndex: mergeId === folder.id ? 2 : 1 }}
                />
              );
            })}
            <AppFolderControls
              openFolderId={openFolder}
              onCloseFolder={() => setOpenFolder(null)}
              onOpenApp={(id) => {
                if (isDropClick()) return;
                setOpenFolder(null);
                openApp(id);
              }}
              onAppPointerDown={(id, event) => begin(id, event, openFolder)}
              draggingId={drag?.fromFolder ? drag.id : null}
            />
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
      {drag && <DragGhost id={drag.id} x={drag.x} y={drag.y} merging={Boolean(mergeId)} />}
    </>
  );
}
