import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DesktopIcon } from './DesktopIcon';
import { FolderVisual } from './FolderIcon';
import { FolderDialog } from './FolderDialog';
import { FolderWindow } from './FolderWindow';
import { WindowLayer } from './WindowLayer';
import { useWindowManager } from '@/os/useWindowManager';
import { desktopApps, getApp } from '@/os/registry';
import { MENUBAR_HEIGHT } from '@/os/layout';
import { swapDesktopSlots, type DesktopSlot, type GridGeometry } from '@/os/iconLayout';
import { useIconLayout } from '@/os/useIconLayout';
import { useFolders } from '@/os/useFolders';
import { MAX_FOLDERS, type Folder } from '@/os/folders';

const CELL_WIDTH = 96;
const CELL_HEIGHT = 92;
const SURFACE_PADDING = 12;
const DRAG_THRESHOLD = 6;
/** Prefix that distinguishes folder entries from app entries on the grid. */
export const FOLDER_ID_PREFIX = 'folder:';

function geometryFor(width: number, height: number): GridGeometry {
  return {
    columns: Math.max(1, Math.floor((width - SURFACE_PADDING * 2) / CELL_WIDTH)),
    rows: Math.max(1, Math.floor((height - SURFACE_PADDING * 2) / CELL_HEIGHT)),
  };
}

/**
 * Context menus nest (icon menus inside the desktop menu), and Radix opens
 * the menu of every trigger in the bubble path. Real right-click is handled
 * by the innermost trigger; only touch long-presses bubble, so the inner
 * trigger swallows them before the desktop menu would also open.
 */
function stopTouchContextMenu(event: React.MouseEvent) {
  if ((event.nativeEvent as PointerEvent).pointerType === 'touch') event.stopPropagation();
}

interface FolderDialogState {
  open: boolean;
  /** Set when renaming an existing folder. */
  folder?: Folder;
  /** Set when creating a folder around an app ("New folder with X"). */
  appId?: string;
}

