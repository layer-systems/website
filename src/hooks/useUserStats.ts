import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

export interface UserStats {
  totalEvents: number;
  eventsByKind: Record<number, number>;
  recentEvents: NostrEvent[];
  lastActivity?: number;
  events: NostrEvent[];
}

export function useUserStats(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['user-stats', pubkey],
    queryFn: async (c) => {
      if (!pubkey) throw new Error('No pubkey provided');

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      
      // Query user's events (limited to 500 for performance)
      const events = await nostr.query(
        [
          {
            authors: [pubkey],
            // limit: 500,
          },
        ],
        { signal }
      );

      // Calculate statistics
      const eventsByKind: Record<number, number> = {};
      let lastActivity = 0;

      for (const event of events) {
        // Count by kind
        eventsByKind[event.kind] = (eventsByKind[event.kind] || 0) + 1;
        
        // Track most recent activity
        if (event.created_at > lastActivity) {
          lastActivity = event.created_at;
        }
      }

      // Get most recent 10 events
      const recentEvents = [...events]
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 10);

      const stats: UserStats = {
        totalEvents: events.length,
        eventsByKind,
        recentEvents,
        lastActivity: lastActivity > 0 ? lastActivity : undefined,
        events,
      };

      return stats;
    },
    enabled: !!pubkey,
    staleTime: 30000, // Cache for 30 seconds
  });
}
