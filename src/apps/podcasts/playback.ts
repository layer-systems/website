import { currentItem, usePodcastPlayer, type QueueItem } from '@/lib/podcastPlayer';
import type { PodcastEpisode, PodcastShow } from '@/lib/podcasts';

export function toQueueItem(episode: PodcastEpisode, show?: PodcastShow): QueueItem {
  return {
    id: episode.id,
    showPubkey: episode.showPubkey,
    title: episode.title,
    showTitle: show?.title,
    image: episode.image ?? show?.image,
    sources: episode.sources,
  };
}

export function useEpisodePlayback(id: string) {
  const player = usePodcastPlayer();
  const current = currentItem(player);
  const isCurrent = current?.id === id;
  return {
    isCurrent,
    isPlaying: isCurrent && (player.status === 'playing' || player.status === 'loading'),
    queued: player.queue.some((entry) => entry.id === id),
  };
}

