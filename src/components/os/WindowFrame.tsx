import { Suspense, memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useToast } from '@/hooks/useToast';
import { TrafficLights } from './TrafficLights';
import { useWindowManager } from '@/os/useWindowManager';
import { useDrag, type SnapZone } from '@/os/useDrag';
import { HANDLE_CURSOR, RESIZE_HANDLES, useResize, type ResizeHandle } from '@/os/useResize';
import { getViewport, halfRect } from '@/os/layout';
import type { AppDefinition, AppParams, Rect, WindowState } from '@/os/types';

interface WindowFrameProps {
  win: WindowState;
  app: AppDefinition;
  focused: boolean;
  onSnapChange: (zone: SnapZone) => void;
}

/** Where each resize handle sits, and how wide its hit area is. */
const HANDLE_CLASS: Record<ResizeHandle, string> = {
  n: 'left-3 right-3 top-0 h-1.5',
  s: 'left-3 right-3 bottom-0 h-1.5',
  e: 'top-3 bottom-3 right-0 w-1.5',
  w: 'top-3 bottom-3 left-0 w-1.5',
  ne: 'top-0 right-0 size-3',
  nw: 'top-0 left-0 size-3',
  se: 'bottom-0 right-0 size-3',
  sw: 'bottom-0 left-0 size-3',
};

function WindowContentSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function WindowFrameImpl({ win, app, focused, onSnapChange }: WindowFrameProps) {
  const {
    closeWindow,
    focusWindow,
    minimizeWindow,
    moveWindow,
    resizeWindow,
    toggleMaximize,
    setWindowTitle,
    setWindowParams,
  } = useWindowManager();

  const elementRef = useRef<HTMLDivElement>(null);
  const resizable = app.resizable !== false;

  // The gesture hooks need the live geometry without re-subscribing on every
  // pixel, so it is mirrored into a ref.
  const rectRef = useRef<Rect>({ x: win.x, y: win.y, width: win.width, height: win.height });
  const getRect = useCallback(() => rectRef.current, []);

  const focus = useCallback(() => focusWindow(win.id), [focusWindow, win.id]);

  const handleDragCommit = useCallback(
    (position: { x: number; y: number }, snap: SnapZone) => {
      if (snap === 'maximize') {
        if (!win.maximized) toggleMaximize(win.id);
        return;
      }
      if (snap === 'left' || snap === 'right') {
        resizeWindow(win.id, halfRect(snap, getViewport()));
        return;
      }
      moveWindow(win.id, position.x, position.y);
    },
    [moveWindow, resizeWindow, toggleMaximize, win.id, win.maximized],
  );

  const onDragStart = useCallback(() => focus(), [focus]);

  const startDrag = useDrag({
    targetRef: elementRef,
    getRect,
    // A maximized window has nowhere to go; un-maximize it first.
    disabled: win.maximized,
    onStart: onDragStart,
    onSnapChange,
    onCommit: handleDragCommit,
  });

  const handleResizeCommit = useCallback(
    (rect: Rect) => resizeWindow(win.id, rect),
    [resizeWindow, win.id],
  );

  const startResize = useResize({
    targetRef: elementRef,
    getRect,
    minSize: app.minSize,
    onStart: onDragStart,
    onCommit: handleResizeCommit,
  });

  // Gesture hooks write inline styles straight onto the node; when state
  // catches up React must be the one source of truth again.
  useEffect(() => {
    rectRef.current = { x: win.x, y: win.y, width: win.width, height: win.height };

    const element = elementRef.current;
    if (!element) return;
    element.style.transform = `translate3d(${win.x}px, ${win.y}px, 0)`;
    element.style.width = `${win.width}px`;
    element.style.height = `${win.height}px`;
  }, [win.x, win.y, win.width, win.height]);

  const setTitle = useCallback(
    (title: string) => setWindowTitle(win.id, title),
    [setWindowTitle, win.id],
  );

  const setParams = useCallback(
    (params: AppParams) => setWindowParams(win.id, params),
    [setWindowParams, win.id],
  );

  const { toast } = useToast();

  // A window is addressable: its app plus its params reproduce exactly what is
  // on screen, which is what makes "send me that" work.
  const copyWindowLink = useCallback(async () => {
    const search = new URLSearchParams({ app: win.appId, ...win.params });
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?${search}`);
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Could not copy the link', variant: 'destructive' });
    }
  }, [toast, win.appId, win.params]);

  const AppComponent = app.component;
  const appProps = useMemo(
    () => ({ windowId: win.id, params: win.params, setTitle, setParams }),
    [win.id, win.params, setTitle, setParams],
  );

  const Icon = app.icon;

  return (
    <div
      ref={elementRef}
      role="dialog"
      aria-label={win.title}
      aria-modal={false}
      data-focused={focused}
      onPointerDownCapture={focus}
      className={cn(
        'os-window pointer-events-auto absolute left-0 top-0 flex flex-col overflow-hidden border bg-background',
        // A window filling the screen has no edges to round; keeping them would
        // leave slivers of desktop showing in the corners.
        win.maximized ? 'rounded-none border-x-0 border-b-0' : 'rounded-xl',
        focused ? 'border-os-window-border' : 'border-os-window-border/70',
      )}
      style={{
        // Inline, because the `hidden` attribute loses to the `flex` utility
        // class. Hiding rather than unmounting keeps the app's scroll position
        // and in-flight queries intact while it is minimized.
        display: win.minimized ? 'none' : undefined,
        transform: `translate3d(${win.x}px, ${win.y}px, 0)`,
        width: win.width,
        height: win.height,
        zIndex: win.z,
      }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            onPointerDown={startDrag}
            onDoubleClick={() => resizable && toggleMaximize(win.id)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-3 border-b px-3 select-none',
              win.maximized ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
              focused
                ? 'border-os-window-border bg-os-titlebar'
                : 'border-os-window-border/60 bg-os-titlebar-inactive',
            )}
          >
            <TrafficLights
              focused={focused}
              resizable={resizable}
              onClose={() => closeWindow(win.id)}
              onMinimize={() => minimizeWindow(win.id)}
              onToggleMaximize={() => toggleMaximize(win.id)}
            />

            <div
              className={cn(
                'pointer-events-none flex min-w-0 flex-1 items-center justify-center gap-1.5',
                focused ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
              <span className="truncate text-[13px] font-medium">{win.title}</span>
            </div>

            <div className="w-[52px] shrink-0" aria-hidden />
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          <ContextMenuItem disabled={!resizable} onSelect={() => toggleMaximize(win.id)}>
            {win.maximized ? 'Restore size' : 'Fill the screen'}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => minimizeWindow(win.id)}>Minimize</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={copyWindowLink}>Copy link to this window</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => closeWindow(win.id)}>Close</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div className="os-window-content os-scroll relative min-h-0 flex-1 overflow-hidden">
        <ErrorBoundary fallback={<WindowErrorFallback title={win.title} />}>
          <Suspense fallback={<WindowContentSkeleton />}>
            <AppComponent {...appProps} />
          </Suspense>
        </ErrorBoundary>
      </div>

      {resizable && !win.maximized && (
        <>
          {RESIZE_HANDLES.map((handle) => (
            <div
              key={handle}
              onPointerDown={startResize(handle)}
              className={cn('absolute z-10', HANDLE_CLASS[handle])}
              style={{ cursor: HANDLE_CURSOR[handle] }}
            />
          ))}
        </>
      )}
    </div>
  );
}

function WindowErrorFallback({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title} stopped responding</p>
        <p className="text-sm text-muted-foreground">
          Close the window and open it again to retry.
        </p>
      </div>
    </div>
  );
}

export const WindowFrame = memo(WindowFrameImpl);
