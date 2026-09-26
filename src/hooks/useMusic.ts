import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNip51List, useNip51Sets } from '@/hooks/useNip51Lists';
import { latestTracks, parseTrackAddress, PLAYLIST_KIND, TRACK_KIND, type Track } from '@/lib/music';
import type { Nip51List } from '@/lib/nip51';

const requestSignal = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(8000)]);

export function useMusicTracks(authors: string[] | null | undefined, key: readonly unknown[]) {
  const { nostr } = useNostr();
  return useQuery<Track[]>({
    queryKey: ['nostr', 'music', 'tracks', ...key],
    enabled: authors === null || (authors?.length ?? 0) > 0,
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [TRACK_KIND], ...(authors ? { authors } : {}), limit: 150 }], { signal: requestSignal(signal) });
      return latestTracks(events);
    },
    staleTime: 30_000,
  });
}

export function useMusicTrack(pubkey: string | undefined, identifier: string | undefined, relays?: string[]) {
  const { nostr } = useNostr();
  return useQuery<Track | null>({
    queryKey: ['nostr', 'music', 'track', pubkey ?? '', identifier ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(pubkey && identifier),
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{
        kinds: [TRACK_KIND], authors: [pubkey!], '#d': [identifier!], limit: 5,
      }], { signal: requestSignal(signal), ...(relays?.length ? { relays } : {}) });
      return latestTracks(events.filter((event) => event.pubkey === pubkey && event.tags.some(([name, value]) => name === 'd' && value === identifier)))[0] ?? null;
    },
    staleTime: 30_000,
  });
}

export function useMusicPlaylists() {
  const { user } = useCurrentUser();
  return useNip51Sets(user?.pubkey, PLAYLIST_KIND, (lists) =>
    lists.filter((list) => list.identifier?.startsWith('music-')),
  );
}

export function useMusicPlaylist(pubkey: string | undefined, identifier: string | undefined, relays?: string[]) {
  return useNip51List(pubkey, PLAYLIST_KIND, identifier, undefined, relays);
}

export function playlistAddresses(list: Nip51List | undefined): string[] {
  return (list?.publicItems ?? [])
    .filter(([name, address]) => name === 'a' && parseTrackAddress(address))
    .map(([, address]) => address);
}

export function usePlaylistTracks(list: Nip51List | undefined, relays?: string[]) {
  const { nostr } = useNostr();
  const addresses = playlistAddresses(list);
  return useQuery<Track[]>({
    queryKey: ['nostr', 'music', 'playlist-tracks', list?.pubkey ?? '', list?.identifier ?? '', addresses.join('|'), relays?.join(',') ?? ''],
    enabled: Boolean(list && addresses.length),
    queryFn: async ({ signal }) => {
      const parsed = addresses.map(parseTrackAddress).filter((address): address is { pubkey: string; identifier: string } => Boolean(address));
      const filters = parsed.map(({ pubkey, identifier }) => ({ kinds: [TRACK_KIND], authors: [pubkey], '#d': [identifier], limit: 2 }));
      const events = await nostr.query(filters, { signal: requestSignal(signal), ...(relays?.length ? { relays } : {}) });
      const found = new Map(latestTracks(events).map((track) => [`${track.event.pubkey}:${track.identifier}`, track]));
      return parsed.map(({ pubkey, identifier }) => found.get(`${pubkey}:${identifier}`)).filter((track): track is Track => Boolean(track));
    },
    staleTime: 30_000,
  });
}
