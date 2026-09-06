import { useEffect, useState } from 'react';
import type { NPool, NRelay1 } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';

export type RelayConnectionState = 'connecting' | 'open' | 'closing' | 'closed' | 'idle';

export interface RelayStatus {
  url: string;
  read: boolean;
  write: boolean;
  /** `idle` means the pool has not needed this relay yet, so no socket exists. */
  state: RelayConnectionState;
  /** Number of open subscriptions on this relay. */
  subscriptions: number;
}

const READY_STATE: Record<number, RelayConnectionState> = {
  0: 'connecting',
  1: 'open',
  2: 'closing',
  3: 'closed',
};

/** How often the socket states are sampled. Sockets have no change event we can subscribe to. */
const POLL_INTERVAL_MS = 1000;

function readState(relay: NRelay1 | undefined): RelayConnectionState {
  if (!relay) return 'idle';
  try {
    return READY_STATE[relay.socket.readyState] ?? 'closed';
  } catch {
    return 'closed';
  }
}

/**
 * Live view of the relay pool: every configured relay plus whatever the pool
 * has actually opened. Backs both the menu bar indicator and the Relays app,
 * so the two can never disagree.
 */
export function useRelayStatus(): { relays: RelayStatus[]; connected: number } {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const [relays, setRelays] = useState<RelayStatus[]>([]);

  useEffect(() => {
    const pool = nostr as NPool<NRelay1>;

    const sample = () => {
      const open = pool.relays;
      const configured = config.relayMetadata.relays;
      const seen = new Set(configured.map((r) => r.url));

      const rows: RelayStatus[] = configured.map((relay) => {
        const instance = open.get(relay.url);
        return {
          url: relay.url,
          read: relay.read,
          write: relay.write,
          state: readState(instance),
          subscriptions: instance?.subscriptions.length ?? 0,
        };
      });

      // Relays the pool opened that are not in the user's list (e.g. from a
      // relay hint) still belong in the monitor.
      for (const [url, instance] of open) {
        if (seen.has(url)) continue;
        rows.push({
          url,
          read: false,
          write: false,
          state: readState(instance),
          subscriptions: instance.subscriptions.length,
        });
      }

      setRelays(rows);
    };

    sample();
    const timer = setInterval(sample, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [nostr, config.relayMetadata]);

  return {
    relays,
    connected: relays.filter((relay) => relay.state === 'open').length,
  };
}
