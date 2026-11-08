import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

type NostrClient = ReturnType<typeof useNostr>['nostr'];

export interface AuthorData {
  event?: NostrEvent;
  metadata?: NostrMetadata;
}

/**
 * Shared query options for a pubkey's kind-0 profile, so non-hook code (e.g.
 * `queryClient.fetchQuery`) reads and fills the same cache entry as `useAuthor`.
 */
export function authorQueryOptions(nostr: NostrClient, pubkey: string | undefined) {
  return {
    queryKey: ['nostr', 'author', pubkey ?? ''] as const,
    queryFn: async (): Promise<AuthorData> => {
      if (!pubkey) {
        return {};
      }

      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: AbortSignal.timeout(1500) },
      );

      if (!event) {
        throw new Error('No event found');
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    staleTime: 5 * 60 * 1000, // Keep cached data fresh for 5 minutes
    retry: 3,
  };
}

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<AuthorData>(authorQueryOptions(nostr, pubkey));
}
