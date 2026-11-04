import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
import { useHomeScreen } from '@/hooks/useHomeScreen';
import { useIconDrag, type DragPoint } from '@/os/useIconDrag';
import { menuJustOpened } from '@/os/menuTiming';
import { isFolderId } from '@/lib/appFolders';
import { FolderView } from './FolderView';
import { AppGlyph, FolderGlyph } from './HomeGlyph';
import { HomeIconMenu } from './HomeIconMenu';

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

interface DropTarget {
  id: string;
  /** On the icon tile itself (group into a folder) rather than beside it (reorder). */
  onGlyph: boolean;
}

function contains(rect: DOMRect, point: DragPoint): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/**
 * Rect-based rather than `elementFromPoint`: an open folder dialog makes the
 * rest of the page inert to hit-testing, and an app dragged out of it still
 * has to find the icon it was released over.
 */
function homeItemAt(point: DragPoint, exclude: string): DropTarget | null {
  for (const element of document.querySelectorAll<HTMLElement>('[data-home-item-id]')) {
    const id = element.dataset.homeItemId;
    if (!id || id === exclude || !contains(element.getBoundingClientRect(), point)) continue;
    const glyph = element.querySelector('[data-home-glyph]')?.getBoundingClientRect();
    return { id, onGlyph: Boolean(glyph && contains(glyph, point)) };
  }
  return null;
}

function HomeScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const [columns, setColumns] = useState(() => window.innerWidth < 480 ? 3 : 4);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedOrder, setPickedOrder] = useState<string[] | null>(null);
  const [openFolder, setOpenFolder] = useState<{ id: string; renaming: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const home = useHomeScreen({ columns, rows: Math.max(8, Math.ceil(desktopApps().length / columns) + 4) });
  const { appsById, foldersById, layout, setMobile, labelOf } = home;
  const order = layout.mobile;

  useEffect(() => {
    const onResize = () => setColumns(window.innerWidth < 480 ? 3 : 4);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const reorder = useCallback((id: string, beforeId: string | null) => {
    setMobile((current) => {
      const without = current.filter((item) => item !== id);
      const index = beforeId ? without.indexOf(beforeId) : without.length;
      const next = [...without];
      next.splice(index < 0 ? next.length : index, 0, id);
      return next;
    });
    const without = order.filter((item) => item !== id);
    const position = beforeId ? Math.max(0, without.indexOf(beforeId)) + 1 : order.length;
    setAnnouncement(`${labelOf(id)} moved to position ${position}.`);
  }, [labelOf, order, setMobile]);

  /** Can `draggedId` be grouped by dropping it on `target`? Folders never nest. */
  const canGroup = (draggedId: string, drop: DropTarget | null): boolean =>
    Boolean(drop?.onGlyph) && !isFolderId(draggedId);

  const group = useCallback((draggedId: string, targetId: string) => {
    const folder = home.merge(draggedId, targetId);
    if (!folder) return;
    setAnnouncement(isFolderId(targetId)
      ? `${labelOf(draggedId)} added to ${folder.name}.`
      : `New folder ${folder.name} with ${labelOf(targetId)} and ${labelOf(draggedId)}.`);
  }, [home, labelOf]);

  const drag = useIconDrag({
    onMove: (id, point) => setTarget(homeItemAt(point, id)),
    onDrop: (id, point) => {
      setTarget(null);
      const drop = homeItemAt(point, id);
      if (drop && canGroup(id, drop)) group(id, drop.id);
      else reorder(id, drop?.id ?? null);
    },
    onCancel: () => setTarget(null),
  });

  const dropOutOfFolder = (appId: string, point: DragPoint) => {
    setOpenFolder(null);
    const drop = homeItemAt(point, appId);
    if (drop && canGroup(appId, drop)) {
      group(appId, drop.id);
      return;
    }
    const source = home.folders.find((folder) => folder.apps.includes(appId));
    home.moveOut(appId, { before: drop?.id });
    setAnnouncement(`${labelOf(appId)} moved out of ${source?.name ?? 'the folder'}.`);
  };

  const openItem = (id: string) => {
    if (isFolderId(id)) setOpenFolder({ id, renaming: false });
    else onOpen(id);
  };

  const onKeyDown = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = order.indexOf(id);
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
        setAnnouncement(`${labelOf(id)} dropped at position ${index + 1}.`);
      } else {
        setPicked(id);
        setPickedOrder(order);
        setAnnouncement(`${labelOf(id)} picked up. Use arrow keys to reorder, Enter to drop, Escape to cancel. To group it into a folder, open its menu with Shift+F10.`);
      }
      return;
    }
    if (!picked) return;
    const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowDown' ? columns : 0;
    if (!offset) return;
    event.preventDefault();
    const nextIndex = Math.max(0, Math.min(order.length - 1, index + offset));
    setMobile((current) => {
      const without = current.filter((item) => item !== id);
      const targetIndex = Math.max(0, Math.min(without.length, nextIndex));
      const next = [...without];
      next.splice(targetIndex, 0, id);
      return next;
    });
    setAnnouncement(`${labelOf(id)} moved to position ${nextIndex + 1}.`);
  };

  return (
    <div className="os-desktop-surface h-full overflow-y-auto p-6">
      <div className="grid grid-cols-3 gap-4 min-[480px]:grid-cols-4">
        {order.map((id) => {
          const folder = foldersById.get(id);
          const app = appsById.get(id);
          if (!folder && !app) return null;
          const isDragging = drag.dragging === id;
          const isTarget = target?.id === id && Boolean(drag.dragging);
          const merging = isTarget && drag.dragging !== null && canGroup(drag.dragging, target);
          return (
            <HomeIconMenu
              key={id}
              id={id}
              home={home}
              announce={setAnnouncement}
              onOpen={() => openItem(id)}
              onRename={folder ? () => setOpenFolder({ id, renaming: true }) : undefined}
            >
              <button
                type="button"
                data-home-item-id={id}
                aria-label={folder
                  ? `Folder ${folder.name}, ${folder.apps.length} apps`
                  : `${app!.title} — ${app!.description}`}
                aria-pressed={picked === id || undefined}
                aria-describedby={picked === id ? 'mobile-icon-layout-status' : undefined}
                onPointerDown={(event) => drag.startDrag(id, event)}
                onClick={() => {
                  if (drag.consumeClick(id) || menuJustOpened()) return;
                  openItem(id);
                }}
                onKeyDown={(event) => onKeyDown(id, event)}
                style={isDragging ? { transform: `translate(${drag.offset.dx}px, ${drag.offset.dy}px)` } : undefined}
                className={cn(
                  'flex touch-manipulation flex-col items-center gap-2 rounded-xl p-2 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  !isDragging && 'transition-[transform,background-color,box-shadow] active:scale-95 motion-reduce:transition-none',
                  isDragging && 'pointer-events-none relative z-10 scale-105',
                  isTarget && !merging && 'bg-primary/10 ring-2 ring-primary/50',
                  picked === id && 'bg-primary/15',
                )}
              >
                {folder
                  ? <FolderGlyph folder={folder} appsById={appsById} size="mobile" mergeTarget={merging} className={isDragging ? 'shadow-lg' : undefined} />
                  : <AppGlyph app={app!} size="mobile" mergeTarget={merging} className={isDragging ? 'shadow-lg' : undefined} />}
                <span className="line-clamp-2 text-center text-xs font-medium leading-tight">{folder?.name ?? app!.title}</span>
              </button>
            </HomeIconMenu>
          );
        })}
      </div>
      <FolderView
        folder={openFolder ? foldersById.get(openFolder.id) : undefined}
        home={home}
        size="mobile"
        renaming={openFolder?.renaming ?? false}
        onClose={() => setOpenFolder(null)}
        onOpenApp={(appId) => {
          setOpenFolder(null);
          onOpen(appId);
        }}
        onDropOutside={dropOutOfFolder}
      />
      <span id="mobile-icon-layout-status" className="sr-only" aria-live="polite">{announcement}</span>
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
