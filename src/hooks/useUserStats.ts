import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { subDays, startOfDay, format } from 'date-fns';

interface UserStats {
  totalPosts: number;
  totalReactions: number;
  totalReposts: number;
  postsThisWeek: number;
  postsThisMonth: number;
  dailyActivity: Array<{ date: string; posts: number }>;
}

/**
 * Hook to fetch and aggregate user statistics from Nostr events
 */
export function useUserStats(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['user-stats', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return null;
      }

      const now = Math.floor(Date.now() / 1000);
      const weekAgo = now - 7 * 24 * 60 * 60;
      const monthAgo = now - 30 * 24 * 60 * 60;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

      // Fetch user's posts
      const posts = await nostr.query(
        [{ kinds: [1], authors: [pubkey], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      // Fetch reactions to user's posts (kind 7)
      const reactions = await nostr.query(
        [{ kinds: [7], '#p': [pubkey], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      // Fetch reposts (kind 6 and 16)
      const reposts = await nostr.query(
        [{ kinds: [6, 16], '#p': [pubkey], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) },
      );

      // Calculate stats
      const totalPosts = posts.length;
      const postsThisWeek = posts.filter((e) => e.created_at >= weekAgo).length;
      const postsThisMonth = posts.filter((e) => e.created_at >= monthAgo).length;

      // Calculate daily activity for the last 30 days
      const dailyActivity: Array<{ date: string; posts: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const date = startOfDay(subDays(new Date(), i));
        const dateTimestamp = Math.floor(date.getTime() / 1000);
        const nextDayTimestamp = dateTimestamp + 24 * 60 * 60;

        const postsOnDay = posts.filter(
          (e) => e.created_at >= dateTimestamp && e.created_at < nextDayTimestamp
        ).length;

        dailyActivity.push({
          date: format(date, 'MMM d'),
          posts: postsOnDay,
        });
      }

      const stats: UserStats = {
        totalPosts,
        totalReactions: reactions.length,
        totalReposts: reposts.length,
        postsThisWeek,
        postsThisMonth,
        dailyActivity,
      };

      return stats;
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000, // Keep cached data fresh for 5 minutes
  });
}
