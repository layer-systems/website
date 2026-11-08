import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNip51List, useNip51ListMutation } from '@/hooks/useNip51Lists';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { itemKey } from '@/lib/nip51';
import { newestEvent, queryBeforeWrite } from '@/lib/replaceableLists';
import {
  AUTHORED_PODCASTS_KIND,
  FAVORITE_PODCASTS_KIND,
  PODCAST_EPISODE_KIND,
  PODCAST_METADATA_KIND,
  authoredShows,
  isHexPubkey,
  newestShows,
  parseEpisode,
  parseEpisodes,
  parsePodcastMetadata,
  type PodcastEpisode,
  type PodcastShow,
} from '@/lib/podcasts';

const PAGE_SIZE = 30;

function withTimeout(signal: AbortSignal, ms = 8000) {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

interface Page<T> {
  items: T[];
  /** `until` for the next page, or undefined when the relays returned nothing new. */
  next?: number;
}

/**
 * A paginated, `until`-based feed of episodes: everyone's when `show` is
 * omitted, otherwise only events signed by that show key.
 */
export function useEpisodeFeed(show?: string, relays?: string[]) {
  const { nostr } = useNostr();
  return useInfiniteQuery<Page<PodcastEpisode>>({
    queryKey: ['nostr', 'podcasts', 'episodes', show ?? 'all', relays?.join(',') ?? ''],
    enabled: show === undefined || isHexPubkey(show),
    initialPageParam: undefined,
    queryFn: async ({ pageParam, signal }) => {
      const filter: NostrFilter = { kinds: [PODCAST_EPISODE_KIND], limit: PAGE_SIZE };
      if (show) filter.authors = [show];
      if (typeof pageParam === 'number') filter.until = pageParam;
      const events = await nostr.query([filter], { signal: withTimeout(signal), relays });
      const valid = parseEpisodes(events.filter((event) => !show || event.pubkey === show));
      const oldest = events.reduce<number | undefined>((min, event) => (min === undefined || event.created_at < min ? event.created_at : min), undefined);
      // Continue strictly before the oldest event seen. Pages are merged by id,
      // so an event several relays return twice is still listed once.
      return { items: valid, next: events.length > 0 && oldest !== undefined ? oldest - 1 : undefined };
    },
    getNextPageParam: (last) => last.next,
    staleTime: 60_000,
  });
}

/** Recently updated shows, newest first. Each metadata event is the show's own, signed by its key. */
export function useShowDirectory() {
  const { nostr } = useNostr();
  return useInfiniteQuery<Page<PodcastShow>>({
    queryKey: ['nostr', 'podcasts', 'shows'],
    initialPageParam: undefined,
    queryFn: async ({ pageParam, signal }) => {
      const filter: NostrFilter = { kinds: [PODCAST_METADATA_KIND], limit: PAGE_SIZE };
      if (typeof pageParam === 'number') filter.until = pageParam;
      const events = await nostr.query([filter], { signal: withTimeout(signal) });
      const shows = [...newestShows(events).values()].sort((a, b) => b.createdAt - a.createdAt);
      const oldest = events.reduce<number | undefined>((min, event) => (min === undefined || event.created_at < min ? event.created_at : min), undefined);
      return { items: shows, next: events.length > 0 && oldest !== undefined ? oldest - 1 : undefined };
    },
    getNextPageParam: (last) => last.next,
    staleTime: 60_000,
  });
}

/** Merges infinite pages, keeping the first copy of each key. */
export function mergePages<T>(pages: Page<T>[] | undefined, key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      const id = key(item);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(item);
    }
  }
  return items;
}

/**
 * Metadata for specific shows. The filter always constrains `authors`, so a
 * stranger can't publish metadata that appears as someone else's show.
 */
export function useShows(pubkeys: string[], relays?: string[]) {
  const { nostr } = useNostr();
  const sorted = useMemo(() => [...new Set(pubkeys.filter(isHexPubkey))].sort(), [pubkeys]);
  return useQuery<Map<string, PodcastShow>>({
    queryKey: ['nostr', 'podcasts', 'metadata', sorted.join(','), relays?.join(',') ?? ''],
    enabled: sorted.length > 0,
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [PODCAST_METADATA_KIND], authors: sorted, limit: sorted.length * 3 }],
        { signal: withTimeout(signal), relays },
      );
      return newestShows(events.filter((event) => sorted.includes(event.pubkey)));
    },
    staleTime: 5 * 60_000,
  });
}

/** One episode by id. Only a valid kind 54 with exactly that id is accepted. */
export function useEpisode(id: string | undefined, relays?: string[]) {
  const { nostr } = useNostr();
  return useQuery<{ event: NostrEvent; episode: PodcastEpisode } | null>({
    queryKey: ['nostr', 'podcasts', 'episode', id ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(id && /^[0-9a-f]{64}$/.test(id)),
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ ids: [id!], kinds: [PODCAST_EPISODE_KIND], limit: 1 }], { signal: withTimeout(signal), relays });
      const event = events.find((candidate) => candidate.id === id && candidate.kind === PODCAST_EPISODE_KIND);
      const episode = event && parseEpisode(event);
      return event && episode ? { event, episode } : null;
    },
    staleTime: 5 * 60_000,
  });
}

