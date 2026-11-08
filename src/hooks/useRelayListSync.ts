import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useQuery } from '@tanstack/react-query';
import type { NPool } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { lookupRelayList, signerRelays, type RelayListSyncResult } from '@/lib/relayListSync';

/** Query key of the signed-in user's NIP-65 relay list lookup. */
export function relayListSyncKey(pubkey: string) {
  // Deliberately outside the `['nostr']` namespace: NostrProvider invalidates
  // that whenever the relay list changes, and this lookup is what changes it.
  return ['relay-list-sync', pubkey] as const;
}

/**
 * Where the signed-in user's published relay list (kind 10002) was found.
 * Looks on the configured relays, the indexer relays and any relays the
 * signer knows, and retries while no indexer could be reached. `NostrSync`
 * applies the result; the Relays app shows it as the sync status.
 */
export function useRelayListSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { logins } = useNostrLogin();
  const { config } = useAppContext();
  const pubkey = user?.pubkey;

  return useQuery<RelayListSyncResult>({
    queryKey: relayListSyncKey(pubkey ?? ''),
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      const login = logins.find((candidate) => candidate.pubkey === pubkey);
      const sources = [
        ...config.relayMetadata.relays.map((relay) => relay.url),
        ...await signerRelays(login, user?.signer),
      ];
      return lookupRelayList(nostr as NPool, pubkey!, sources, signal);
    },
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 20000),
  });
}
