import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ListMusic,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PLAYBACK_RATES,
  clearQueue,
  currentItem,
  moveInQueue,
  next,
  playIndex,
  previous,
  removeFromQueue,
  retry,
  seek,
  setRate,
  setVolume,
  skipBy,
  stop,
  toggleMute,
  togglePlay,
  tryNextSource,
  usePodcastPlayer,
} from '@/lib/podcastPlayer';
import { formatClock } from '@/lib/podcasts';
import { Artwork } from './shared';

const RANGE_CLASS =
  'h-1.5 w-full cursor-pointer appearance-auto accent-primary disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * The full transport for the shared player. It only renders the state held by
 * `podcastPlayer`, so unmounting it (closing the window, switching shells)
 * never interrupts playback.
 */
export function PlayerBar({ onOpenEpisode }: { onOpenEpisode: (id: string, show: string) => void }) {
  const player = usePodcastPlayer();
  const item = currentItem(player);
  const [queueOpen, setQueueOpen] = useState(false);

  if (!item) return null;

  const playing = player.status === 'playing';
  const loading = player.status === 'loading';
  const hasDuration = player.duration > 0;
  const upcoming = player.queue.length - player.index - 1;
  const canTryNext = player.sourceIndex < item.sources.length - 1;

  return (
    <section aria-label="Podcast player" className="shrink-0 border-t border-border bg-sidebar">
      {queueOpen && (
        <div id="podcast-queue" className="os-scroll max-h-60 overflow-y-auto border-b border-border">
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Queue</h2>
            {player.queue.length > 1 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearQueue}>
                Clear upcoming
              </Button>
            )}
          </div>
          <ol>
            {player.queue.map((entry, index) => (
              <li
                key={entry.id}
                className={cn('flex items-center gap-2 px-3 py-1.5', index === player.index && 'bg-accent')}
                aria-current={index === player.index ? 'true' : undefined}
              >
                <button
                  type="button"
                  onClick={() => playIndex(index)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={`Play ${entry.title}`}
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{entry.title}</span>
                    {entry.showTitle && <span className="block truncate text-xs text-muted-foreground">{entry.showTitle}</span>}
                  </span>
                </button>
                <Button size="icon" variant="ghost" className="size-7" disabled={index === 0} onClick={() => moveInQueue(entry.id, -1)} aria-label={`Move ${entry.title} up`}>
                  <ChevronUp className="size-4" aria-hidden />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" disabled={index === player.queue.length - 1} onClick={() => moveInQueue(entry.id, 1)} aria-label={`Move ${entry.title} down`}>
                  <ChevronDown className="size-4" aria-hidden />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => removeFromQueue(entry.id)} aria-label={`Remove ${entry.title} from the queue`}>
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(player.status === 'error' || player.status === 'blocked') && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-border bg-destructive/10 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">{player.error}</span>
          {player.status === 'error' ? (
            <>
              <Button size="sm" variant="outline" className="h-7" onClick={retry}>Retry</Button>
              {canTryNext && <Button size="sm" variant="outline" className="h-7" onClick={() => tryNextSource()}>Try another source</Button>}
              {upcoming > 0 && <Button size="sm" variant="outline" className="h-7" onClick={next}>Skip</Button>}
            </>
          ) : (
            <Button size="sm" className="h-7" onClick={togglePlay}>Play</Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 px-3 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenEpisode(item.id, item.showPubkey)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`Open episode details: ${item.title}`}
          >
            <Artwork src={item.image} className="size-10" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.showTitle ?? 'Podcast'}
                {item.sources.length > 1 && ` · source ${player.sourceIndex + 1} of ${item.sources.length}`}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-0.5">
            <Button size="icon" variant="ghost" className="hidden size-8 sm:inline-flex" onClick={previous} aria-label="Previous episode or restart">
              <SkipBack className="size-4" aria-hidden />
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => skipBy(-15)} disabled={!hasDuration} aria-label="Back 15 seconds">
              <RotateCcw className="size-4" aria-hidden />
            </Button>
            <Button size="icon" className="size-10 rounded-full" onClick={togglePlay} aria-label={playing || loading ? 'Pause' : 'Play'}>
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => skipBy(30)} disabled={!hasDuration} aria-label="Forward 30 seconds">
              <RotateCw className="size-4" aria-hidden />
            </Button>
            <Button size="icon" variant="ghost" className="hidden size-8 sm:inline-flex" onClick={next} disabled={upcoming <= 0} aria-label="Next episode">
              <SkipForward className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          <span className="w-14 text-right" aria-hidden>{formatClock(player.currentTime)}</span>
          <input
            type="range"
            className={RANGE_CLASS}
            min={0}
            max={hasDuration ? player.duration : 0}
            step={1}
            value={Math.min(player.currentTime, player.duration || 0)}
            disabled={!hasDuration}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek"
            aria-valuetext={`${formatClock(player.currentTime)} of ${hasDuration ? formatClock(player.duration) : 'unknown length'}`}
          />
          <span className="w-14" aria-hidden>{hasDuration ? formatClock(player.duration) : '--:--'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="ghost" className="size-8" onClick={toggleMute} aria-label={player.muted ? 'Unmute' : 'Mute'} aria-pressed={player.muted}>
            {player.muted || player.volume === 0 ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          </Button>
          <input
            type="range"
            className={cn(RANGE_CLASS, 'w-24')}
            min={0}
            max={1}
            step={0.05}
            value={player.muted ? 0 : player.volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
            aria-valuetext={`${Math.round((player.muted ? 0 : player.volume) * 100)}%`}
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Speed</span>
            <select
              value={player.rate}
              onChange={(event) => setRate(Number(event.target.value))}
              className="h-8 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>{rate}×</option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant={queueOpen ? 'secondary' : 'ghost'}
              className="h-8 gap-1.5 text-xs"
              onClick={() => setQueueOpen((open) => !open)}
              aria-expanded={queueOpen}
              aria-controls="podcast-queue"
            >
              <ListMusic className="size-4" aria-hidden />
              Queue{upcoming > 0 ? ` (${upcoming})` : ''}
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={stop} aria-label="Stop and clear the player">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {player.status === 'playing' ? `Playing ${item.title}` : player.status === 'paused' ? 'Paused' : player.status === 'ended' ? 'Finished' : ''}
        </p>
      </div>
    </section>
  );
}
