import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

type AuthorData = { event?: NostrEvent; metadata?: NostrMetadata };

/** Relays cap the size of an `authors` array; split long lists into several filters. */
const AUTHORS_PER_FILTER = 200;

function parseMetadata(event: NostrEvent): NostrMetadata | undefined {
  try {
    return n.json().pipe(n.metadata()).parse(event.content);
  } catch {
    return undefined;
  }
}

/**
 * Fetch kind 0 profiles for many pubkeys in one relay round-trip and seed the
 * per-pubkey `useAuthor` cache with the results, so rows rendering
 * `useAuthor(pubkey)` hit the cache instead of issuing N separate queries.
 *
 * Returns the resolved metadata by pubkey (only pubkeys with a profile).
 */
export function useAuthors(pubkeys: string[] | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  const sorted = useMemo(() => [...new Set(pubkeys ?? [])].sort(), [pubkeys]);

  return useQuery<Map<string, NostrMetadata>>({
    queryKey: ['nostr', 'authors', sorted],
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const filters = [];
      for (let i = 0; i < sorted.length; i += AUTHORS_PER_FILTER) {
        const authors = sorted.slice(i, i + AUTHORS_PER_FILTER);
        filters.push({ kinds: [0], authors, limit: authors.length });
      }

      const events = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      });

      // Keep only the newest kind 0 per author; relays may return several.
      const latest = new Map<string, NostrEvent>();
      for (const event of events) {
        const current = latest.get(event.pubkey);
        if (!current || current.created_at < event.created_at) latest.set(event.pubkey, event);
      }

      const result = new Map<string, NostrMetadata>();
      for (const pubkey of sorted) {
        const event = latest.get(pubkey);
        const metadata = event ? parseMetadata(event) : undefined;
        if (metadata) result.set(pubkey, metadata);
        // Seed misses too, so a later `useAuthor` for the same key does not
        // re-query (and retry) a profile this batch already found absent.
        queryClient.setQueryData<AuthorData>(['nostr', 'author', pubkey], { event, metadata });
      }
      return result;
    },
  });
}
