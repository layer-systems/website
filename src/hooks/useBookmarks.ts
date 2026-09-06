import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

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

/** The current user's kind 10003 bookmark list, or null if they don't have one yet. */
export function useBookmarkList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<NostrEvent | null>({
    queryKey: bookmarkQueryKey(user?.pubkey),
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query(
        [{ kinds: [BOOKMARK_LIST_KIND], authors: [user!.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return event ?? null;
    },
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
 * Adds or removes one target from the bookmark list. Reads the list back
 * before writing — kind 10003 is a whole-list replacement, so publishing
 * without the existing entries would silently drop them, the same trap
 * NIP-02 follow lists have.
 */
export function useToggleBookmark() {
  const { user } = useCurrentUser();
  const list = useBookmarkList();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (target: BookmarkTarget) => {
      if (!user) throw new Error('Sign in to bookmark');
      const currentTags = list.data?.tags ?? [];
      const already = currentTags.some(([name, value]) => name === target.type && value === target.value);
      const tags = already
        ? currentTags.filter(([name, value]) => !(name === target.type && value === target.value))
        : [...currentTags, [target.type, target.value]];

      return publish.mutateAsync({
        kind: BOOKMARK_LIST_KIND,
        content: list.data?.content ?? '',
        tags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkQueryKey(user?.pubkey) });
    },
  });
}