/** Each claimed person's newest kind 10064, used to confirm the show's `p` tags. */
export function useAuthoredLists(pubkeys: string[]) {
  const { nostr } = useNostr();
  const sorted = useMemo(() => [...new Set(pubkeys.filter(isHexPubkey))].sort(), [pubkeys]);
  return useQuery<Map<string, Set<string>>>({
    queryKey: ['nostr', 'podcasts', 'authored', sorted.join(',')],
    enabled: sorted.length > 0,
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [AUTHORED_PODCASTS_KIND], authors: sorted, limit: sorted.length * 3 }],
        { signal: withTimeout(signal) },
      );
      return authoredShows(events.filter((event) => sorted.includes(event.pubkey)));
    },
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Favorites (NIP-51 kind 10054) and authorship (kind 10064)
// ---------------------------------------------------------------------------

/**
 * Show keys in the signed-in user's favorites list. Cached per account by the
 * shared NIP-51 hook, so switching accounts never shows the previous one's list.
 */
export function useFavoriteShows() {
  const { user } = useCurrentUser();
  const list = useNip51List(user?.pubkey, FAVORITE_PODCASTS_KIND);
  const pubkeys = useMemo(
    () => [...new Set([...(list.data?.publicItems ?? []), ...(list.data?.privateItems ?? [])]
      .filter(([name, value]) => name === 'p' && isHexPubkey(value))
      .map(([, value]) => value))],
    [list.data],
  );
  return { ...list, pubkeys };
}

/**
 * Adds or removes one show. The shared NIP-51 mutation reads the newest list
 * from every read relay right before signing, refuses to write after an
 * incomplete read, and keeps every other item, `url` entry and private item.
 */
export function useToggleFavorite() {
  const mutation = useNip51ListMutation();
  return useMutation<unknown, Error, { show: string; favorite: boolean }>({
    mutationFn: ({ show, favorite }) =>
      mutation.mutateAsync({
        kind: FAVORITE_PODCASTS_KIND,
        ops: favorite
          ? [{ type: 'add', tag: ['p', show], private: false }]
          : [{ type: 'remove', key: itemKey(['p', show]) }],
      }),
  });
}

/** Confirms (or withdraws) the signed-in user's authorship of a show in their kind 10064. */
export function useAuthoredClaim() {
  const mutation = useNip51ListMutation();
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { show: string; claim: boolean }>({
    mutationFn: ({ show, claim }) =>
      mutation.mutateAsync({
        kind: AUTHORED_PODCASTS_KIND,
        ops: claim
          ? [{ type: 'add', tag: ['p', show], private: false }]
          : [{ type: 'remove', key: itemKey(['p', show]) }],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nostr', 'podcasts', 'authored'] }),
  });
}

export function useMyAuthoredShows() {
  const { user } = useCurrentUser();
  const list = useNip51List(user?.pubkey, AUTHORED_PODCASTS_KIND);
  return useMemo(
    () => new Set((list.data?.publicItems ?? []).filter(([name, value]) => name === 'p' && isHexPubkey(value)).map(([, value]) => value)),
    [list.data],
  );
}

// ---------------------------------------------------------------------------
// Publishing as the active show identity
// ---------------------------------------------------------------------------

/** The signed-in key's own current kind 10154, if it has one. */
export function useOwnShow() {
  const { user } = useCurrentUser();
  const shows = useShows(user ? [user.pubkey] : []);
  return { ...shows, show: user ? shows.data?.get(user.pubkey) : undefined };
}

/**
 * Publishes a new version of the active account's show metadata. The newest
 * version is read back from every relay first, so tags written by other
 * clients survive and an incomplete read never overwrites the show.
 */
export function usePublishShow() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();
  return useMutation<NostrEvent, Error, (previous: NostrEvent | undefined) => string[][]>({
    scope: { id: `podcast-metadata:${user?.pubkey ?? 'anonymous'}` },
    mutationFn: async (buildTags) => {
      if (!user) throw new Error('Sign in to publish a show.');
      const events = await queryBeforeWrite(nostr, [{ kinds: [PODCAST_METADATA_KIND], authors: [user.pubkey], limit: 5 }]);
      const previous = newestEvent(events.filter((event) => event.pubkey === user.pubkey && event.kind === PODCAST_METADATA_KIND));
      const tags = buildTags(previous);
      const createdAt = Math.max(Math.floor(Date.now() / 1000), (previous?.created_at ?? 0) + 1);
      return publish.mutateAsync({ kind: PODCAST_METADATA_KIND, content: previous?.content ?? '', tags, created_at: createdAt });
    },
    // Written into the cache rather than refetched: a read relay may still
    // serve the previous version for a moment.
    onSuccess: (event) => {
      const show = parsePodcastMetadata(event);
      if (show) queryClient.setQueryData(['nostr', 'podcasts', 'metadata', event.pubkey, ''], new Map([[event.pubkey, show]]));
      queryClient.invalidateQueries({ queryKey: ['nostr', 'podcasts', 'shows'] });
    },
  });
}

export function usePublishEpisode() {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();
  return useMutation<NostrEvent, Error, { tags: string[][]; notes: string }>({
    mutationFn: async ({ tags, notes }) => {
      if (!user) throw new Error('Sign in to publish an episode.');
      return publish.mutateAsync({ kind: PODCAST_EPISODE_KIND, content: notes, tags });
    },
    onSuccess: (event) => {
      const episode = parseEpisode(event);
      if (episode) queryClient.setQueryData(['nostr', 'podcasts', 'episode', event.id, ''], { event, episode });
      queryClient.invalidateQueries({ queryKey: ['nostr', 'podcasts', 'episodes'] });
    },
  });
}
