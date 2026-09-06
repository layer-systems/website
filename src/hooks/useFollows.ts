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
      const [event] = await nostr.query(
        [{ kinds: [3], authors: [pubkey!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

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
