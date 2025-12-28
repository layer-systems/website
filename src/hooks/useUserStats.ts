import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

interface UserStats {
  notesCount: number;
  followersCount: number;
  followingCount: number;
  reactionsReceived: number;
  totalEvents: number;
}

export function useUserStats(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['user-stats', pubkey],
    queryFn: async (c) => {
      if (!pubkey) {
        throw new Error('Public key is required');
      }

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      // Fetch user's events
      const [userEvents, followersEvents, followingEvents] = await Promise.all([
        // User's posts (kind 1)
        nostr.query([{ kinds: [1], authors: [pubkey], limit: 1000 }], { signal }),
        // Followers (contacts that include this user)
        nostr.query([{ kinds: [3], '#p': [pubkey], limit: 100 }], { signal }),
        // Following (user's contacts)
        nostr.query([{ kinds: [3], authors: [pubkey], limit: 1 }], { signal }),
      ]);

      // Count following from the contact list
      const contactList = followingEvents[0];
      const followingCount = contactList
        ? contactList.tags.filter(([tag]) => tag === 'p').length
        : 0;

      const stats: UserStats = {
        notesCount: userEvents.filter((e) => e.kind === 1).length,
        followersCount: followersEvents.length,
        followingCount,
        reactionsReceived: 0, // Placeholder - would need to query reactions to user's posts
        totalEvents: userEvents.length,
      };

      return stats;
    },
    enabled: !!pubkey,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
