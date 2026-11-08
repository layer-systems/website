import { useEffect } from 'react';
import { Loader2, Pause, Play, Podcast } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWindowManager } from '@/os/useWindowManager';
import { currentItem, setPlayerAccount, togglePlay, usePodcastPlayer } from '@/lib/podcastPlayer';
import { cn } from '@/lib/utils';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * A compact transport for the podcast player in the menu bar (desktop) and the
 * mobile header. Podcasts keep playing after their window closes or loses the
 * phone screen, so there must always be a way to pause them and get back.
 */
export function NowPlaying({ compact = false }: { compact?: boolean }) {
  const { user } = useCurrentUser();
  const { openApp } = useWindowManager();
  const player = usePodcastPlayer();
  const item = currentItem(player);

  // Progress is stored per account; keep the player told who is signed in.
  useEffect(() => setPlayerAccount(user?.pubkey), [user?.pubkey]);

  if (!item) return null;

  const active = player.status === 'playing' || player.status === 'loading';
  const open = () => openApp('podcasts', { view: 'episodes', episode: item.id, show: item.showPubkey });

  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={togglePlay}
        className={cn('grid size-6 shrink-0 place-items-center rounded hover:bg-foreground/10', FOCUS)}
        aria-label={active ? `Pause ${item.title}` : `Play ${item.title}`}
      >
        {player.status === 'loading' ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : active ? (
          <Pause className="size-3.5" aria-hidden />
        ) : (
          <Play className="size-3.5" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={open}
        className={cn('flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-foreground/10', FOCUS)}
        aria-label={`Now playing: ${item.title}. Open Podcasts.`}
        title={item.title}
      >
        <Podcast className="size-3.5 shrink-0" aria-hidden />
        {!compact && <span className="hidden max-w-40 truncate text-xs lg:inline">{item.title}</span>}
      </button>
    </div>
  );
}
