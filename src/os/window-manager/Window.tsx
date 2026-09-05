import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWindowManager } from './useWindowManager';

export const MENU_BAR_HEIGHT = 36;
export const DOCK_RESERVED_HEIGHT = 88;

interface WindowProps {
  appId: string;
  title: string;
  icon: LucideIcon;
  minWidth?: number;
  minHeight?: number;
  children: ReactNode;
}

export function Window({ appId, title, icon: Icon, minWidth = 320, minHeight = 240, children }: WindowProps) {
  const { windows, focusedAppId, focusApp, closeApp, minimizeApp, toggleMaximize, moveApp, resizeApp, zIndexFor } =
    useWindowManager();
  const win = windows[appId];
  const rootRef = useRef<HTMLDivElement>(null);
  const isFocused = focusedAppId === appId;

  useEffect(() => {
    if (isFocused) {
      rootRef.current?.focus({ preventScroll: true });
    }
  }, [isFocused]);

  if (!win || win.minimized) return null;

  const maximizedBounds = () => ({
    x: 8,
    y: MENU_BAR_HEIGHT + 8,
    width: window.innerWidth - 16,
    height: window.innerHeight - MENU_BAR_HEIGHT - DOCK_RESERVED_HEIGHT,
  });

  const handleTitleBarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (win.maximized) return;
    if ((e.target as HTMLElement).closest('button')) return;

    focusApp(appId);
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = win.x;
    const originY = win.y;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const nextX = Math.max(-win.width + 120, originX + dx);
      const nextY = Math.max(MENU_BAR_HEIGHT, originY + dy);
      moveApp(appId, nextX, nextY);
    };
    const handleUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleUp);
    };
    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', handleUp);
  };

  const handleResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (win.maximized) return;
    e.stopPropagation();
    focusApp(appId);
    const startX = e.clientX;
    const startY = e.clientY;
    const originWidth = win.width;
    const originHeight = win.height;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      resizeApp(appId, {
        x: win.x,
        y: win.y,
        width: Math.max(minWidth, originWidth + dx),
        height: Math.max(minHeight, originHeight + dy),
      });
    };
    const handleUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleUp);
    };
    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', handleUp);
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      onPointerDown={() => !isFocused && focusApp(appId)}
      className={cn(
        'absolute flex flex-col rounded-lg border bg-card text-card-foreground shadow-2xl outline-none transition-shadow',
        isFocused ? 'ring-1 ring-primary/40 shadow-primary/10' : 'opacity-95',
      )}
      style={{
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: zIndexFor(appId),
      }}
    >
      <div
        onPointerDown={handleTitleBarPointerDown}
        onDoubleClick={() => toggleMaximize(appId, maximizedBounds())}
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 rounded-t-lg border-b px-3 select-none',
          win.maximized ? '' : 'cursor-grab active:cursor-grabbing',
          isFocused ? 'bg-muted/80' : 'bg-muted/40',
        )}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Close ${title}`}
            onClick={() => closeApp(appId)}
            className="h-3 w-3 rounded-full bg-destructive/80 hover:bg-destructive transition-colors"
          />
          <button
            type="button"
            aria-label={`Minimize ${title}`}
            onClick={() => minimizeApp(appId)}
            className="h-3 w-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors"
          />
          <button
            type="button"
            aria-label={win.maximized ? `Restore ${title}` : `Maximize ${title}`}
            onClick={() => toggleMaximize(appId, maximizedBounds())}
            className="h-3 w-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors"
          />
        </div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="truncate text-xs font-medium">{title}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-b-lg">{children}</div>

      {!win.maximized && (
        <div
          onPointerDown={handleResizePointerDown}
          role="presentation"
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
        >
          <svg viewBox="0 0 16 16" className="h-full w-full text-muted-foreground/50">
            <path d="M15 1 L1 15 M15 7 L7 15 M15 13 L13 15" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      )}
    </div>
  );
}
