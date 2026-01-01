import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

export interface RelayStats {
  totalEvents: number;
  eventsByKind: Record<number, number>;
  recentEvents: NostrEvent[];
  uniqueAuthors: number;
  eventsPerDay: Record<string, number>;
  topAuthors: Array<{ pubkey: string; count: number }>;
  topKinds: Array<{ kind: number; count: number }>;
}

export function useRelayStats() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['relay-stats'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      
      // Query recent events from the relay (last 7 days, limited to 1000 for performance)
      const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      
      const events = await nostr.query(
        [
          {
            since: sevenDaysAgo,
            // limit: 1000,
          },
        ],
        { signal }
      );

      // Calculate statistics
      const eventsByKind: Record<number, number> = {};
      const authorCounts = new Map<string, number>();
      const eventsPerDay: Record<string, number> = {};
      const uniqueAuthors = new Set<string>();

      for (const event of events) {
        // Count by kind
        eventsByKind[event.kind] = (eventsByKind[event.kind] || 0) + 1;
        
        // Count unique authors
        uniqueAuthors.add(event.pubkey);
        
        // Count events per author
        authorCounts.set(event.pubkey, (authorCounts.get(event.pubkey) || 0) + 1);
        
        // Count events per day
        const date = new Date(event.created_at * 1000);
        const dateKey = date.toISOString().split('T')[0];
        eventsPerDay[dateKey] = (eventsPerDay[dateKey] || 0) + 1;
      }

      // Get top authors
      const topAuthors = Array.from(authorCounts.entries())
        .map(([pubkey, count]) => ({ pubkey, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Get top kinds
      const topKinds = Object.entries(eventsByKind)
        .map(([kind, count]) => ({ kind: parseInt(kind), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Get most recent events
      const recentEvents = [...events]
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 10);

      const stats: RelayStats = {
        totalEvents: events.length,
        eventsByKind,
        recentEvents,
        uniqueAuthors: uniqueAuthors.size,
        eventsPerDay,
        topAuthors,
        topKinds,
      };

      return stats;
    },
    staleTime: 60000, // Cache for 1 minute
  });
}
