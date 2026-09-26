import { NRelay1 } from '@nostrify/nostrify';

/**
 * Round-trip time for a trivial query. This is the only honest latency number
 * available from the browser: a WebSocket gives us no ping, so we time a real
 * REQ/EOSE cycle instead.
 */
export async function measureLatency(relay: NRelay1): Promise<number | null> {
  const started = performance.now();
  try {
    await relay.query([{ kinds: [1], limit: 1 }], { signal: AbortSignal.timeout(5000) });
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}

/**
 * Checks a relay the user is about to add, on a throwaway connection so the
 * pool never learns about an address that might not make it into the list.
 */
export async function probeRelay(url: string): Promise<number | null> {
  const relay = new NRelay1(url, { backoff: false });
  try {
    return await measureLatency(relay);
  } finally {
    await relay.close().catch(() => {});
  }
}
