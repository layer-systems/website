import { cn } from '@/lib/utils';
import type { AppFolder } from '@/lib/appFolders';
import type { AppDefinition } from '@/os/types';

export type GlyphSize = 'desktop' | 'mobile';

const TILE: Record<GlyphSize, string> = {
  desktop: 'size-12 rounded-xl',
  mobile: 'size-14 rounded-2xl',
};

const APP_ICON: Record<GlyphSize, string> = {
  desktop: 'size-6',
  mobile: 'size-7',
};

interface GlyphProps {
  size: GlyphSize;
  /** Highlighted as the drop target of an app being dragged onto it. */
  mergeTarget?: boolean;
  className?: string;
}

export function AppGlyph({ app, size, mergeTarget, className }: GlyphProps & { app: AppDefinition }) {
  const Icon = app.icon;
  return (
    <span
      data-home-glyph
      className={cn(
        'flex shrink-0 items-center justify-center border bg-background/80 shadow-sm transition-transform motion-reduce:transition-none',
        TILE[size],
        mergeTarget ? 'scale-110 border-primary ring-4 ring-primary/30' : 'border-os-window-border',
        className,
      )}
    >
      <Icon className={cn(APP_ICON[size], 'text-primary')} aria-hidden />
    </span>
  );
}

/**
 * A folder looks like a phone's: a translucent tile previewing up to nine of
 * the apps inside, so it reads as "a group of these" without a label.
 */
export function FolderGlyph({
  folder,
  appsById,
  size,
  mergeTarget,
  className,
}: GlyphProps & { folder: AppFolder; appsById: Map<string, AppDefinition> }) {
  const preview = folder.apps.map((id) => appsById.get(id)).filter((app): app is AppDefinition => Boolean(app)).slice(0, 9);
  return (
    <span
      data-home-glyph
      className={cn(
        'grid shrink-0 grid-cols-3 content-center justify-items-center gap-0.5 border bg-foreground/10 p-1.5 shadow-sm backdrop-blur-sm transition-transform motion-reduce:transition-none',
        TILE[size],
        mergeTarget ? 'scale-110 border-primary ring-4 ring-primary/30' : 'border-os-window-border',
        className,
      )}
    >
      {preview.map((app) => (
        <span
          key={app.id}
          className={cn(
            'flex items-center justify-center rounded-[3px] bg-background/90',
            size === 'desktop' ? 'size-2.5' : 'size-3',
          )}
        >
          <app.icon className={cn('text-primary', size === 'desktop' ? 'size-2' : 'size-2.5')} aria-hidden strokeWidth={2.5} />
        </span>
      ))}
    </span>
  );
}
