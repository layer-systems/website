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

const HTTPS_SCHEME_RE = /^https:\/\//i;

/**
 * The `d` tag per NIP-B0: the URI with the `https://` scheme stripped (every
 * other scheme keeps its full form, so it round-trips through `bookmarkUrl`).
 * The scheme match is case-insensitive so "HTTPS://" and "https://" collapse
 * to the same `d` tag instead of creating duplicate bookmarks.
 */
export function bookmarkDTag(url: string): string {
  return HTTPS_SCHEME_RE.test(url) ? url.slice('https://'.length) : url;
}

/** Hierarchical URIs, e.g. `http://…` or `gemini://…` — the `//` is what rules out a false match on a stripped https URL that happens to contain a port, e.g. `alice.blog:8080/post`. */
const HIERARCHICAL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
/** Non-hierarchical URIs with no `//`, e.g. `mailto:` and `nostr:` — not matched by the pattern above. */
const OPAQUE_SCHEMES = ['mailto:', 'nostr:'];

/** Reconstructs a clickable URL from a `d` tag written by `bookmarkDTag`. */
export function bookmarkUrl(dTag: string): string {
  const lower = dTag.toLowerCase();
  const alreadyHasScheme =
    HIERARCHICAL_SCHEME_RE.test(dTag) || OPAQUE_SCHEMES.some((scheme) => lower.startsWith(scheme));
  return alreadyHasScheme ? dTag : `https://${dTag}`;
}

export interface WebBookmarkInput {
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
}

/**
 * Addressable events: relays across the pool can hand back more than one
 * revision of the same `d` tag (an edit history, or just multiple relays
 * disagreeing on what's current). Keeps only the newest per `d`, newest first.
 */
export function dedupeLatestByDTag(events: NostrEvent[]): NostrEvent[] {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    const dTag = tagValue(event, 'd');
    if (!dTag) continue;
    const current = latest.get(dTag);
    if (!current || event.created_at > current.created_at) latest.set(dTag, event);
  }
  return [...latest.values()].sort((a, b) => b.created_at - a.created_at);
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
      return dedupeLatestByDTag(events);
    },
    staleTime: 60_000,
  });
}

export function useCreateWebBookmark() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ url, title, description, tags }: WebBookmarkInput) => {
      if (!user) throw new Error('Sign in to bookmark a page');

      const dTag = bookmarkDTag(url);
      // Re-bookmarking an already-saved URL is an edit of the same
      // addressable event, not a new bookmark — published_at per NIP-B0 is
      // "the first time the bookmark was published", so it must carry over
      // rather than being reset to now on every edit.
      const [existing] = await nostr.query(
        [{ kinds: [WEB_BOOKMARK_KIND], authors: [user.pubkey], '#d': [dTag], limit: 1 }],
        { signal: AbortSignal.timeout(6000) },
      );
      const publishedAt = existing
        ? (tagValue(existing, 'published_at') ?? String(existing.created_at))
        : String(Math.floor(Date.now() / 1000));

      const eventTags: string[][] = [['d', dTag]];
      if (title?.trim()) eventTags.push(['title', title.trim()]);
      for (const tag of tags ?? []) {
        if (tag.trim()) eventTags.push(['t', tag.trim().toLowerCase()]);
      }
      eventTags.push(['published_at', publishedAt]);

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
