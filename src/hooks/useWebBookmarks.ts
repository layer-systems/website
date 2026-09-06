import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { tagValue, tagValues } from '@/lib/nostrUtils';

/** NIP-B0 "Web Bookmarking": one addressable event per bookmarked URL. */
export const WEB_BOOKMARK_KIND = 39701;

function queryKey(pubkey: string | undefined) {
  return ['nostr', 'web-bookmarks', pubkey ?? ''] as const;
}

/**
 * The `d` tag per NIP-B0: the URI with the `https://` scheme stripped (every
 * other scheme keeps its full form, so it round-trips through `bookmarkUrl`).
 */
export function bookmarkDTag(url: string): string {
  return url.startsWith('https://') ? url.slice('https://'.length) : url;
}

/** Reconstructs a clickable URL from a `d` tag written by `bookmarkDTag`. */
export function bookmarkUrl(dTag: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(dTag) ? dTag : `https://${dTag}`;
}

export interface WebBookmarkInput {
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export function useMyWebBookmarks() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<NostrEvent[]>({
    queryKey: queryKey(user?.pubkey),
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [WEB_BOOKMARK_KIND], authors: [user!.pubkey], limit: 200 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events
        .filter((event) => Boolean(tagValue(event, 'd')))
        .sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 60_000,
  });
}

export function useCreateWebBookmark() {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ url, title, description, tags }: WebBookmarkInput) => {
      if (!user) throw new Error('Sign in to bookmark a page');

      const eventTags: string[][] = [['d', bookmarkDTag(url)]];
      if (title?.trim()) eventTags.push(['title', title.trim()]);
      for (const tag of tags ?? []) {
        if (tag.trim()) eventTags.push(['t', tag.trim().toLowerCase()]);
      }
      eventTags.push(['published_at', String(Math.floor(Date.now() / 1000))]);

      return publish.mutateAsync({
        kind: WEB_BOOKMARK_KIND,
        content: description?.trim() ?? '',
        tags: eventTags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(user?.pubkey) });
    },
  });
}

/**
 * A NIP-09 deletion request. Relays are free to ignore it — deletion is a
 * request, not a guarantee — so the removed bookmark is also dropped from
 * the local cache directly rather than waiting on a relay refetch that may
 * still hand it back.
 */
export function useDeleteWebBookmark() {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: NostrEvent) => {
      if (!user) throw new Error('Sign in to remove a bookmark');
      const dTag = tagValue(event, 'd') ?? '';
      return publish.mutateAsync({
        kind: 5,
        content: '',
        tags: [
          ['a', `${WEB_BOOKMARK_KIND}:${user.pubkey}:${dTag}`],
          ['e', event.id],
          ['k', String(WEB_BOOKMARK_KIND)],
        ],
      });
    },
    onSuccess: (_data, removed) => {
      queryClient.setQueryData<NostrEvent[]>(queryKey(user?.pubkey), (current) =>
        current?.filter((event) => event.id !== removed.id),
      );
    },
  });
}

export function webBookmarkTopics(event: NostrEvent): string[] {
  return tagValues(event, 't');
}
