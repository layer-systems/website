import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, LayoutGrid, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginArea } from '@/components/auth/LoginArea';
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

const MOBILE_DRAG_THRESHOLD = 8;

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
  const dragStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const targetRef = useRef<string | null>(null);
  const { layout, setMobile } = useIconLayout(apps.map((app) => app.id), { columns, rows: Math.max(8, Math.ceil(apps.length / columns) + 4) });
  const byId = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const orderedApps = layout.mobile.map((id) => byId.get(id)).filter((app): app is NonNullable<typeof app> => Boolean(app));

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
    setAnnouncement(`${id} moved to position ${position}.`);
  }, [layout.mobile, setAnnouncement, setMobile]);

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
        const target = targetRef.current;
        reorder(active.id, target && target !== active.id ? target : null);
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
        setAnnouncement(`${id} dropped at position ${index + 1}.`);
      } else {
        setPicked(id);
        setPickedOrder(layout.mobile);
        setAnnouncement(`${id} picked up. Use arrow keys to reorder, Enter to drop, Escape to cancel.`);
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
    setAnnouncement(`${id} moved to position ${nextIndex + 1}.`);
  };

  return (
    <div className="os-desktop-surface h-full overflow-y-auto p-6">
      <div className="grid grid-cols-3 gap-4 min-[480px]:grid-cols-4">
        {orderedApps.map((app) => (
          <button
            key={app.id}
            type="button"
            data-home-icon-id={app.id}
            aria-pressed={picked === app.id || undefined}
            aria-describedby={picked === app.id ? 'mobile-icon-layout-status' : undefined}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              dragStart.current = { id: app.id, x: event.clientX, y: event.clientY, moved: false };
            }}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onOpen(app.id);
            }}
            onKeyDown={(event) => onKeyDown(app.id, event)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl p-2 transition-[transform,background-color,box-shadow] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95',
              dragging === app.id && 'scale-105 bg-primary/15 shadow-lg',
              target === app.id && dragging !== app.id && 'bg-primary/10 ring-2 ring-primary/50',
              picked === app.id && 'bg-primary/15',
            )}
          >
            <span className="flex size-14 items-center justify-center rounded-2xl border border-os-window-border bg-background shadow-sm">
              <app.icon className="size-7 text-primary" aria-hidden />
            </span>
            <span className="text-center text-xs font-medium leading-tight">{app.title}</span>
          </button>
        ))}
      </div>
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
