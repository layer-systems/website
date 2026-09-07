import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

/** NIP-25 reactions. Content `-` is a downvote; anything else (commonly `+`) is a like. */
const REACTION_KIND = 7;
const DELETION_KIND = 5;

function reactionsQueryKey(eventId: string) {
  return ['nostr', 'reactions', eventId] as const;
}

/** All kind-7 reactions to `eventId`, newest first. */
export function useReactions(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: reactionsQueryKey(eventId ?? ''),
    enabled: Boolean(eventId),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [REACTION_KIND], '#e': [eventId!], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });
}

/** Only the most recent reaction per author — an author can change their mind. */
function latestPerAuthor(events: NostrEvent[]): Map<string, NostrEvent> {
  const byAuthor = new Map<string, NostrEvent>();
  for (const event of events) {
    const existing = byAuthor.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) {
      byAuthor.set(event.pubkey, event);
    }
  }
  return byAuthor;
}

export interface ReactionSummary {
  /** Distinct authors whose latest reaction is a like (i.e. not a `-` downvote). */
  count: number;
  byAuthor: Map<string, NostrEvent>;
}

export function summarizeReactions(events: NostrEvent[] | undefined): ReactionSummary {
  const byAuthor = latestPerAuthor(events ?? []);
  let count = 0;
  for (const event of byAuthor.values()) {
    if (event.content !== '-') count++;
  }
  return { count, byAuthor };
}

interface ToggleReactionInput {
  /** The note or reply being reacted to. */
  target: NostrEvent;
  /**
   * All of the signed-in user's own reaction events on `target`, if any —
   * pass to un-react. Kind 7 is a regular (non-replaceable) event, so a user
   * can end up with more than one over time (races, retries, multiple
   * devices); every one of them needs deleting, not just the newest.
   */
  ownReactions?: NostrEvent[];
}

/**
 * Likes or un-likes a note. Un-reacting publishes a single NIP-09 deletion
 * covering *all* of the viewer's own reaction events on the target, rather
 * than just the most recently seen one — most relays and clients honor
 * deletions, whereas a `-` reaction would just add another, conflicting
 * event without necessarily retracting the others. Deleting only the latest
 * would leave any older `+` in place to resurface as "the" reaction (and
 * re-inflate the count) once relays stop returning the deleted one.
 */
export function useToggleReaction() {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ target, ownReactions }: ToggleReactionInput) => {
      if (!user) throw new Error('Sign in to react');
      if (ownReactions && ownReactions.length > 0) {
        return publish.mutateAsync({
          kind: DELETION_KIND,
          content: '',
          tags: [...ownReactions.map((event): [string, string] => ['e', event.id]), ['k', String(REACTION_KIND)]],
        });
      }
      return publish.mutateAsync({
        kind: REACTION_KIND,
        content: '+',
        tags: [
          ['e', target.id],
          ['p', target.pubkey],
          ['k', target.kind.toString()],
        ],
      });
    },
    onMutate: async ({ target, ownReactions }) => {
      if (!user) return undefined;
      const key = reactionsQueryKey(target.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NostrEvent[]>(key);

      queryClient.setQueryData<NostrEvent[]>(key, (old = []) => {
        const withoutMine = old.filter((event) => event.pubkey !== user.pubkey);
        if (ownReactions && ownReactions.length > 0) return withoutMine;
        const optimistic: NostrEvent = {
          id: `optimistic:${target.id}:${user.pubkey}`,
          pubkey: user.pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: REACTION_KIND,
          content: '+',
          tags: [['e', target.id], ['p', target.pubkey]],
          sig: '',
        };
        return [optimistic, ...withoutMine];
      });

      return { previous, key };
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    // Deliberately not `invalidateQueries` here: right after a successful
    // publish, relays are eventually consistent, so an immediate re-query
    // commonly hits one that hasn't indexed the new event yet — the stale
    // result would silently overwrite the correct state a moment later
    // (confirmed live: a like reverted to "unliked" ~1s after publishing).
    // Swapping in the mutation's own known-correct result is also required,
    // not just safer: `onMutate`'s optimistic entry uses a fake
    // `optimistic:...` id, and a like followed immediately by an unlike needs
    // the *real* signed event id to build a deletion relays will honor —
    // without this, that later delete would target an id that never existed.
    onSuccess: (publishedEvent, { target, ownReactions }) => {
      if (!user) return;
      queryClient.setQueryData<NostrEvent[]>(reactionsQueryKey(target.id), (old = []) => {
        const withoutMine = old.filter((event) => event.pubkey !== user.pubkey);
        return ownReactions && ownReactions.length > 0 ? withoutMine : [publishedEvent, ...withoutMine];
      });
    },
  });
}
