import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, FolderPlus, LayoutGrid, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginArea } from '@/components/auth/LoginArea';
import { NotificationsSheet } from '@/components/nostr/NotificationsCenter';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
import { Button } from '@/components/ui/button';
import { FolderVisual } from './FolderIcon';
import { FolderDialog } from './FolderDialog';
import { useWindowManager } from '@/os/useWindowManager';
import { desktopApps, getApp } from '@/os/registry';
import { cn } from '@/lib/utils';
import type { AppParams } from '@/os/types';
import { useIconLayout } from '@/os/useIconLayout';
import { useFolders } from '@/os/useFolders';
import { FOLDER_ID_PREFIX } from './Desktop';
import { MAX_FOLDERS, type Folder } from '@/os/folders';

const MOBILE_DRAG_THRESHOLD = 8;

/**
 * Tile context menus nest inside nothing else on the home screen, but a
 * long-press contextmenu event must never reach a surrounding menu.
 */
function stopTouchContextMenu(event: React.MouseEvent) {
  if ((event.nativeEvent as PointerEvent).pointerType === 'touch') event.stopPropagation();
}

/**
 * On a phone the window metaphor only gets in the way, so the same apps and
 * the same window state are presented as a home screen plus one full-screen
 * app at a time.
 */
export function MobileAppShell() {
  const {
    windows,
    focusedId,
    openApp,
    focusWindow,
    restoreWindow,
    closeWindow,
    setWindowTitle,
    setWindowParams,
  } = useWindowManager();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const active = useMemo(
    () => windows.find((win) => win.id === focusedId && !win.minimized),
    [windows, focusedId],
  );
  const activeApp = active ? getApp(active.appId) : undefined;
  const activeId = active?.id;

  // Stable per-window callbacks: apps set their title from an effect keyed on
  // `setTitle`, so a fresh function on every shell render would re-run it.
  const setTitle = useCallback(
    (title: string) => {
      if (activeId) setWindowTitle(activeId, title);
    },
    [activeId, setWindowTitle],
  );

  const setParams = useCallback(
    (params: AppParams) => {
      if (activeId) setWindowParams(activeId, params);
    },
    [activeId, setWindowParams],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="os-menubar-surface flex h-12 shrink-0 items-center gap-2 border-b border-os-window-border/60 px-3">
        {active ? (
          <button
            type="button"
            onClick={() => closeWindow(active.id)}
            className="-ml-1 flex items-center gap-1 rounded px-1 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronLeft className="size-5" aria-hidden />
            Home
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Zap className="size-4 text-primary" aria-hidden />
            LAYER.systems
          </span>
        )}

        <span className="mx-auto truncate text-sm font-medium">{active?.title}</span>

        <NotificationsSheet />

        {windows.length > 0 ? (
          <Sheet open={switcherOpen} onOpenChange={setSwitcherOpen}>
            <SheetTrigger
              className="rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="Open app switcher"
            >
              <LayoutGrid className="size-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[70vh]">
              <SheetHeader>
                <SheetTitle>Open apps</SheetTitle>
                <SheetDescription>Switch between the apps you have running.</SheetDescription>
              </SheetHeader>
              <div className="os-scroll overflow-y-auto px-4 pb-6">
                {[...windows].reverse().map((win) => {
                  const app = getApp(win.appId);
                  if (!app) return null;
                  return (
                    <button
                      key={win.id}
                      type="button"
                      onClick={() => {
                        // Focusing alone leaves a minimized window minimized,
                        // and the shell only renders a window that is focused
                        // *and* not minimized — the home screen would stay up.
                        if (win.minimized) restoreWindow(win.id);
                        else focusWindow(win.id);
                        setSwitcherOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left',
                        win.id === focusedId ? 'bg-accent' : 'hover:bg-muted',
                      )}
                    >
                      <app.icon className="size-5 text-primary" aria-hidden />
                      <span className="truncate text-sm font-medium">{win.title}</span>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <LoginArea />
        )}
      </header>

      <div className="os-scroll min-h-0 flex-1 overflow-hidden">
        {active && activeApp ? (
          <ErrorBoundary
            fallback={
              <div className="p-8 text-center text-sm text-muted-foreground">
                {active.title} stopped responding.
              </div>
            }
          >
            <Suspense fallback={<MobileSkeleton />}>
              <activeApp.component
                windowId={active.id}
                params={active.params}
                setTitle={setTitle}
                setParams={setParams}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <HomeScreen onOpen={openApp} />
        )}
      </div>
    </div>
  );
}

function HomeScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const apps = desktopApps();
  const [columns, setColumns] = useState(() => window.innerWidth < 480 ? 3 : 4);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedOrder, setPickedOrder] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; folder?: Folder; appId?: string }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<Folder | null>(null);
  const dragStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const targetRef = useRef<string | null>(null);
  const appIds = apps.map((app) => app.id);
  const { folderState, createFolder, renameFolder, removeFolder, setAppFolder } = useFolders(appIds);
  const { layout, setMobile } = useIconLayout(appIds, { columns, rows: Math.max(8, Math.ceil(apps.length / columns) + 4) }, folderState);
  const byId = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const { folders, membership } = folderState;
  const openFolder = openFolderId ? folders.find((folder) => folder.id === openFolderId) : undefined;

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

  const moveToFolder = (appId: string, folderId: string) => {
    setAppFolder(appId, folderId);
    setAnnouncement(`${entryLabel(appId)} moved into folder ${folderTitle(folderId) ?? folderId}.`);
  };
  // Kept current every render so the pointer-listeners effect below can call
  // the latest labeling logic without re-arming its global listeners.
  const moveToFolderRef = useRef(moveToFolder);
  useEffect(() => {
    moveToFolderRef.current = moveToFolder;
  });

  const removeFromFolder = (appId: string) => {
    setAppFolder(appId, null);
    setAnnouncement(`${entryLabel(appId)} moved out of ${folderTitle(membership[appId]) ?? 'its folder'} to the home screen.`);
  };

  const deleteFolder = (folder: Folder) => {
    removeFolder(folder.id);
    setOpenFolderId((current) => (current === folder.id ? null : current));
    setConfirmDelete(null);
    setAnnouncement(`Folder ${folder.name} deleted. Its apps moved back to the home screen.`);
  };

  const requestDeleteFolder = (folder: Folder) => {
    if ((folderContents.get(folder.id) ?? []).length === 0) deleteFolder(folder);
    else setConfirmDelete(folder);
  };

  useEffect(() => {
    const onResize = () => setColumns(window.innerWidth < 480 ? 3 : 4);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const reorder = useCallback((id: string, beforeId: string | null) => {
    setMobile((order) => {
      const without = order.filter((item) => item !== id);
      const index = beforeId ? without.indexOf(beforeId) : without.length;
      const next = [...without];
      next.splice(index < 0 ? next.length : index, 0, id);
      return next;
    });
    const position = beforeId ? Math.max(1, layout.mobile.indexOf(beforeId) + 1) : layout.mobile.length;
    setAnnouncement(`${entryLabel(id)} moved to position ${position}.`);
  }, [layout.mobile, setAnnouncement, setMobile, entryLabel]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const active = dragStart.current;
      if (!active) return;
      if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < MOBILE_DRAG_THRESHOLD) return;
      active.moved = true;
      setDragging(active.id);
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-home-icon-id]');
      const nextTarget = hit?.dataset.homeIconId ?? null;
      targetRef.current = nextTarget;
      setTarget(nextTarget);
    };
    const onEnd = () => {
      const active = dragStart.current;
      if (active?.moved) {
        suppressClick.current = true;
        const over = targetRef.current;
        if (!active.id.startsWith(FOLDER_ID_PREFIX) && over?.startsWith(FOLDER_ID_PREFIX)) {
          moveToFolderRef.current(active.id, over.slice(FOLDER_ID_PREFIX.length));
        } else {
          reorder(active.id, over && over !== active.id ? over : null);
        }
      }
      dragStart.current = null;
      setDragging(null);
      targetRef.current = null;
      setTarget(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [reorder]);

  const onKeyDown = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = layout.mobile.indexOf(id);
    if (event.key === 'Escape' && picked) {
      event.preventDefault();
      if (pickedOrder) setMobile(() => pickedOrder);
      setPicked(null);
      setPickedOrder(null);
      setAnnouncement('Move cancelled and original position restored.');
      return;
    }
    if (event.key === ' ' || (event.key === 'Enter' && picked === id)) {
      event.preventDefault();
      if (picked === id) {
        setPicked(null);
        setPickedOrder(null);
        setAnnouncement(`${entryLabel(id)} dropped at position ${index + 1}.`);
      } else {
        setPicked(id);
        setPickedOrder(layout.mobile);
        setAnnouncement(`${entryLabel(id)} picked up. Use arrow keys to reorder, F to move into a folder, Enter to drop, Escape to cancel.`);
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
        setAnnouncement('No folders yet. Create one with the button below the grid.');
        return;
      }
      setAnnouncement(`Move ${entryLabel(id)} into which folder? Press 1 to ${Math.min(9, folders.length)}: ${folders.slice(0, 9).map((folder, folderIndex) => `${folderIndex + 1} for ${folder.name}`).join(', ')}.`);
      return;
    }
    if (/^[1-9]$/.test(event.key) && !id.startsWith(FOLDER_ID_PREFIX)) {
      const folder = folders[Number(event.key) - 1];
      if (folder) {
        event.preventDefault();
        setPicked(null);
        setPickedOrder(null);
        moveToFolder(id, folder.id);
      }
      return;
    }
    const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowDown' ? columns : 0;
    if (!offset) return;
    event.preventDefault();
    const nextIndex = Math.max(0, Math.min(layout.mobile.length - 1, index + offset));
    setMobile((order) => {
      const without = order.filter((item) => item !== id);
      const targetIndex = Math.max(0, Math.min(without.length, nextIndex));
      const next = [...without];
      next.splice(targetIndex, 0, id);
      return next;
    });
    setAnnouncement(`${entryLabel(id)} moved to position ${nextIndex + 1}.`);
  };

  const appContextMenu = (appId: string, title: string, currentFolderId: string | null) => (
    <ContextMenuContent className="w-56">
      <ContextMenuItem onSelect={() => onOpen(appId)}>Open</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>Move to folder</ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48">
          {currentFolderId && (
            <>
              <ContextMenuItem onSelect={() => removeFromFolder(appId)}>Home screen</ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          {folders.filter((folder) => folder.id !== currentFolderId).map((folder) => (
            <ContextMenuItem key={folder.id} onSelect={() => moveToFolder(appId, folder.id)}>
              {folder.name}
            </ContextMenuItem>
          ))}
          {folders.length === 0 && <ContextMenuItem disabled>No folders yet</ContextMenuItem>}
          {folders.length > 0 && <ContextMenuSeparator />}
          <ContextMenuItem
            disabled={folders.length >= MAX_FOLDERS}
            onSelect={() => setFolderDialog({ open: true, appId })}
          >
            New folder with {title}…
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  );

  const homeTileClass = (id: string) => cn(
    'flex flex-col items-center gap-2 rounded-xl p-2 transition-[transform,background-color,box-shadow] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95',
    dragging === id && 'scale-105 bg-primary/15 shadow-lg',
    target === id && dragging !== id && 'bg-primary/10 ring-2 ring-primary/50',
    picked === id && 'bg-primary/15',
  );

  if (openFolder) {
    const contents = folderContents.get(openFolder.id) ?? [];
    return (
      <div className="os-desktop-surface flex h-full flex-col overflow-y-auto">
        <div className="flex items-center gap-1 px-3 pt-3">
          <button
            type="button"
            onClick={() => setOpenFolderId(null)}
            className="-ml-1 flex items-center gap-1 rounded px-1 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronLeft className="size-5" aria-hidden />
            Home
          </button>
        </div>
        <h2 className="px-4 pb-1 pt-2 text-base font-semibold">{openFolder.name}</h2>
        {contents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            This folder is empty. Long-press an app on the home screen to move it here.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4 p-6 min-[480px]:grid-cols-4">
            {contents.map((app) => (
              <ContextMenu key={app.id}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onOpen(app.id)}
                    onContextMenu={stopTouchContextMenu}
                    className="flex flex-col items-center gap-2 rounded-xl p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95"
                  >
                    <span className="flex size-14 items-center justify-center rounded-2xl border border-os-window-border bg-background shadow-sm">
                      <app.icon className="size-7 text-primary" aria-hidden />
                    </span>
                    <span className="text-center text-xs font-medium leading-tight">{app.title}</span>
                  </button>
                </ContextMenuTrigger>
                {appContextMenu(app.id, app.title, openFolder.id)}
              </ContextMenu>
            ))}
          </div>
        )}
        <div className="mt-auto flex gap-2 p-4">
          <Button variant="outline" size="sm" onClick={() => setFolderDialog({ open: true, folder: openFolder })}>
            Rename
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => requestDeleteFolder(openFolder)}
          >
            Delete folder
          </Button>
        </div>
        <FolderDialog
          key={openFolder.id}
          open={folderDialog.open}
          onOpenChange={(open) => setFolderDialog((current) => ({ ...current, open }))}
          folders={folders}
          folder={folderDialog.folder}
          onSubmit={(name) => {
            if (folderDialog.folder) {
              renameFolder(folderDialog.folder.id, name);
              setAnnouncement(`Folder renamed to ${name}.`);
            }
          }}
        />
        <DeleteFolderDialog folder={confirmDelete} onCancel={() => setConfirmDelete(null)} onConfirm={deleteFolder} />
        <span id="mobile-icon-layout-status" className="sr-only" aria-live="polite">{announcement}</span>
      </div>
    );
  }

  const entries = layout.mobile
    .map((id) => {
      if (id.startsWith(FOLDER_ID_PREFIX)) {
        const folder = folders.find((item) => item.id === id.slice(FOLDER_ID_PREFIX.length));
        return folder ? { type: 'folder' as const, id, folder } : null;
      }
      const app = byId.get(id);
      return app ? { type: 'app' as const, id, app } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <div className="os-desktop-surface h-full overflow-y-auto p-6">
      <div className="grid grid-cols-3 gap-4 min-[480px]:grid-cols-4">
        {entries.map((entry) =>
          entry.type === 'app' ? (
            <ContextMenu key={entry.id}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  data-home-icon-id={entry.id}
                  aria-pressed={picked === entry.id || undefined}
                  aria-describedby={picked === entry.id ? 'mobile-icon-layout-status' : undefined}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    dragStart.current = { id: entry.id, x: event.clientX, y: event.clientY, moved: false };
                  }}
                  onContextMenu={stopTouchContextMenu}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    onOpen(entry.app.id);
                  }}
                  onKeyDown={(event) => onKeyDown(entry.id, event)}
                  className={homeTileClass(entry.id)}
                >
                  <span className="flex size-14 items-center justify-center rounded-2xl border border-os-window-border bg-background shadow-sm">
                    <entry.app.icon className="size-7 text-primary" aria-hidden />
                  </span>
                  <span className="text-center text-xs font-medium leading-tight">{entry.app.title}</span>
                </button>
              </ContextMenuTrigger>
              {appContextMenu(entry.app.id, entry.app.title, null)}
            </ContextMenu>
          ) : (
            <ContextMenu key={entry.id}>
              <ContextMenuTrigger asChild>
                <FolderVisual
                  label={entry.folder.name}
                  count={(folderContents.get(entry.folder.id) ?? []).length}
                  badges={(folderContents.get(entry.folder.id) ?? []).slice(0, 3).map((app) => (
                    <app.icon key={app.id} className="size-2.5 text-primary" />
                  ))}
                  selected={picked === entry.id}
                  pickedUp={picked === entry.id}
                  dragging={dragging === entry.id}
                  dropTarget={target === entry.id && dragging !== entry.id}
                  data-home-icon-id={entry.id}
                  statusId="mobile-icon-layout-status"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    dragStart.current = { id: entry.id, x: event.clientX, y: event.clientY, moved: false };
                  }}
                  onContextMenu={stopTouchContextMenu}
                  onSelect={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    setOpenFolderId(entry.folder.id);
                  }}
                  onOpen={() => setOpenFolderId(entry.folder.id)}
                  onKeyDown={(event) => onKeyDown(entry.id, event)}
                  className={homeTileClass(entry.id)}
                />
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                <ContextMenuItem onSelect={() => setOpenFolderId(entry.folder.id)}>Open</ContextMenuItem>
                <ContextMenuItem onSelect={() => setFolderDialog({ open: true, folder: entry.folder })}>Rename…</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => requestDeleteFolder(entry.folder)}
                  className="text-destructive focus:text-destructive"
                >
                  Delete folder
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ),
        )}
      </div>

      {folders.length < MAX_FOLDERS && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setFolderDialog({ open: true })}
          >
            <FolderPlus className="size-4" aria-hidden />
            New folder
          </Button>
        </div>
      )}

      <FolderDialog
        key={folderDialog.folder?.id ?? folderDialog.appId ?? 'new'}
        open={folderDialog.open}
        onOpenChange={(open) => setFolderDialog((current) => ({ ...current, open }))}
        folders={folders}
        folder={folderDialog.folder}
        onSubmit={(name) => {
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
        }}
      />
      <DeleteFolderDialog folder={confirmDelete} onCancel={() => setConfirmDelete(null)} onConfirm={deleteFolder} />
      <span id="mobile-icon-layout-status" className="sr-only" aria-live="polite">{announcement}</span>
    </div>
  );
}

function DeleteFolderDialog({ folder, onCancel, onConfirm }: { folder: Folder | null; onCancel: () => void; onConfirm: (folder: Folder) => void }) {
  return (
    <AlertDialog open={folder !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete folder “{folder?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The apps inside move back to the home screen. Nothing is uninstalled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { if (folder) onConfirm(folder); }}
          >
            Delete folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MobileSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}
