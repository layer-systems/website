import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { isHttpsUrl } from '@/lib/nip51';
import { sanitizeUrl } from '@/lib/nostrUtils';

/** Event-sourced images must be absolute https URLs; anything else isn't rendered. */
export function safeImageUrl(url: string | undefined): string | undefined {
  if (!url || !isHttpsUrl(url)) return undefined;
  return sanitizeUrl(url);
}

interface AddressParts {
  kind: number;
  pubkey: string;
  identifier: string;
}

export function parseAddressValue(value: string): AddressParts | undefined {
  const [kindPart, pubkey, ...rest] = value.split(':');
  const kind = Number(kindPart);
  if (!Number.isInteger(kind) || !/^[0-9a-f]{64}$/.test(pubkey ?? '')) return undefined;
  return { kind, pubkey, identifier: rest.join(':') };
}

/**
 * The events a list's `e` and `a` items point at, fetched in one round-trip
 * for the whole list rather than one query per row. Keyed by event id for `e`
 * items and by `kind:pubkey:d` for `a` items.
 */
export function useReferencedEvents(items: string[][]) {
  const { nostr } = useNostr();

  const ids = useMemo(
    () => [...new Set(items.filter(([name, value]) => name === 'e' && /^[0-9a-f]{64}$/.test(value ?? '')).map(([, value]) => value))],
    [items],
  );
  const addresses = useMemo(
    () =>
      [...new Set(items.filter(([name]) => name === 'a').map(([, value]) => value))]
        .map(parseAddressValue)
        .filter((address): address is AddressParts => Boolean(address)),
    [items],
  );

  return useQuery<Map<string, NostrEvent>>({
    queryKey: ['nostr', 'list-references', ids.join(','), addresses.map((a) => `${a.kind}:${a.pubkey}:${a.identifier}`).join(',')],
    enabled: ids.length > 0 || addresses.length > 0,
    queryFn: async ({ signal }) => {
      const filters: NostrFilter[] = [];
      if (ids.length > 0) filters.push({ ids, limit: ids.length });
      if (addresses.length > 0) {
        filters.push({
          kinds: [...new Set(addresses.map((a) => a.kind))],
          authors: [...new Set(addresses.map((a) => a.pubkey))],
          '#d': [...new Set(addresses.map((a) => a.identifier))],
          limit: addresses.length * 2,
        });
      }
      const events = await nostr.query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });

      const wantedIds = new Set(ids);
      const wantedAddresses = new Set(addresses.map((a) => `${a.kind}:${a.pubkey}:${a.identifier}`));
      const found = new Map<string, NostrEvent>();
      for (const event of events) {
        if (wantedIds.has(event.id)) found.set(event.id, event);
        const d = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
        const address = `${event.kind}:${event.pubkey}:${d}`;
        // The relay filter can't pin whole addresses, so re-check, keeping the newest version.
        if (wantedAddresses.has(address)) {
          const existing = found.get(address);
          if (!existing || existing.created_at < event.created_at) found.set(address, event);
        }
      }
      return found;
    },
    staleTime: 5 * 60 * 1000,
  });
}
