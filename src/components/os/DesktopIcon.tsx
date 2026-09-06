import { cn } from '@/lib/utils';
import type { AppDefinition } from '@/os/types';

interface DesktopIconProps {
  app: AppDefinition;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
  dragging?: boolean;
  pickedUp?: boolean;
  style?: React.CSSProperties;
}

export function DesktopIcon({
  app,
  selected,
  onSelect,
  onOpen,
  onPointerDown,
  onKeyDown,
  tabIndex,
  dragging,
  pickedUp,
  style,
}: DesktopIconProps) {
  const Icon = app.icon;

  return (
    <button
      type="button"
      data-icon-id={app.id}
      tabIndex={tabIndex}
      style={style}
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${app.title} — ${app.description}`}
      className={cn(
        'group flex w-20 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-[background-color,transform,box-shadow] motion-reduce:transition-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected || pickedUp ? 'bg-primary/15' : 'hover:bg-foreground/5',
        dragging && 'scale-105 cursor-grabbing shadow-lg',
      )}
      aria-pressed={pickedUp || undefined}
      aria-describedby={pickedUp ? 'icon-layout-status' : undefined}
    >
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-xl border bg-background/80 shadow-sm transition-transform',
          'group-hover:-translate-y-0.5 group-active:translate-y-0',
          selected ? 'border-primary/40' : 'border-os-window-border',
        )}
      >
        <Icon className="size-6 text-primary" aria-hidden />
      </span>
      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/80">
        {app.title}
      </span>
    </button>
  );
}