/**
 * The desktop surface: dot-grid wallpaper, the app icons and folders, and the
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
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedLayout, setPickedLayout] = useState<DesktopSlot[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>({ open: false });
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Folder | null>(null);
  const pointerStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const apps = desktopApps();
  const geometry = useMemo(() => geometryFor(surfaceSize.width, surfaceSize.height), [surfaceSize]);
  const appIds = apps.map((app) => app.id);
  const { folderState, createFolder, renameFolder, removeFolder, setAppFolder } = useFolders(appIds);
  const { layout, setDesktop, reset } = useIconLayout(appIds, geometry, folderState);
  const slots = layout.desktop;
  const { folders, membership } = folderState;

  const topLevelApps = useMemo(() => apps.filter((app) => !membership[app.id]), [apps, membership]);
  const folderContents = useMemo(() => {
    const map = new Map<string, typeof apps>();
    for (const folder of folders) map.set(folder.id, []);
    for (const app of apps) {
      const folderId = membership[app.id];
      if (folderId) map.get(folderId)?.push(app);
    }
    return map;
  }, [apps, folders, membership]);

  const folderTitle = useCallback(
    (id: string | null | undefined) => folders.find((folder) => folder.id === id)?.name,
    [folders],
  );

  // Screen-reader announcements name entries the way the user sees them.
  const entryLabel = useCallback(
    (id: string) => (id.startsWith(FOLDER_ID_PREFIX) ? folderTitle(id.slice(FOLDER_ID_PREFIX.length)) : getApp(id)?.title) ?? id,
    [folderTitle],
  );

  const moveToFolder = useCallback((appId: string, folderId: string) => {
    setAppFolder(appId, folderId);
    setAnnouncement(`${entryLabel(appId)} moved into folder ${folderTitle(folderId) ?? folderId}.`);
  }, [setAppFolder, folderTitle, entryLabel]);

  const removeFromFolder = useCallback((appId: string) => {
    setAppFolder(appId, null);
    setAnnouncement(`${entryLabel(appId)} moved out of ${folderTitle(membership[appId]) ?? 'its folder'} to the desktop.`);
  }, [setAppFolder, folderTitle, membership, entryLabel]);

  const deleteFolder = useCallback((folder: Folder) => {
    removeFolder(folder.id);
    setOpenFolderId((current) => (current === folder.id ? null : current));
    setConfirmDelete(null);
    setAnnouncement(`Folder ${folder.name} deleted. Its apps moved back to the desktop.`);
  }, [removeFolder]);

  const submitFolderDialog = useCallback((name: string) => {
    if (folderDialog.folder) {
      renameFolder(folderDialog.folder.id, name);
      setAnnouncement(`Folder renamed to ${name}.`);
    } else {
      const id = createFolder(name);
      if (folderDialog.appId) {
        setAppFolder(folderDialog.appId, id);
        setAnnouncement(`Folder ${name} created with ${getApp(folderDialog.appId)?.title ?? folderDialog.appId} inside.`);
      } else {
        setAnnouncement(`Folder ${name} created.`);
      }
    }
  }, [folderDialog, createFolder, renameFolder, setAppFolder]);

  const requestDeleteFolder = useCallback((folder: Folder) => {
    if ((folderContents.get(folder.id) ?? []).length === 0) deleteFolder(folder);
    else setConfirmDelete(folder);
  }, [folderContents, deleteFolder]);

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
    setAnnouncement(occupied ? `${entryLabel(id)} swapped positions with ${entryLabel(occupied.id)}.` : `${entryLabel(id)} moved to column ${target.col + 1}, row ${target.row + 1}.`);
  }, [setDesktop, slots, entryLabel]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const active = pointerStart.current;
    if (!active) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < DRAG_THRESHOLD) return;
    active.moved = true;
    setDragging(active.id);
    setCandidate(cellAt(event.clientX, event.clientY));
    // Dragging an app over a folder icon highlights it as a drop target.
    if (!active.id.startsWith(FOLDER_ID_PREFIX)) {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-icon-id]');
      const over = hit?.dataset.iconId;
      setDropFolder(over?.startsWith(FOLDER_ID_PREFIX) && over !== active.id ? over : null);
    }
  }, [cellAt]);
  const finishPointer = useCallback((event: PointerEvent) => {
    const active = pointerStart.current;
    if (active?.moved) {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-icon-id]');
      const over = hit?.dataset.iconId;
      if (!active.id.startsWith(FOLDER_ID_PREFIX) && over?.startsWith(FOLDER_ID_PREFIX) && over !== active.id) {
        moveToFolder(active.id, over.slice(FOLDER_ID_PREFIX.length));
      } else {
        move(active.id, cellAt(event.clientX, event.clientY));
      }
      setSelected(active.id);
    }
    pointerStart.current = null;
    setDragging(null);
    setCandidate(null);
    setDropFolder(null);
  }, [cellAt, move, moveToFolder]);

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
        setAnnouncement(`${entryLabel(id)} dropped at column ${slot.col + 1}, row ${slot.row + 1}.`);
      } else {
        setPicked(id);
        setPickedLayout(slots);
        setAnnouncement(`${entryLabel(id)} picked up. Use arrow keys to move, F to move into a folder, Enter to drop, Escape to cancel.`);
      }
      return;
    }
    if (!picked) return;
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      if (id.startsWith(FOLDER_ID_PREFIX)) {
        setAnnouncement('Folders cannot be placed inside other folders.');
        return;
      }
      if (folders.length === 0) {
        setAnnouncement('No folders yet. Right-click an app and choose “New folder with it” to create one.');
        return;
      }
      setAnnouncement(`Move ${entryLabel(id)} into which folder? Press 1 to ${Math.min(9, folders.length)}: ${folders.slice(0, 9).map((folder, index) => `${index + 1} for ${folder.name}`).join(', ')}.`);
      return;
    }
    if (/^[1-9]$/.test(event.key) && !id.startsWith(FOLDER_ID_PREFIX)) {
      const target = folders[Number(event.key) - 1];
      if (target) {
        event.preventDefault();
        setPicked(null);
        setPickedLayout(null);
        moveToFolder(id, target.id);
      }
      return;
    }
    const offsets: Record<string, { col: number; row: number }> = {
      ArrowLeft: { col: -1, row: 0 }, ArrowRight: { col: 1, row: 0 }, ArrowUp: { col: 0, row: -1 }, ArrowDown: { col: 0, row: 1 },
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const target = { col: Math.max(0, Math.min(geometry.columns - 1, slot.col + offset.col)), row: Math.max(0, Math.min(geometry.rows - 1, slot.row + offset.row)) };
    move(id, target);
  };

  const openFolder = openFolderId ? folders.find((folder) => folder.id === openFolderId) : undefined;
  const openFolderSlot = openFolder ? slots.find((item) => item.id === `${FOLDER_ID_PREFIX}${openFolder.id}`) : undefined;

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
            {topLevelApps.map((app) => {
              const slot = slots.find((item) => item.id === app.id);
              if (!slot) return null;
              const isCandidate = dragging === app.id && candidate;
              const displaySlot = isCandidate ? candidate : slot;
              return (
                <ContextMenu key={app.id}>
                  <ContextMenuTrigger asChild>
                    <DesktopIcon
                      app={app}
                      selected={selected === app.id}
                      dragging={dragging === app.id}
                      pickedUp={picked === app.id}
                      tabIndex={0}
                      style={{ position: 'absolute', left: SURFACE_PADDING + displaySlot.col * CELL_WIDTH, top: SURFACE_PADDING + displaySlot.row * CELL_HEIGHT, zIndex: dragging === app.id ? 2 : 1 }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        pointerStart.current = { id: app.id, x: event.clientX, y: event.clientY, moved: false };
                        setSelected(app.id);
                      }}
                      onContextMenu={stopTouchContextMenu}
                      onKeyDown={(event) => iconKeyDown(app.id, event)}
                      onSelect={() => { if (!pointerStart.current?.moved) setSelected(app.id); }}
                      onOpen={() => openApp(app.id)}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem onSelect={() => openApp(app.id)}>Open</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>Move to folder</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-48">
                        {folders.length === 0 && <ContextMenuItem disabled>No folders yet</ContextMenuItem>}
                        {folders.map((folder) => (
                          <ContextMenuItem key={folder.id} onSelect={() => moveToFolder(app.id, folder.id)}>
                            {folder.name}
                          </ContextMenuItem>
                        ))}
                        {folders.length > 0 && <ContextMenuSeparator />}
                        <ContextMenuItem
                          disabled={folders.length >= MAX_FOLDERS}
                          onSelect={() => setFolderDialog({ open: true, appId: app.id })}
                        >
                          New folder with {app.title}…
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {folders.map((folder) => {
              const iconId = `${FOLDER_ID_PREFIX}${folder.id}`;
              const slot = slots.find((item) => item.id === iconId);
              if (!slot) return null;
              const contents = folderContents.get(folder.id) ?? [];
              const isCandidate = dragging === iconId && candidate;
              const displaySlot = isCandidate ? candidate : slot;
              return (
                <ContextMenu key={folder.id}>
                  <ContextMenuTrigger asChild>
                    <FolderVisual
                      label={folder.name}
                      count={contents.length}
                      badges={contents.slice(0, 3).map((app) => <app.icon key={app.id} className="size-2.5 text-primary" />)}
                      selected={selected === iconId || openFolderId === folder.id}
                      dragging={dragging === iconId}
                      pickedUp={picked === iconId}
                      dropTarget={dropFolder === iconId}
                      tabIndex={0}
                      style={{ position: 'absolute', left: SURFACE_PADDING + displaySlot.col * CELL_WIDTH, top: SURFACE_PADDING + displaySlot.row * CELL_HEIGHT, zIndex: dragging === iconId ? 2 : 1 }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        pointerStart.current = { id: iconId, x: event.clientX, y: event.clientY, moved: false };
                        setSelected(iconId);
                      }}
                      onContextMenu={stopTouchContextMenu}
                      onKeyDown={(event) => {
                        iconKeyDown(iconId, event);
                        if (event.defaultPrevented) return;
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          setOpenFolderId((current) => (current === folder.id ? null : folder.id));
                        }
                      }}
                      onSelect={() => { if (!pointerStart.current?.moved) setSelected(iconId); }}
                      onOpen={() => setOpenFolderId((current) => (current === folder.id ? null : folder.id))}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem onSelect={() => setOpenFolderId(folder.id)}>Open</ContextMenuItem>
                    <ContextMenuItem onSelect={() => setFolderDialog({ open: true, folder })}>Rename…</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => requestDeleteFolder(folder)}
                      className="text-destructive focus:text-destructive"
                    >
                      Delete folder
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {openFolder && openFolderSlot && (
              <div
                className="absolute z-3"
                style={{
                  left: Math.max(
                    SURFACE_PADDING,
                    Math.min(SURFACE_PADDING + openFolderSlot.col * CELL_WIDTH, surfaceSize.width - SURFACE_PADDING - 264),
                  ),
                  top: SURFACE_PADDING + (openFolderSlot.row + 1) * CELL_HEIGHT + 4,
                }}
              >
                <FolderWindow
                  folder={openFolder}
                  appIds={(folderContents.get(openFolder.id) ?? []).map((app) => app.id)}
                  onOpenApp={(appId) => openApp(appId)}
                  onRemoveApp={removeFromFolder}
                  onRename={() => setFolderDialog({ open: true, folder: openFolder })}
                  onDelete={() => requestDeleteFolder(openFolder)}
                />
              </div>
            )}
          </div>

          <WindowLayer />
        </main>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem
          disabled={folders.length >= MAX_FOLDERS}
          onSelect={() => setFolderDialog({ open: true })}
        >
          New folder
        </ContextMenuItem>
        <ContextMenuSeparator />
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

      <FolderDialog
        key={folderDialog.folder?.id ?? folderDialog.appId ?? 'new'}
        open={folderDialog.open}
        onOpenChange={(open) => setFolderDialog((current) => ({ ...current, open }))}
        folders={folders}
        folder={folderDialog.folder}
        onSubmit={submitFolderDialog}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The apps inside move back to the desktop. Nothing is uninstalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDelete) deleteFolder(confirmDelete); }}
            >
              Delete folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <span id="icon-layout-status" className="sr-only" aria-live="polite">{announcement}</span>
    </>
  );
}
