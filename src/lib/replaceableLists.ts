import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

/** A write must never use NPool.query's partial results or early EOSE window. */
export async function queryBeforeWrite(
  nostr: Pick<NPool, 'req'>,
  filters: NostrFilter[],
  signal: AbortSignal = AbortSignal.timeout(6000),
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  for await (const message of nostr.req(filters, { signal, eoseTimeout: 0 })) {
    signal.throwIfAborted();
    if (message[0] === 'EVENT') events.push(message[2]);
    // NPool emits EOSE only after every routed relay has sent EOSE.
    if (message[0] === 'EOSE') return events;
    if (message[0] === 'CLOSED') throw new Error('Could not load the complete list. Please retry.');
  }
  signal.throwIfAborted();
  throw new Error('Could not load the complete list. Please retry.');
}

export function newestEvent(events: NostrEvent[]): NostrEvent | undefined {
  return [...events].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
}
