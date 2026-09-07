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
  /** The signed-in user's current like on `target`, if any — pass to un-react. */
  existing?: NostrEvent;
}

/**
 * Likes or un-likes a note. Un-reacting publishes a NIP-09 deletion of the
 * previous reaction rather than a new negative one — most relays and clients
 * honor deletions, whereas a `-` reaction would just add a second, conflicting
 * event without necessarily retracting the first from anyone's count.
 */
export function useToggleReaction() {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ target, existing }: ToggleReactionInput) => {
      if (!user) throw new Error('Sign in to react');
      if (existing) {
        return publish.mutateAsync({ kind: DELETION_KIND, content: '', tags: [['e', existing.id]] });
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
    onMutate: async ({ target, existing }) => {
      if (!user) return undefined;
      const key = reactionsQueryKey(target.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NostrEvent[]>(key);

      queryClient.setQueryData<NostrEvent[]>(key, (old = []) => {
        const withoutMine = old.filter((event) => event.pubkey !== user.pubkey);
        if (existing) return withoutMine;
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
    onSettled: (_data, _error, { target }) => {
      queryClient.invalidateQueries({ queryKey: reactionsQueryKey(target.id) });
    },
  });
}
