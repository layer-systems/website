import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';
import { subscribeLiveEvents, type LiveBuffer, type LivePolicy } from '@/lib/liveEvents';
import { useAppContext } from './useAppContext';

export { mergeEvents } from '@/lib/liveEvents';

/** Shared live tail, isolated from historical responses and relay changes. */
export function useLiveEvents(filters: NostrFilter[], enabled = true, policy: LivePolicy = {}) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const client = useQueryClient();
  const identity = JSON.stringify({
    filters,
    relays: config.relayMetadata.relays.filter((relay) => relay.read).map((relay) => relay.url).sort(),
    policy: { ...policy, excludeAuthors: [...(policy.excludeAuthors ?? [])].sort() },
  });
  const queryKey = ['nostr', 'live', identity];
  const query = useQuery<LiveBuffer>({
    queryKey,
    queryFn: skipToken,
    initialData: { events: [], overflow: false },
    gcTime: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    const parameters: { filters: NostrFilter[]; policy: LivePolicy; relays: string[] } = JSON.parse(identity);
    return subscribeLiveEvents(nostr, client, identity, parameters.filters, parameters.policy, parameters.relays);
  }, [nostr, client, identity, enabled]);

  return {
    events: query.data?.events ?? [],
    overflow: query.data?.overflow ?? false,
    dismiss: (ids: string[]) => {
      const dismissed = new Set(ids);
      client.setQueryData<LiveBuffer>(queryKey, (previous) => ({
        events: (previous?.events ?? []).filter((event) => !dismissed.has(event.id)),
        overflow: false,
      }));
    },
  };
}
