import { useMemo } from 'react';
import { useAppContext } from '@/hooks/useAppContext';

/** How many hints to embed. NIP-19 identifiers get unwieldy beyond a couple. */
const MAX_HINTS = 2;

/**
 * Relays worth embedding in a NIP-19 identifier we hand out: the ones we read
 * from, which are also the ones most likely to hold what we are pointing at.
 */
export function useRelayHints(): string[] {
  const { config } = useAppContext();

  return useMemo(
    () =>
      config.relayMetadata.relays
        .filter((relay) => relay.read)
        .slice(0, MAX_HINTS)
        .map((relay) => relay.url),
    [config.relayMetadata],
  );
}
