import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { matchFilters } from 'nostr-tools';
import { useAppContext } from './useAppContext';

/** Keep a bounded, deduplicated event window, newest first. */
export function mergeEvents(events: NostrEvent[], limit: number): NostrEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()]
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** A live tail alongside historical queries; EOSE does not close the stream. */
export function useLiveEvents(filters: NostrFilter[], enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const client = useQueryClient();
  const serialized = JSON.stringify(filters);
  const relays = JSON.stringify(config.relayMetadata);
  const queryKey = ['nostr', 'live', serialized];
  const query = useQuery<NostrEvent[]>({
    queryKey,
    enabled: false,
    initialData: [],
    gcTime: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    const baseFilters: NostrFilter[] = JSON.parse(serialized);
    const key = ['nostr', 'live', serialized];
    // Overlap the initial query and reconnects, including same-second events.
    const since = Math.floor(Date.now() / 1000) - 1;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const stream = async () => {
      try {
        const liveFilters = baseFilters.map((filter) => ({ ...filter, since, limit: 100 }));
        for await (const message of nostr.req(liveFilters, { signal })) {
          if (signal.aborted) return;
          if (message[0] !== 'EVENT') continue;
          const event = message[2];
          if (!matchFilters(liveFilters, event)) continue;
          client.setQueryData<NostrEvent[]>(key, (previous = []) => mergeEvents([event, ...previous], 100));
        }
      } catch {
        // Retry interrupted subscriptions; unmount/account changes abort below.
      }
      if (!signal.aborted) retry = setTimeout(() => void stream(), 3000);
    };
    void stream();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [nostr, client, serialized, relays, enabled]);

  return query.data;
}
