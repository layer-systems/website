import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook to fetch all events authored by a specific user
 */
export function useUserEvents(pubkey: string | undefined, limit = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['user-events', pubkey, limit],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return [];
      }

      const events = await nostr.query(
        [{ kinds: [1], authors: [pubkey], limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 2 * 60 * 1000, // Keep cached data fresh for 2 minutes
  });
}
