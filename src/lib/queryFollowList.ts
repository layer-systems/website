import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';
import { INDEXER_RELAYS } from '@/lib/appRelays';
import { normalizeRelayUrl } from '@/lib/relayList';

/** Bootstrap relays holding profile, contact-list and relay-list events. */
export const FOLLOW_INDEXERS = INDEXER_RELAYS;

/** Canonical, de-duplicated relay URLs; the pool keys connections by exact URL. */
export function uniqueRelayUrls(urls: string[]): string[] {
  return [...new Set(urls.flatMap((url) => {
    const parsed = normalizeRelayUrl(url);
    return parsed.ok ? [parsed.url] : [];
  }))];
}

/**
 * Read each relay through EOSE, bypassing the pool's 200 ms query grace period,
 * and return the newest matching event.
 *
 * An explicit event is usable even if other relays are unavailable. An absent
 * event is conclusive only once at least one `authoritative` relay (the
 * author's own NIP-65 write relays, or indexers when those are unknown) has
 * completed the lookup; otherwise the lookup throws so callers can retry.
 * Requiring every relay to answer would turn one dead relay in a user's list
 * into a permanent error.
 */
export interface RelayLookup {
  /** The canonical relay URLs that were asked. */
  relays: string[];
  /** Matching events, with the relay each one came from. */
  hits: { url: string; event: NostrEvent }[];
  /** Relays that answered with EOSE, i.e. completed the lookup. */
  completed: Set<string>;
}

/**
 * Asks each relay on its own and reads it through EOSE, bypassing the pool's
 * 200 ms query grace period. A relay that errors or takes longer than 5 s is
 * left out of `completed`.
 */
export async function lookupOnRelays(
  pool: NPool,
  urls: string[],
  filter: NostrFilter,
  signal: AbortSignal,
): Promise<RelayLookup> {
  const relays = uniqueRelayUrls(urls);
  const hits: RelayLookup['hits'] = [];
  const completed = new Set<string>();

  await Promise.allSettled(relays.map(async (url) => {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    for await (const message of pool.relay(url).req([filter], { signal: timeout })) {
      if (message[0] === 'EVENT') hits.push({ url, event: message[2] });
      if (message[0] === 'EOSE') {
        completed.add(url);
        return;
      }
      if (message[0] === 'CLOSED') throw new Error(message[2]);
    }
    timeout.throwIfAborted();
    throw new Error('Relay did not complete the lookup');
  }));
  signal.throwIfAborted();

  // Relays are not trusted to honour the filter.
  const matching = hits.filter(({ event }) =>
    filter.kinds?.includes(event.kind) && filter.authors?.includes(event.pubkey));
  return { relays, hits: matching, completed };
}

/**
 * Whether an empty lookup can be believed: at least one `authoritative` relay
 * completed it, or, when there are none, every relay did.
 */
export function isConclusive(lookup: RelayLookup, authoritative: string[]): boolean {
  const trusted = new Set(uniqueRelayUrls(authoritative));
  return trusted.size
    ? [...lookup.completed].some((url) => trusted.has(url))
    : lookup.relays.length > 0 && lookup.completed.size === lookup.relays.length;
}

/**
 * Read each relay through EOSE and return the newest matching event.
 *
 * An explicit event is usable even if other relays are unavailable. An absent
 * event is conclusive only once at least one `authoritative` relay (the
 * author's own NIP-65 write relays, or indexers when those are unknown) has
 * completed the lookup; otherwise the lookup throws so callers can retry.
 * Requiring every relay to answer would turn one dead relay in a user's list
 * into a permanent error.
 */
export async function queryFollowList(
  pool: NPool,
  urls: string[],
  filter: NostrFilter,
  signal: AbortSignal,
  authoritative: string[] = FOLLOW_INDEXERS,
): Promise<NostrEvent | undefined> {
  const lookup = await lookupOnRelays(pool, urls, filter, signal);
  const newest = lookup.hits
    .map(({ event }) => event)
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
  if (newest) return newest;

  if (!isConclusive(lookup, authoritative)) throw new Error('No authoritative relay completed the lookup');
  return undefined;
}
