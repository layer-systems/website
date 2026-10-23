import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, LayoutGrid, Zap } from 'lucide-react';
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
import { useWindowManager } from '@/os/useWindowManager';
import { desktopApps, getApp } from '@/os/registry';
import { cn } from '@/lib/utils';
import type { AppParams } from '@/os/types';
import { useIconLayout } from '@/os/useIconLayout';
import { isInFolderDialog, NO_TOUCH_CALLOUT, useIconDrag, type IconDrag } from '@/os/useIconDrag';
import { useAppFolders } from '@/os/appFoldersContext';
import { AppFolderControls, DragGhost, DropHint, FolderTile } from './AppFolderControls';

/** Half the size of the square around an icon's center that groups apps on release. */
const MERGE_RADIUS = 28;

/** `bar` is where the insertion marker is drawn, in viewport coordinates. */
type HomeDropTarget =
  | { kind: 'merge'; id: string }
  | { kind: 'insert'; beforeId: string | null; bar?: { x: number; y: number; height: number } };

function insertBefore(order: string[], id: string, beforeId: string | null) {
  const without = order.filter((item) => item !== id);
  const index = beforeId ? without.indexOf(beforeId) : -1;
  without.splice(index < 0 ? without.length : index, 0, id);
  return without;
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
  const { folders, moveApp, groupApps } = useAppFolders();
  const nested = new Set(folders.flatMap((folder) => folder.appIds));
  const topApps = apps.filter((app) => !nested.has(app.id));
  const topIds = [...topApps.map((app) => app.id), ...folders.map((folder) => folder.id)];
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [columns, setColumns] = useState(() => window.innerWidth < 480 ? 3 : 4);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedOrder, setPickedOrder] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const { layout, setMobile } = useIconLayout(topIds, { columns, rows: Math.max(8, Math.ceil(topIds.length / columns) + 4) });
  const byId = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const orderedIds = layout.mobile;
  const labelFor = useCallback(
    (id: string) => byId.get(id)?.title ?? folders.find((folder) => folder.id === id)?.name ?? id,
    [byId, folders],
  );

  useEffect(() => {
    const onResize = () => setColumns(window.innerWidth < 480 ? 3 : 4);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resolveTarget = ({ id, fromFolder, x, y }: Omit<IconDrag<HomeDropTarget>, 'target'>): HomeDropTarget | null => {
    if (fromFolder && openFolderId && isInFolderDialog(x, y)) return null;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-home-icon-id]');
    const hitId = hit?.dataset.homeIconId;
    // Apps leaving a folder land at the end unless they are dropped on a tile.
    if (!hit || !hitId) return fromFolder ? { kind: 'insert', beforeId: null } : null;
    if (hitId === id) return null;
    const rect = hit.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + 36;
    if (!id.startsWith('folder:') && Math.abs(x - centerX) <= MERGE_RADIUS && Math.abs(y - centerY) <= MERGE_RADIUS) {
      return { kind: 'merge', id: hitId };
    }
    // Half the grid gap, so the marker sits between two tiles.
    const bar = { x: x < centerX ? rect.left - 8 : rect.right + 8, y: rect.top + 8, height: rect.height - 16 };
    if (x < centerX) return { kind: 'insert', beforeId: hitId, bar };
    const rest = orderedIds.filter((item) => item !== id);
    return { kind: 'insert', beforeId: rest[rest.indexOf(hitId) + 1] ?? null, bar };
  };

  const onDrop = ({ id, fromFolder, target }: IconDrag<HomeDropTarget>) => {
    if (!target) return;
    if (target.kind === 'merge') {
      if (target.id.startsWith('folder:')) {
        moveApp(id, target.id);
        setAnnouncement(`${labelFor(id)} moved into ${labelFor(target.id)}.`);
        return;
      }
      const folder = groupApps(target.id, id);
      if (!folder) return;
      // The new folder takes the place of the app it was dropped on.
      setMobile((order) => order.map((item) => item === target.id ? folder.id : item));
      setAnnouncement(`Created folder ${folder.name} with ${labelFor(target.id)} and ${labelFor(id)}.`);
      return;
    }
    if (fromFolder) moveApp(id, null);
    setMobile((order) => insertBefore(order, id, target.beforeId));
    const rest = orderedIds.filter((item) => item !== id);
    const position = target.beforeId ? rest.indexOf(target.beforeId) + 1 : rest.length + 1;
    setAnnouncement(fromFolder ? `${labelFor(id)} removed from ${labelFor(fromFolder)}.` : `${labelFor(id)} moved to position ${position}.`);
  };

  const { drag, begin, isDropClick } = useIconDrag<HomeDropTarget>({
    resolveTarget,
    onDrop,
    onMove: ({ fromFolder, x, y }) => {
      // Leaving the folder with an app closes it, so the home screen is visible for the drop.
      if (fromFolder && openFolderId && !isInFolderDialog(x, y)) setOpenFolderId(null);
    },
  });
  const mergeId = drag?.target?.kind === 'merge' ? drag.target.id : null;
  const insertBar = drag?.target?.kind === 'insert' ? drag.target.bar : undefined;

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
        setAnnouncement(`${labelFor(id)} dropped at position ${index + 1}.`);
      } else {
        setPicked(id);
        setPickedOrder(layout.mobile);
        setAnnouncement(`${labelFor(id)} picked up. Use arrow keys to reorder, Enter to drop, Escape to cancel.`);
      }
      return;
    }
    if (!picked) return;
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
    setAnnouncement(`${labelFor(id)} moved to position ${nextIndex + 1}.`);
  };

  return (
    <div className="os-desktop-surface h-full overflow-y-auto p-6">
      <h1 className="mb-5 text-lg font-semibold">Apps</h1>
      <AppFolderControls
        mobile
        openFolderId={openFolderId}
        onCloseFolder={() => setOpenFolderId(null)}
        onOpenApp={(id) => {
          if (isDropClick()) return;
          setOpenFolderId(null);
          onOpen(id);
        }}
        onAppPointerDown={(id, event) => begin(id, event, openFolderId)}
        draggingId={drag?.fromFolder ? drag.id : null}
      />
      <div className="grid grid-cols-3 gap-4 min-[480px]:grid-cols-4">
        {orderedIds.map((id) => {
          const folder = folders.find((item) => item.id === id);
          const app = folder ? undefined : byId.get(id);
          if (!folder && !app) return null;
          return (
            <div key={id} className="relative">
              {folder ? (
                <FolderTile
                  folder={folder}
                  mobile
                  dragging={drag?.id === id}
                  pickedUp={picked === id}
                  dropTarget={mergeId === id}
                  onPointerDown={(event) => begin(id, event)}
                  onKeyDown={(event) => onKeyDown(id, event)}
                  onOpen={() => { if (!isDropClick()) setOpenFolderId(id); }}
                />
              ) : app && (
                <button
                  type="button"
                  data-home-icon-id={app.id}
                  aria-pressed={picked === app.id || undefined}
                  aria-describedby={picked === app.id ? 'mobile-icon-layout-status' : undefined}
                  onPointerDown={(event) => begin(app.id, event)}
                  onClick={() => { if (!isDropClick()) onOpen(app.id); }}
                  onContextMenu={(event) => event.preventDefault()}
                  onKeyDown={(event) => onKeyDown(app.id, event)}
                  className={cn(
                    'relative flex w-full flex-col items-center gap-2 rounded-xl p-2 transition-[opacity,background-color] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    NO_TOUCH_CALLOUT,
                    drag?.id === app.id && 'opacity-30',
                    mergeId === app.id && 'bg-primary/10',
                    picked === app.id && 'bg-primary/15',
                  )}
                >
                  <span className={cn(
                    'flex size-14 items-center justify-center rounded-2xl border border-os-window-border bg-background shadow-sm transition-transform duration-150 motion-reduce:transition-none',
                    mergeId === app.id && 'scale-115 border-primary ring-2 ring-primary/60',
                  )}>
                    <app.icon className="size-7 text-primary" aria-hidden />
                  </span>
                  <span className="text-center text-xs font-medium leading-tight">{app.title}</span>
                  {mergeId === app.id && <DropHint>Create folder</DropHint>}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <span id="mobile-icon-layout-status" className="sr-only" aria-live="polite">{announcement}</span>
      {drag && <DragGhost id={drag.id} x={drag.x} y={drag.y} merging={Boolean(mergeId)} mobile />}
      {/* Drawn above the drag ghost, which would otherwise cover it. */}
      {insertBar && createPortal(
        <span aria-hidden className="pointer-events-none fixed left-0 top-0 z-[61] w-1 rounded-full bg-primary shadow-sm" style={{ height: insertBar.height, transform: `translate(${insertBar.x - 2}px, ${insertBar.y}px)` }} />,
        document.body,
      )}
    </div>
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
