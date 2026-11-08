import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';
import type { QueryClient } from '@tanstack/react-query';
import { matchFilters } from 'nostr-tools';
import { isReply } from './nostrUtils';

export const LIVE_LIMIT = 100;
export const LIVE_RENEW_MS = 120_000;
const RETRY_MS = 3000;
const LOOKBACK_SECONDS = 300;
const SEEN_LIMIT = 10_000;

export interface LivePolicy {
  excludeAuthors?: string[];
  rootNotesOnly?: boolean;
}

export interface LiveBuffer {
  events: NostrEvent[];
  overflow: boolean;
}

export function mergeEvents(events: NostrEvent[], limit: number): NostrEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()]
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function acceptsLiveEvent(event: NostrEvent, policy: LivePolicy): boolean {
  if (policy.excludeAuthors?.includes(event.pubkey)) return false;
  return !policy.rootNotesOnly || (event.kind === 1 && event.content.trim().length > 0 && !isReply(event));
}

interface SharedSubscription {
  consumers: number;
  stop: () => void;
}

const subscriptions = new WeakMap<QueryClient, WeakMap<object, Map<string, SharedSubscription>>>();

/** One network subscription per client/pool/filter/relay/policy combination. */
export function subscribeLiveEvents(
  nostr: Pick<NPool, 'req'>,
  client: QueryClient,
  identity: string,
  filters: NostrFilter[],
  policy: LivePolicy,
  relays?: string[],
): () => void {
  let pools = subscriptions.get(client);
  if (!pools) subscriptions.set(client, pools = new WeakMap());
  let entries = pools.get(nostr);
  if (!entries) pools.set(nostr, entries = new Map());
  const existing = entries.get(identity);
  if (existing) {
    existing.consumers++;
    return () => release(existing);
  }

  const key = ['nostr', 'live', identity];
  const seen = new Set((client.getQueryData<LiveBuffer>(key)?.events ?? []).map((event) => event.id));
  let stopped = false;
  let controller: AbortController | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  // Receipt time, never an author's clock, controls reconnect catch-up.
  let since = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
  const connect = () => {
    if (stopped) return;
    clearTimeout(retry);
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const startedAt = Math.floor(Date.now() / 1000);
    const liveFilters = filters.map((filter) => ({ ...filter, since, limit: LIVE_LIMIT }));
    void (async () => {
      try {
        for await (const message of nostr.req(liveFilters, { signal: current.signal, relays })) {
          if (stopped || current.signal.aborted) return;
          if (message[0] === 'CLOSED') break;
          if (message[0] === 'EOSE') {
            since = Math.max(since, startedAt - LOOKBACK_SECONDS);
            continue;
          }
          if (message[0] !== 'EVENT') continue;
          const event = message[2];
          if (!matchFilters(liveFilters, event) || !acceptsLiveEvent(event, policy) || seen.has(event.id)) continue;
          seen.add(event.id);
          if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value!);
          client.setQueryData<LiveBuffer>(key, (previous = { events: [], overflow: false }) => ({
            // Keep arrival order: late events must not lose to author timestamps.
            events: [event, ...previous.events].slice(0, LIVE_LIMIT),
            overflow: previous.overflow || previous.events.length >= LIVE_LIMIT,
          }));
        }
      } catch {
        // Pool/transport failures retry below. Aborts belong to a newer attempt.
      } finally {
        current.abort();
      }
      if (!stopped && controller === current) retry = setTimeout(connect, RETRY_MS);
    })();
  };
  const resume = () => {
    if (document.visibilityState === 'hidden') return;
    connect();
  };
  // The pool may swallow CLOSED/errors and leave its iterator waiting forever.
  // Renew even a quiet stream; receipt-time overlap catches delayed events.
  const renew = setInterval(connect, LIVE_RENEW_MS);
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  const shared: SharedSubscription = {
    consumers: 1,
    stop: () => {
      stopped = true;
      controller?.abort();
      clearTimeout(retry);
      clearInterval(renew);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    },
  };
  entries.set(identity, shared);
  connect();
  return () => release(shared);

  function release(subscription: SharedSubscription) {
    subscription.consumers--;
    if (subscription.consumers === 0) {
      subscription.stop();
      entries?.delete(identity);
    }
  }
}
