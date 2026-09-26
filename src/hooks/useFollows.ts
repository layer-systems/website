import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** The pubkeys in a user's kind 3 contact list. */
export function useFollows(pubkey: string | undefined) {
  const { nostr } = useNostr();

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
      const event = events
        .filter((candidate) => candidate.pubkey === pubkey && candidate.kind === 3)
        .sort((a, b) => b.created_at - a.created_at)[0];

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
