import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { tagValue } from '@/lib/nostrUtils';

const ARTICLE_KIND = 30023;

/** NIP-51 "Bookmarks": an uncategorized, global, replaceable list per user. */
export const BOOKMARK_LIST_KIND = 10003;

export interface BookmarkTarget {
  /** `e` for a kind-1 note, `a` for an addressable event (e.g. a NIP-23 article). */
  type: 'e' | 'a';
  /** An event id for `e`, or `kind:pubkey:d-identifier` for `a`. */
  value: string;
}

function bookmarkQueryKey(pubkey: string | undefined) {
  return ['nostr', 'bookmarks', pubkey ?? ''] as const;
}

async function fetchBookmarkList(
  nostr: ReturnType<typeof useNostr>['nostr'],
  pubkey: string,
  signal?: AbortSignal,
): Promise<NostrEvent | null> {
  const [event] = await nostr.query(
    [{ kinds: [BOOKMARK_LIST_KIND], authors: [pubkey], limit: 1 }],
    { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)].filter((s): s is AbortSignal => Boolean(s))) },
  );
  return event ?? null;
}

/** The current user's kind 10003 bookmark list, or null if they don't have one yet. */
export function useBookmarkList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<NostrEvent | null>({
    queryKey: bookmarkQueryKey(user?.pubkey),
    enabled: Boolean(user),
    queryFn: ({ signal }) => fetchBookmarkList(nostr, user!.pubkey, signal),
    staleTime: 60_000,
  });
}

/** The list's public `e`/`a` entries, in the shape a `BookmarkButton` checks against. */
export function useBookmarkedTargets(): BookmarkTarget[] {
  const { data } = useBookmarkList();
  if (!data) return [];
  return data.tags
    .filter((tag): tag is [string, string] => (tag[0] === 'e' || tag[0] === 'a') && Boolean(tag[1]))
    .map(([type, value]) => ({ type: type as 'e' | 'a', value }));
}

export function isBookmarked(targets: BookmarkTarget[], target: BookmarkTarget): boolean {
  return targets.some((t) => t.type === target.type && t.value === target.value);
}

/**
 * Adds or removes one target from the bookmark list. Fetches the list fresh
 * from relays right before writing — kind 10003 is a whole-list replacement,
 * so publishing against a stale cached copy (the query's staleTime is 60s)
 * could silently drop entries added from another tab or device in the
 * meantime, the same trap NIP-02 follow lists have.
 */
export function useToggleBookmark() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (target: BookmarkTarget) => {
      if (!user) throw new Error('Sign in to bookmark');
      const current = await fetchBookmarkList(nostr, user.pubkey);
      const currentTags = current?.tags ?? [];
      const already = currentTags.some(([name, value]) => name === target.type && value === target.value);
      const tags = already
        ? currentTags.filter(([name, value]) => !(name === target.type && value === target.value))
        : [...currentTags, [target.type, target.value]];

      return publish.mutateAsync({
        kind: BOOKMARK_LIST_KIND,
        content: current?.content ?? '',
        tags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkQueryKey(user?.pubkey) });
    },
  });
}

interface ParsedAddress {
  kind: number;
  pubkey: string;
  identifier: string;
}

/** Parses a NIP-01 `kind:pubkey:d-identifier` address tag value, or null if malformed. */
function parseAddress(address: string): ParsedAddress | null {
  const [kindPart, pubkey, ...rest] = address.split(':');
  const kind = Number(kindPart);
  const identifier = rest.join(':');
  if (!Number.isInteger(kind) || !pubkey) return null;
  return { kind, pubkey, identifier };
}

/** The current user's bookmarked note ids (`e` tags), skipping any malformed entries. */
export function useBookmarkedNoteIds(): string[] {
  const targets = useBookmarkedTargets();
  return useMemo(
    () => targets.filter((t) => t.type === 'e').map((t) => t.value),
    [targets],
  );
}

/**
 * The current user's bookmarked NIP-23 articles, fetched and narrowed back
 * down to the exact `kind:pubkey:d` triples bookmarked — the relay filter
 * can only constrain by kind/author/`d`, not the full address.
 */
export function useMyBookmarkedArticles() {
  const { nostr } = useNostr();
  const targets = useBookmarkedTargets();

  const addresses = useMemo(() => targets.filter((t) => t.type === 'a').map((t) => t.value), [targets]);
  const parsed = useMemo(
    () =>
      addresses
        .map(parseAddress)
        .filter((a): a is ParsedAddress => a !== null && a.kind === ARTICLE_KIND),
    [addresses],
  );
  const authors = useMemo(() => [...new Set(parsed.map((a) => a.pubkey))], [parsed]);
  const dTags = useMemo(() => [...new Set(parsed.map((a) => a.identifier))], [parsed]);

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'bookmarked-articles', addresses.join(',')],
    enabled: parsed.length > 0,
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [ARTICLE_KIND], authors, '#d': dTags, limit: parsed.length * 2 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      const wanted = new Set(addresses);
      return events.filter((event) => wanted.has(`${event.kind}:${event.pubkey}:${tagValue(event, 'd')}`));
    },
    staleTime: 60_000,
  });
}
