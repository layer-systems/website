import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useNip51List, useNip51ListMutation } from './useNip51Lists';
import { tagValue } from '@/lib/nostrUtils';
import { itemKey, type Nip51List } from '@/lib/nip51';

const ARTICLE_KIND = 30023;

/** NIP-51 "Bookmarks": an uncategorized, global, replaceable list per user. */
export const BOOKMARK_LIST_KIND = 10003;

export interface BookmarkTarget {
  /** `e` for a kind-1 note, `a` for an addressable event (e.g. a NIP-23 article). */
  type: 'e' | 'a';
  /** An event id for `e`, or `kind:pubkey:d-identifier` for `a`. */
  value: string;
}

function toTargets(list: Nip51List): BookmarkTarget[] {
  return [...list.publicItems, ...list.privateItems]
    .filter((tag): tag is [string, string] => (tag[0] === 'e' || tag[0] === 'a') && Boolean(tag[1]))
    .map(([type, value]) => ({ type: type as 'e' | 'a', value }));
}

/**
 * The current user's kind 10003 bookmark list, public and private entries,
 * shared with the Lists app's cache.
 */
export function useBookmarkList() {
  const { user } = useCurrentUser();
  return useNip51List(user?.pubkey, BOOKMARK_LIST_KIND);
}

/** The list's `e`/`a` entries (public and private), in the shape a `BookmarkButton` checks against. */
export function useBookmarkedTargets(): BookmarkTarget[] {
  const { data } = useBookmarkList();
  return useMemo(() => (data ? toTargets(data) : []), [data]);
}

export function isBookmarked(targets: BookmarkTarget[], target: BookmarkTarget): boolean {
  return targets.some((t) => t.type === target.type && t.value === target.value);
}

/**
 * Adds or removes one target from the bookmark list. The shared list mutation
 * re-fetches the list right before writing — kind 10003 is a whole-list
 * replacement, so publishing against a stale cached copy could silently drop
 * entries added from another tab or device in the meantime.
 */
export function useToggleBookmark() {
  const targets = useBookmarkedTargets();
  const mutation = useNip51ListMutation();

  return useMutation({
    mutationFn: (target: BookmarkTarget) =>
      mutation.mutateAsync({
        kind: BOOKMARK_LIST_KIND,
        ops: isBookmarked(targets, target)
          ? [{ type: 'remove', key: itemKey([target.type, target.value]) }]
          : [{ type: 'add', tag: [target.type, target.value], private: false }],
      }),
  });
}

interface ParsedAddress {
  kind: number;
  pubkey: string;
  identifier: string;
}

/**
 * Parses a NIP-01 `kind:pubkey:d-identifier` address tag value, or null if
 * malformed — including an empty identifier, which would otherwise produce
 * a `#d: ['']` relay query and a bookmark nothing can reliably resolve.
 */
function parseAddress(address: string): ParsedAddress | null {
  const [kindPart, pubkey, ...rest] = address.split(':');
  const kind = Number(kindPart);
  const identifier = rest.join(':');
  if (!Number.isInteger(kind) || !pubkey || !identifier) return null;
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
      return events.filter(
        (event) =>
          wanted.has(`${event.kind}:${event.pubkey}:${tagValue(event, 'd')}`) &&
          event.content.trim().length > 0,
      );
    },
    staleTime: 60_000,
  });
}
