import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { newestEvent } from '@/lib/replaceableLists';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** The pubkeys in a user's kind 3 contact list. */
export function useFollows(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<string[]>({
    queryKey: ['nostr', 'follows', pubkey ?? ''],
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [3], authors: [pubkey!], limit: 20 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      // The follow list is replaceable: retain only the newest event authored
      // by this account, rather than trusting relay response ordering.
      const key = ['nostr', 'follow-event', pubkey];
      const event = newestEvent([
        ...events,
        ...[queryClient.getQueryData<NostrEvent>(key)].filter((value): value is NostrEvent => Boolean(value)),
      ].filter((candidate) => candidate.pubkey === pubkey && candidate.kind === 3));
      if (event) queryClient.setQueryData(key, event);

      if (!event) return [];

      return [
        ...new Set(
          event.tags
            .filter(([name, value]) => name === 'p' && typeof value === 'string')
            .map(([, value]) => value),
        ),
      ];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Convenience wrapper for the signed-in user's own follow list. */
export function useMyFollows() {
  const { user } = useCurrentUser();
  return useFollows(user?.pubkey);
}
