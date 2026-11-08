import { useState, type ReactNode } from 'react';
import { ListPlus, ListX, Mic, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { absoluteTime, relativeTime } from '@/lib/nostrUtils';
import { enqueue, playNow, removeFromQueue, togglePlay } from '@/lib/podcastPlayer';
import { toQueueItem, useEpisodePlayback } from './playback';
import { formatClock, type PodcastEpisode, type PodcastShow } from '@/lib/podcasts';

/** Cover art from an already-sanitized https URL, with a neutral fallback when it fails. */
export function Artwork({
  src,
  alt = '',
  className,
  blurred = false,
}: {
  src?: string;
  alt?: string;
  className?: string;
  blurred?: boolean;
}) {
  const [failed, setFailed] = useState<string | undefined>();
  const usable = src && failed !== src ? src : undefined;
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-lg bg-muted', className)}>
      {usable ? (
        <img
          src={usable}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(usable)}
          className={cn('size-full object-cover', blurred && 'scale-110 blur-xl')}
        />
      ) : (
        <div className="grid size-full place-items-center text-muted-foreground" aria-hidden>
          <Mic className="size-1/3 min-h-4 min-w-4" />
        </div>
      )}
    </div>
  );
}

/** NIP-36: hides sensitive notes and artwork until the listener chooses to see them. */
export function ContentWarningGate({
  reason,
  children,
  revealed,
  onReveal,
}: {
  reason: string | undefined;
  children: ReactNode;
  revealed: boolean;
  onReveal: () => void;
}) {
  if (reason === undefined || revealed) return <>{children}</>;
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-sm">
      <p className="font-medium">Content warning</p>
      <p className="mt-1 text-muted-foreground">{reason || 'The publisher marked this as sensitive.'}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onReveal}>
        Show anyway
      </Button>
    </div>
  );
}

export function PlayButton({ episode, show, className }: { episode: PodcastEpisode; show?: PodcastShow; className?: string }) {
  const { isCurrent, isPlaying } = useEpisodePlayback(episode.id);
  return (
    <Button
      size="icon"
      className={cn('size-9 shrink-0 rounded-full', className)}
      onClick={() => (isCurrent ? togglePlay() : playNow(toQueueItem(episode, show)))}
      aria-label={isPlaying ? `Pause ${episode.title}` : `Play ${episode.title}`}
    >
      {isPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
    </Button>
  );
}

export function QueueButton({ episode, show }: { episode: PodcastEpisode; show?: PodcastShow }) {
  const { queued, isCurrent } = useEpisodePlayback(episode.id);
  if (isCurrent) return null;
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-9 shrink-0"
      onClick={() => (queued ? removeFromQueue(episode.id) : enqueue(toQueueItem(episode, show)))}
      aria-label={queued ? `Remove ${episode.title} from the queue` : `Add ${episode.title} to the queue`}
      title={queued ? 'Remove from queue' : 'Add to queue'}
    >
      {queued ? <ListX className="size-4" aria-hidden /> : <ListPlus className="size-4" aria-hidden />}
    </Button>
  );
}

export function EpisodeRow({
  episode,
  show,
  onOpen,
  progress,
}: {
  episode: PodcastEpisode;
  show?: PodcastShow;
  onOpen: () => void;
  progress?: { position: number; duration: number };
}) {
  const sensitive = episode.contentWarning !== undefined || show?.contentWarning !== undefined;
  return (
    <li className="group flex items-center gap-3 border-b border-border px-3 py-2.5">
      <PlayButton episode={episode} show={show} />
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Artwork src={episode.image ?? show?.image} className="size-12" blurred={sensitive} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-medium leading-snug">{episode.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="truncate">{show?.title ?? 'Unknown show'}</span>
            <time dateTime={new Date(episode.createdAt * 1000).toISOString()} title={absoluteTime(episode.createdAt)}>
              {relativeTime(episode.createdAt)}
            </time>
            {progress && progress.duration > 0 && (
              <span className="tabular-nums">{formatClock(progress.duration - progress.position)} left</span>
            )}
            {sensitive && <span className="rounded bg-muted px-1.5 py-px">Content warning</span>}
          </span>
        </span>
      </button>
      <QueueButton episode={episode} show={show} />
    </li>
  );
}

export function ShowRow({ show, onOpen, trailing }: { show: PodcastShow; onOpen: () => void; trailing?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 border-b border-border px-3 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Artwork src={show.image} className="size-14" blurred={show.contentWarning !== undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{show.title}</span>
          {show.description && (
            <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{show.description}</span>
          )}
        </span>
      </button>
      {trailing}
    </li>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 border-b border-border px-3 py-2.5">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LoadMore({
  hasMore,
  loading,
  onLoad,
  label = 'Load more',
}: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
  label?: string;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center p-3">
      <Button size="sm" variant="outline" onClick={onLoad} disabled={loading}>
        {loading ? 'Loading…' : label}
      </Button>
    </div>
  );
}
