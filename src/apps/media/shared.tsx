import { FileAudio, FileQuestion, FileVideo } from 'lucide-react';
import type { ServerState, ServerStatus } from '@/hooks/useBlossom';
import { blobMimeType, mediaCategory, type LibraryBlob } from '@/lib/blossom';
import { sanitizeUrl } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<ServerStatus, string> = {
  checking: 'Checking…',
  online: 'Online',
  probed: 'Online, no listing',
  offline: 'Unreachable',
};

const STATUS_COLORS: Record<ServerStatus, string> = {
  checking: 'bg-muted-foreground/50 motion-safe:animate-pulse',
  online: 'bg-emerald-500',
  probed: 'bg-emerald-500',
  offline: 'bg-destructive',
};

/** Coloured dot plus a text label, so status never relies on colour alone. */
export function ServerStatusBadge({ state, className }: { state: ServerState | undefined; className?: string }) {
  const status = state?.status ?? 'checking';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)} title={state?.error}>
      <span className={cn('size-2 shrink-0 rounded-full', STATUS_COLORS[status])} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** A square preview: the image itself, or an icon for everything else. */
export function BlobThumb({ blob, className }: { blob: LibraryBlob; className?: string }) {
  const category = mediaCategory(blobMimeType(blob));
  const src = sanitizeUrl(blob.url);

  if (category === 'image' && src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn('size-full bg-muted object-cover', className)}
      />
    );
  }

  const Icon = category === 'video' ? FileVideo : category === 'audio' ? FileAudio : FileQuestion;
  return (
    <div className={cn('grid size-full place-items-center bg-muted text-muted-foreground', className)}>
      <Icon className="size-1/3 max-h-10 max-w-10" aria-hidden />
    </div>
  );
}
