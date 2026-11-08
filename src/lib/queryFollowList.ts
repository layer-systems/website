import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';
import { normalizeRelayUrl } from '@/lib/relayList';

/** Bootstrap relays holding profile, contact-list and relay-list events. */
export const FOLLOW_INDEXERS = ['wss://purplepag.es/', 'wss://user.kindpag.es/'];

/** Canonical, de-duplicated relay URLs; the pool keys connections by exact URL. */
function uniqueRelayUrls(urls: string[]): string[] {
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
export async function queryFollowList(
  pool: NPool,
  urls: string[],
  filter: NostrFilter,
  signal: AbortSignal,
  authoritative: string[] = FOLLOW_INDEXERS,
): Promise<NostrEvent | undefined> {
  const relays = uniqueRelayUrls(urls);
  const trusted = new Set(uniqueRelayUrls(authoritative));
  const events: NostrEvent[] = [];
  const completed = new Set<string>();

  await Promise.allSettled(relays.map(async (url) => {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    for await (const message of pool.relay(url).req([filter], { signal: timeout })) {
      if (message[0] === 'EVENT') events.push(message[2]);
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

  const newest = events
    .filter((event) => filter.kinds?.includes(event.kind) && filter.authors?.includes(event.pubkey))
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
  if (newest) return newest;

  const conclusive = trusted.size
    ? [...completed].some((url) => trusted.has(url))
    : relays.length > 0 && completed.size === relays.length;
  if (!conclusive) throw new Error('No authoritative relay completed the lookup');
  return undefined;
}
