import { useEffect, useState } from 'react';
import { useAppContext } from './useAppContext';

export type RelayStatus = 'connecting' | 'online' | 'offline';

export interface RelayStatusInfo {
  status: RelayStatus;
  url?: string;
}

const RETRY_DELAY_MS = 15000;

/**
 * Tracks the live connection state of the primary configured relay via a
 * dedicated lightweight WebSocket, for display in the OS menu bar.
 */
export function useRelayStatus(): RelayStatusInfo {
  const { config } = useAppContext();
  const url = config.relayMetadata.relays[0]?.url;
  const [status, setStatus] = useState<RelayStatus>('connecting');

  useEffect(() => {
    if (!url) {
      setStatus('offline');
      return;
    }

    let cancelled = false;
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      setStatus('connecting');

      try {
        socket = new WebSocket(url);
      } catch {
        if (!cancelled) {
          setStatus('offline');
          retryTimer = setTimeout(connect, RETRY_DELAY_MS);
        }
        return;
      }

      socket.addEventListener('open', () => {
        if (!cancelled) setStatus('online');
      });

      socket.addEventListener('close', () => {
        if (cancelled) return;
        setStatus('offline');
        retryTimer = setTimeout(connect, RETRY_DELAY_MS);
      });

      socket.addEventListener('error', () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [url]);

  return { status, url };
}
