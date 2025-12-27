import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

export function useExploreEvents() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['explore-events'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      
      // Fetch both kind 1 (text notes) and kind 0 (profiles) in a single query
      const events = await nostr.query(
        [
          {
            kinds: [1, 0],
            limit: 100,
          }
        ],
        { signal }
      );

      // Separate events by kind
      const textNotes = events.filter((e) => e.kind === 1);
      const profiles = events.filter((e) => e.kind === 0);

      // Sort by created_at (newest first)
      textNotes.sort((a, b) => b.created_at - a.created_at);
      profiles.sort((a, b) => b.created_at - a.created_at);

      return {
        textNotes,
        profiles,
        allEvents: events,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds for fresh content
  });
}
