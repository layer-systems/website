import type { CSSProperties } from 'react';
import { Folder as FolderGlyph } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FolderVisualProps {
  /** The folder's display name. */
  label: string;
  /** Stacked behind the folder glyph, e.g. the icons of the apps inside. */
  badges: React.ReactNode[];
  /** How many apps are inside; announced to assistive tech. */
  count: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  /** Stops long-press context menus from bubbling to the desktop surface. */
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
  dragging?: boolean;
  pickedUp?: boolean;
  /** Highlighted while an app is dragged over the folder. */
  dropTarget?: boolean;
  style?: CSSProperties;
  className?: string;
  /** Hit-target id used by drag-and-drop on the home screen. */
  'data-home-icon-id'?: string;
}

/**
 * A folder on the desktop/home screen, styled after DesktopIcon: the glyph
 * carries up to three mini-badges with the icons of the apps inside.
 */
export function FolderVisual({
  label,
  badges,
  count,
  selected,
  onSelect,
  onOpen,
  onPointerDown,
  onContextMenu,
  onKeyDown,
  tabIndex,
  dragging,
  pickedUp,
  dropTarget,
  style,
  className,
  'data-home-icon-id': homeIconId,
}: FolderVisualProps) {
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      style={style}
      data-home-icon-id={homeIconId}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={`${label} — folder with ${count} ${count === 1 ? 'app' : 'apps'}`}
      aria-pressed={pickedUp || undefined}
      aria-describedby={pickedUp ? 'icon-layout-status' : undefined}
      className={cn(
        'group flex w-20 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-[background-color,transform,box-shadow] motion-reduce:transition-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected || pickedUp ? 'bg-primary/15' : 'hover:bg-foreground/5',
        dragging && 'scale-105 cursor-grabbing shadow-lg',
        dropTarget && 'ring-2 ring-primary/60 bg-primary/10',
        className,
      )}
    >
      <span
        className={cn(
          'relative flex size-12 items-center justify-center rounded-xl border bg-background/80 shadow-sm transition-transform',
          'group-hover:-translate-y-0.5 group-active:translate-y-0',
          selected ? 'border-primary/40' : 'border-os-window-border',
        )}
      >
        <FolderGlyph className="size-6 text-primary" aria-hidden />
        {badges.length > 0 && (
          <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2" aria-hidden>
            {badges.slice(0, 3).map((badge, index) => (
              <span
                key={index}
                className={cn(
                  'flex size-4 items-center justify-center rounded-full border border-os-window-border bg-background shadow-sm',
                  index > 0 && '-ml-1.5',
                )}
              >
                {badge}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/80">
        {label}
      </span>
    </button>
  );
}
