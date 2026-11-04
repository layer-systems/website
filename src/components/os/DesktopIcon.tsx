import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { menuJustOpened } from '@/os/menuTiming';

type DesktopIconProps = Omit<React.ComponentProps<'button'>, 'onSelect'> & {
  /** App id or folder id. */
  itemId: string;
  label: string;
  /** The icon tile: an `AppGlyph` or a `FolderGlyph`. */
  glyph: ReactNode;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  dragging?: boolean;
  pickedUp?: boolean;
};

/**
 * One desktop icon — an app or a folder. Extra props (and the ref) are passed
 * through to the button so it can be a Radix `ContextMenuTrigger` child.
 */
export function DesktopIcon({
  itemId,
  label,
  glyph,
  selected,
  onSelect,
  onOpen,
  onKeyDown,
  dragging,
  pickedUp,
  className,
  ...props
}: DesktopIconProps) {
  return (
    <button
      type="button"
      data-icon-id={itemId}
      {...props}
      onClick={() => {
        if (!menuJustOpened()) onSelect();
      }}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'group flex w-20 flex-col items-center gap-1.5 rounded-lg p-2 text-center select-none transition-[background-color,transform,box-shadow] motion-reduce:transition-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected || pickedUp ? 'bg-primary/15' : 'hover:bg-foreground/5',
        dragging && 'scale-105 cursor-grabbing shadow-lg',
        className,
      )}
      aria-pressed={pickedUp || undefined}
      aria-describedby={pickedUp ? 'icon-layout-status' : undefined}
    >
      <span className="transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0 motion-reduce:transition-none">
        {glyph}
      </span>
      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/80">
        {label}
      </span>
    </button>
  );
}
