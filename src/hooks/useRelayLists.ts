import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import {
  FAVORITE_RELAYS_KIND,
  latestRelaySets,
  latestReplaceable,
  RELAY_LIST_KIND,
  RELAY_SET_KIND,
} from '@/lib/relayLists';

export function useRelayLists(pubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['relay-lists', pubkey],
    queryFn: async (context) => {
      if (!pubkey) return { relayListEvent: null, favoritesEvent: null, relaySets: [] };

      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [
          { kinds: [RELAY_LIST_KIND, FAVORITE_RELAYS_KIND], authors: [pubkey], limit: 2 },
          { kinds: [RELAY_SET_KIND], authors: [pubkey], limit: 100 },
          { kinds: [5], authors: [pubkey], limit: 100 },
        ],
        { signal },
      );

      return {
        relayListEvent: latestReplaceable(events, RELAY_LIST_KIND),
        favoritesEvent: latestReplaceable(events, FAVORITE_RELAYS_KIND),
        relaySets: latestRelaySets(events),
      };
    },
    enabled: Boolean(pubkey),
  });
}
