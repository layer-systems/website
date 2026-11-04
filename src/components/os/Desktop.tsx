import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { iconAtPoint, useIconDrag, type DragPoint } from '@/os/useIconDrag';
import { useHomeScreen } from '@/hooks/useHomeScreen';
import { isFolderId } from '@/lib/appFolders';

const CELL_WIDTH = 96;
const CELL_HEIGHT = 92;
const SURFACE_PADDING = 12;
/** Offsets from a cell's corner to the centre of its icon's tile (half the 80px button; padding + half the tile). */
const TILE_CENTER_X = 40;
const TILE_CENTER_Y = 32;

function geometryFor(width: number, height: number): GridGeometry {
  return {
    columns: Math.max(1, Math.floor((width - SURFACE_PADDING * 2) / CELL_WIDTH)),
    rows: Math.max(1, Math.floor((height - SURFACE_PADDING * 2) / CELL_HEIGHT)),
  };
}

type Cell = { col: number; row: number };

/** Where a dragged app would land: grouped with an icon, or in a grid cell. */
type DesktopDrop = { kind: 'group'; id: string } | { kind: 'cell'; cell: Cell };

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
  /** What the current drag would do on release — drawn as a preview. */
  const [preview, setPreview] = useState<DesktopDrop | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedLayout, setPickedLayout] = useState<DesktopSlot[] | null>(null);
  const [openFolder, setOpenFolder] = useState<{ id: string; renaming: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const geometry = useMemo(() => geometryFor(surfaceSize.width, surfaceSize.height), [surfaceSize]);
  const home = useHomeScreen(geometry);
  const { appsById, foldersById, items, layout, setDesktop, reset, labelOf } = home;
  const slots = layout.desktop;

  useEffect(() => {
    const onResize = () => setSurfaceSize({ width: window.innerWidth, height: window.innerHeight - MENUBAR_HEIGHT });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** The cell whose tile is nearest to `point` — the dragged tile's centre. */
  const cellAt = useCallback((point: DragPoint): Cell => ({
    col: Math.max(0, Math.min(geometry.columns - 1, Math.round((point.x - SURFACE_PADDING - TILE_CENTER_X) / CELL_WIDTH))),
    row: Math.max(0, Math.min(geometry.rows - 1, Math.round((point.y - MENUBAR_HEIGHT - SURFACE_PADDING - TILE_CENTER_Y) / CELL_HEIGHT))),
  }), [geometry]);

  /** Over another icon's tile groups (apps only — folders don't nest); anywhere else moves. */
  const dropAt = useCallback((point: DragPoint, draggedId: string): DesktopDrop => {
    const hit = iconAtPoint(point, 'data-icon-id', draggedId);
    if (hit?.onTile && !isFolderId(draggedId)) return { kind: 'group', id: hit.id };
    return { kind: 'cell', cell: cellAt(point) };
  }, [cellAt]);

  const move = useCallback((id: string, target: Cell) => {
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

  const drag = useIconDrag({
    onMove: (id, point) => setPreview(dropAt(point, id)),
    onDrop: (id, point) => {
      setPreview(null);
      const drop = dropAt(point, id);
      if (drop.kind === 'group') {
        group(id, drop.id);
      } else {
        move(id, drop.cell);
        setSelected(id);
      }
    },
    onCancel: () => setPreview(null),
  });

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
    const offsets: Record<string, Cell> = {
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
    setPreview(null);
    setOpenFolder(null);
    const drop = dropAt(point, appId);
    if (drop.kind === 'group') {
      group(appId, drop.id);
      return;
    }
    const source = home.folders.find((folder) => folder.apps.includes(appId));
    home.moveOut(appId, { cell: drop.cell });
    setSelected(appId);
    setAnnouncement(`${labelOf(appId)} moved out of ${source?.name ?? 'the folder'}.`);
  };

  const cellStyle = (cell: Cell): React.CSSProperties => ({
    position: 'absolute',
    left: SURFACE_PADDING + cell.col * CELL_WIDTH,
    top: SURFACE_PADDING + cell.row * CELL_HEIGHT,
  });

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
            {preview?.kind === 'cell' && (
              // Where the dragged icon will land.
              <div
                aria-hidden
                className="pointer-events-none h-19 w-20 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5"
                style={cellStyle(preview.cell)}
              />
            )}
            {items.map((id) => {
              const slot = slots.find((item) => item.id === id);
              const folder = foldersById.get(id);
              const app = appsById.get(id);
              if (!slot || (!folder && !app)) return null;
              const isDragging = drag.dragging === id;
              const isMergeTarget = preview?.kind === 'group' && preview.id === id;
              const dragProps = drag.iconProps(id);
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
                    dragging={isDragging}
                    lifted={drag.lifted === id}
                    pickedUp={picked === id}
                    tabIndex={0}
                    style={{
                      ...cellStyle(slot),
                      zIndex: isDragging ? 3 : 1,
                      translate: isDragging ? `${drag.offset.dx}px ${drag.offset.dy}px` : undefined,
                    }}
                    onPointerDown={(event) => {
                      if (event.button === 0) setSelected(id);
                      dragProps.onPointerDown(event);
                    }}
                    onContextMenu={dragProps.onContextMenu}
                    onKeyDown={(event) => iconKeyDown(id, event)}
                    onSelect={() => {
                      if (!drag.consumeClick(id)) setSelected(id);
                    }}
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
        onDragOutside={(appId, point) => setPreview(point ? dropAt(point, appId) : null)}
        onDropOutside={dropOutOfFolder}
      />
      <span id="icon-layout-status" className="sr-only" aria-live="polite">{announcement}</span>
    </>
  );
}
