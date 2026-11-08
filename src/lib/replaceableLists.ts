import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

const INCOMPLETE_READ = 'Could not load the complete list from your relays. Please retry.';

/**
 * Reads events that a whole-list replacement will be built from. Unlike
 * `NPool.query`, which returns partial results after a short EOSE window or a
 * timeout, this waits for EOSE from every routed relay and throws otherwise.
 */
export async function queryBeforeWrite(
  nostr: Pick<NPool, 'req'>,
  filters: NostrFilter[],
  signal: AbortSignal = AbortSignal.timeout(6000),
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  try {
    for await (const message of nostr.req(filters, { signal, eoseTimeout: 0 })) {
      signal.throwIfAborted();
      if (message[0] === 'EVENT') events.push(message[2]);
      // NPool emits EOSE only after every routed relay has sent EOSE.
      if (message[0] === 'EOSE') return events;
      if (message[0] === 'CLOSED') break;
    }
    signal.throwIfAborted();
  } catch (cause) {
    throw new Error(INCOMPLETE_READ, { cause });
  }
  throw new Error(INCOMPLETE_READ);
}

/** The current version of a replaceable event: newest `created_at`, lowest id on ties (NIP-01). */
export function newestEvent(events: NostrEvent[]): NostrEvent | undefined {
  return [...events].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
}
