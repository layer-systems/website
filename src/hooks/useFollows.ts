import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';

/** The pubkeys in a user's kind 3 contact list. */
export function useFollows(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<string[]>({
    queryKey: followsQueryKey(pubkey),
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      const event = await fetchFollowEvent(nostr, pubkey!, signal);
      return extractFollows(event?.tags ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Convenience wrapper for the signed-in user's own follow list. */
export function useMyFollows() {
  const { user } = useCurrentUser();
  return useFollows(user?.pubkey);
}

function followsQueryKey(pubkey: string | undefined) {
  return ['nostr', 'follows', pubkey ?? ''] as const;
}

/**
 * Reads the user's current kind 3 event. Throws on timeout instead of
 * resolving to an empty list — a failed read must never be mistaken for
 * "follows nobody", because the caller is about to replace the whole list
 * and an empty stand-in would silently wipe every real entry.
 */
async function fetchFollowEvent(
  nostr: ReturnType<typeof useNostr>['nostr'],
  pubkey: string,
  signal?: AbortSignal,
): Promise<NostrEvent | null> {
  const timeout = AbortSignal.timeout(6000);
  const events = await nostr.query(
    [{ kinds: [3], authors: [pubkey], limit: 1 }],
    { signal: AbortSignal.any([timeout, ...(signal ? [signal] : [])]) },
  );
  if (timeout.aborted || signal?.aborted) {
    throw new Error('Could not read your follow list from your relays. Try again.');
  }
  return events[0] ?? null;
}

function extractFollows(tags: string[][]): string[] {
  return [
    ...new Set(
      tags
        .filter(([name, value]) => name === 'p' && typeof value === 'string')
        .map(([, value]) => value),
    ),
  ];
}

interface ToggleFollowResult {
  forPubkey: string;
  follows: string[];
}

/**
 * Follows are a whole-list replacement (kind 3), so the current list has to be
 * read back before writing or the edit would silently drop everyone else.
 *
 * The list is fetched fresh from the relays at click time — not read from the
 * query cache — and the computed result is written straight into the cache on
 * success. Deliberately no `invalidateQueries` here: right after publishing,
 * a re-query can still race back the pre-update list from a lagging relay and
 * silently clobber this correct value (the same eventual-consistency race
 * `useSetPubkeyMuted` documents). That race is what made unfollow appear to
 * do nothing and, when the stale read came back empty, wiped whole lists.
 */
export function useToggleFollow() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<ToggleFollowResult, Error, string>({
    mutationFn: async (target) => {
      if (!user) throw new Error('Sign in to follow accounts');

      const current = await fetchFollowEvent(nostr, user.pubkey);
      const currentFollows = extractFollows(current?.tags ?? []);
      const isFollowing = currentFollows.includes(target);

      const follows = isFollowing
        ? currentFollows.filter((key) => key !== target)
        : [...currentFollows, target];

      await publish.mutateAsync({
        kind: 3,
        content: current?.content ?? '',
        tags: follows.map((key) => ['p', key]),
      });

      return { forPubkey: user.pubkey, follows };
    },
    // `forPubkey` is captured by mutationFn at call time so a stale callback
    // can never write into another account's (or a logged-out) query key.
    onSuccess: ({ forPubkey, follows }) => {
      queryClient.setQueryData<string[]>(followsQueryKey(forPubkey), follows);
    },
  });
}
