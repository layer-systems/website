import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useRelayHints } from './useRelayHints';

/**
 * NIP-18 reposts: kind 6 is reserved for reposting kind-1 notes; kind 16 is
 * the "generic repost" used for anything else.
 */
export const REPOST_KIND = 6;
export const GENERIC_REPOST_KIND = 16;
const DELETION_KIND = 5;

function repostsQueryKey(eventId: string) {
  return ['nostr', 'reposts', eventId] as const;
}

/** All kind-6/16 reposts of `eventId`, newest first. */
export function useReposts(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: repostsQueryKey(eventId ?? ''),
    enabled: Boolean(eventId),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [REPOST_KIND, GENERIC_REPOST_KIND], '#e': [eventId!], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });
}

export interface RepostSummary {
  /** Distinct authors who currently have a repost of the target. */
  count: number;
  byAuthor: Map<string, NostrEvent>;
}

/** Only the most recent repost per author — an author can end up with more
 * than one over time (retries, multiple devices), but it's a single repost. */
export function summarizeReposts(events: NostrEvent[] | undefined): RepostSummary {
  const byAuthor = new Map<string, NostrEvent>();
  for (const event of events ?? []) {
    const existing = byAuthor.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) {
      byAuthor.set(event.pubkey, event);
    }
  }
  return { count: byAuthor.size, byAuthor };
}

/**
 * The event embedded in a NIP-18 repost's `content`, if the reposter chose to
 * include one. Content is optional per spec (and always empty for reposts of
 * NIP-70-protected notes), and a repost of a NIP-70-protected note or a
 * malformed/mismatched blob is treated the same as "not included" — callers
 * fall back to fetching the note by its `e` tag instead.
 */
export function parseEmbeddedRepost(event: NostrEvent): NostrEvent | null {
  const trimmed = event.content.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<NostrEvent>;
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.pubkey === 'string' &&
      typeof parsed.content === 'string' &&
      typeof parsed.created_at === 'number' &&
      typeof parsed.kind === 'number' &&
      Array.isArray(parsed.tags)
    ) {
      return parsed as NostrEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/** The id and relay hint carried by a repost's required `e` tag, or null if missing. */
export function repostReference(event: NostrEvent): { id: string; relay?: string } | null {
  const tag = event.tags.find(([name, value]) => name === 'e' && Boolean(value));
  if (!tag) return null;
  return { id: tag[1], relay: tag[2] || undefined };
}

interface ToggleRepostInput {
  /** The note being reposted. */
  target: NostrEvent;
  /** The signed-in user's own repost events on `target`, if any — pass to un-repost. */
  ownReposts?: NostrEvent[];
}

/**
 * Reposts or un-reposts `target`. Un-reposting publishes a NIP-09 deletion
 * covering *all* of the viewer's own repost events on the target (kind 6/16
 * is not replaceable, so more than one can accumulate), the same approach
 * `useToggleReaction` takes for likes.
 */
export function useToggleRepost() {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();
  const hints = useRelayHints();

  return useMutation({
    mutationFn: async ({ target, ownReposts }: ToggleRepostInput) => {
      if (!user) throw new Error('Sign in to repost');
      if (ownReposts && ownReposts.length > 0) {
        return publish.mutateAsync({
          kind: DELETION_KIND,
          content: '',
          tags: [
            ...ownReposts.map((event): [string, string] => ['e', event.id]),
            ['k', String(ownReposts[0].kind)],
          ],
        });
      }

      const relay = hints[0] ?? '';
      const isKind1 = target.kind === 1;
      return publish.mutateAsync({
        kind: isKind1 ? REPOST_KIND : GENERIC_REPOST_KIND,
        // Recommended by NIP-18 so the repost stands on its own; omitted
        // entirely for NIP-70-protected notes would be a further refinement,
        // but this app doesn't yet surface that protection marker.
        content: JSON.stringify(target),
        tags: [
          ['e', target.id, relay],
          ['p', target.pubkey],
          ...(isKind1 ? [] : [['k', String(target.kind)]]),
        ],
      });
    },
    onSuccess: (_publishedEvent, { target }) => {
      // Reposts are eventually consistent across relays like reactions are;
      // a plain invalidate (rather than an optimistic merge) is enough here
      // since — unlike likes — there's no immediate toggle-back interaction
      // that depends on the freshly published event's real id.
      queryClient.invalidateQueries({ queryKey: repostsQueryKey(target.id) });
    },
  });
}

/**
 * The `nostr:nevent...` reference a quote post embeds in its `content` so
 * that clients without `q`-tag support still render a clickable mention of
 * the quoted note.
 */
export function buildQuoteReference(target: NostrEvent, relays: string[]): string {
  const nevent = nip19.neventEncode({
    id: target.id,
    author: target.pubkey,
    kind: target.kind,
    relays,
  });
  return `nostr:${nevent}`;
}

interface CreateQuotePostInput {
  /** The note being quoted. */
  target: NostrEvent;
  /** The quoting user's own commentary; may be empty. */
  content: string;
}

/**
 * Publishes a NIP-18 quote post: a regular kind-1 note carrying a `q` tag to
 * the quoted event (so it isn't mistaken for a reply in threads) plus an
 * embedded `nostr:` reference in the content for wider compatibility.
 */
export function useCreateQuotePost() {
  const publish = useNostrPublish();
  const hints = useRelayHints();

  return useMutation({
    mutationFn: async ({ target, content }: CreateQuotePostInput) => {
      const trimmed = content.trim();
      const reference = buildQuoteReference(target, hints);
      return publish.mutateAsync({
        kind: 1,
        content: trimmed ? `${trimmed}\n\n${reference}` : reference,
        tags: [
          ['q', target.id, hints[0] ?? '', target.pubkey],
          ['p', target.pubkey],
        ],
      });
    },
  });
}
