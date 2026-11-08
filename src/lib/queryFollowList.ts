import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

/** Bootstrap relays holding profile, contact-list and relay-list events. */
export const FOLLOW_INDEXERS = ['wss://purplepag.es/', 'wss://user.kindpag.es/'];

/**
 * Read each relay through EOSE, bypassing the pool's 200 ms query grace period.
 * An explicit event is usable even if another relay is unavailable. An absent
 * event is conclusive only when every relay completed successfully.
 */
export async function queryFollowList(
  pool: NPool,
  urls: string[],
  filter: NostrFilter,
  signal: AbortSignal,
): Promise<NostrEvent | undefined> {
  const events: NostrEvent[] = [];
  const results = await Promise.allSettled([...new Set(urls)].map(async (url) => {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    for await (const message of pool.relay(url).req([filter], { signal: timeout })) {
      if (message[0] === 'EVENT') events.push(message[2]);
      if (message[0] === 'EOSE') return;
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
  if (!results.length || results.some((result) => result.status === 'rejected')) {
    throw new Error('Could not load the follow list from all relays');
  }
  return undefined;
}
