import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import {
  latestNsites,
  NAPP_KIND,
  NSITE_NAMED_KIND,
  NSITE_ROOT_KIND,
  parseNsite,
  type Nsite,
  type NsitePointer,
} from '@/lib/nsites';

/**
 * Relays where nsite and napp manifests are commonly published, asked in
 * addition to the user's read relays. Publishing tools (nsyte, nostrapps)
 * default to these, and general-purpose relays often hold none.
 */
export const NSITE_DISCOVERY_RELAYS = ['wss://relay.nsite.lol', 'wss://nos.lol', 'wss://nostr.mom'];

/** Manifests requested per directory load. Big sites carry hundreds of tags each. */
const SITE_LIMIT = 300;
/** Napps get their own filter so the far more numerous nsites can't crowd them out. */
const NAPP_LIMIT = 150;
/** Kept below what relays commonly accept in one `authors` filter. */
const MAX_AUTHORS = 500;

export type NsiteScope = 'all' | 'following' | 'mine';

/**
 * Recent nsite and napp manifests from the user's read relays, one entry per
 * site. `authors` narrows the query for the Following and Mine scopes; the
 * query waits until those are known rather than briefly showing everything.
 */
export function useNsiteDirectory(scope: NsiteScope, authors: string[] | undefined) {
  const { nostr } = useNostr();
  const relays = useNsiteRelays();
  const narrowed = scope !== 'all';
  const authorList = narrowed ? (authors ?? []).slice(0, MAX_AUTHORS) : [];

  return useQuery<Nsite[]>({
    queryKey: ['nostr', 'nsites', scope, narrowed ? authorList.join(',') : '', relays.join(',')],
    enabled: !narrowed || authorList.length > 0,
    queryFn: async ({ signal }) => {
      const by = narrowed ? { authors: authorList } : {};
      const filters: NostrFilter[] = [
        { kinds: [NSITE_ROOT_KIND, NSITE_NAMED_KIND], limit: SITE_LIMIT, ...by },
        { kinds: [NAPP_KIND], limit: NAPP_LIMIT, ...by },
      ];
      const events = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        relays,
      });
      return latestNsites(events.map(parseNsite).filter((site): site is Nsite => site !== null));
    },
    staleTime: 60_000,
  });
}

/**
 * One site's latest manifest. Always constrained to the author: the `d` tag of
 * an addressable event is not a trust boundary, and anyone can publish one.
 */
export function useNsite(pointer: NsitePointer | undefined) {
  const { nostr } = useNostr();
  const base = useNsiteRelays();
  const hints = pointer?.relays ?? [];
  const relays = [...new Set([...base, ...hints])];

  return useQuery<Nsite | null>({
    queryKey: ['nostr', 'nsite', pointer?.kind, pointer?.pubkey, pointer?.identifier, relays.join(',')],
    enabled: Boolean(pointer),
    queryFn: async ({ signal }) => {
      const { kind, pubkey, identifier } = pointer!;
      const filter: NostrFilter = {
        kinds: [kind],
        authors: [pubkey],
        ...(kind === NSITE_ROOT_KIND ? {} : { '#d': [identifier] }),
        limit: 5,
      };
      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        relays,
      });
      const sites = latestNsites(
        events
          .filter((event) => event.pubkey === pubkey && event.kind === kind)
          .map(parseNsite)
          .filter((site): site is Nsite => site !== null && site.identifier === identifier),
      );
      return sites[0] ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** The user's read relays plus {@link NSITE_DISCOVERY_RELAYS}, without duplicates. */
function useNsiteRelays(): string[] {
  const { config } = useAppContext();
  return useMemo(() => {
    const read = config.relayMetadata.relays.filter((relay) => relay.read).map((relay) => relay.url);
    return [...new Set([...read, ...NSITE_DISCOVERY_RELAYS])];
  }, [config.relayMetadata]);
}
