import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useLocalStorage } from './useLocalStorage';
import { parseNwcUri, payInvoiceViaNwc, type NwcConnection } from '@/lib/nwc';

function nwcStorageKey(pubkey: string | undefined) {
  return `nostr:nwc:connection:${pubkey ?? 'anonymous'}`;
}

/**
 * The signed-in user's optional Lightning wallet connection (NIP-47). Stored
 * only in this browser, scoped to the signed-in pubkey — it is never
 * published to a relay or sent anywhere but the wallet's own relay when
 * paying an invoice.
 */
export function useNwcConnection() {
  const { user } = useCurrentUser();
  const [connection, setConnection] = useLocalStorage<NwcConnection | null>(
    nwcStorageKey(user?.pubkey),
    null,
  );

  const connect = useCallback(
    (uri: string) => {
      const parsed = parseNwcUri(uri);
      setConnection(parsed);
      return parsed;
    },
    [setConnection],
  );

  const disconnect = useCallback(() => setConnection(null), [setConnection]);

  return { connection: user ? connection : null, connect, disconnect };
}

export function usePayWithNwc() {
  const { nostr } = useNostr();

  return useMutation({
    mutationFn: ({ connection, invoice }: { connection: NwcConnection; invoice: string }) =>
      payInvoiceViaNwc(nostr, connection, invoice),
  });
}
