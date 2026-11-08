import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useRelayHints } from './useRelayHints';
import { GENERIC_REPOST_KIND, REPOST_KIND, buildRepost, isRepostOf, repostKindFor } from '@/lib/reposts';

const DELETION_KIND = 5;

function repostsQueryKey(eventId: string) {
  return ['nostr', 'reposts', eventId] as const;
}

/** NIP-18 reposts (kind 6 and generic kind 16) of `target`, newest first. */
export function useReposts(target: NostrEvent | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: repostsQueryKey(target?.id ?? ''),
    enabled: Boolean(target),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [REPOST_KIND, GENERIC_REPOST_KIND], '#e': [target!.id], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events
        .filter((event) => isRepostOf(event, target!.id, target!.kind))
        .sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });
}

/** Distinct reposting authors — one person reposting twice still counts once. */
export function countReposters(events: NostrEvent[] | undefined): number {
  return new Set((events ?? []).map((event) => event.pubkey)).size;
}

interface ToggleRepostInput {
  target: NostrEvent;
  /** All of the viewer's own reposts of `target`; pass to undo the repost. */
  ownReposts?: NostrEvent[];
}

/**
 * Reposts or un-reposts `target`. Undoing publishes one NIP-09 deletion that
 * covers every one of the viewer's reposts of it, mirroring `useToggleReaction`.
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
          tags: [...ownReposts.map((event): [string, string] => ['e', event.id]), ['k', String(repostKindFor(target))]],
        });
      }
      return publish.mutateAsync(buildRepost(target, hints[0] ?? ''));
    },
    onMutate: async ({ target, ownReposts }) => {
      if (!user) return undefined;
      const key = repostsQueryKey(target.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NostrEvent[]>(key);
      queryClient.setQueryData<NostrEvent[]>(key, (old = []) => {
        const withoutMine = old.filter((event) => event.pubkey !== user.pubkey);
        if (ownReposts && ownReposts.length > 0) return withoutMine;
        const optimistic: NostrEvent = {
          id: `optimistic:${target.id}:${user.pubkey}`,
          pubkey: user.pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: repostKindFor(target),
          content: '',
          tags: [['e', target.id], ['p', target.pubkey]],
          sig: '',
        };
        return [optimistic, ...withoutMine];
      });
      return { previous, key };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    // Like reactions: write the signed result into the cache instead of
    // re-querying relays that may not have indexed it yet, and so a quick
    // undo deletes the real event id rather than the optimistic placeholder.
    onSuccess: (publishedEvent, { target, ownReposts }) => {
      if (!user) return;
      queryClient.setQueryData<NostrEvent[]>(repostsQueryKey(target.id), (old = []) => {
        const withoutMine = old.filter((event) => event.pubkey !== user.pubkey);
        return ownReposts && ownReposts.length > 0 ? withoutMine : [publishedEvent, ...withoutMine];
      });
    },
  });
}
