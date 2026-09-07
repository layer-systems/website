import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** A single event by id, e.g. a thread root, a reposted note, or a quoted note. */
export function useNote(id: string | undefined, relays: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'note', id ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query([{ ids: [id!] }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        relays,
      });
      return event ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
