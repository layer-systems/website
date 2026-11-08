import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useRelayListSync } from '@/hooks/useRelayListSync';
import { parseBlossomServerList } from '@/lib/appBlossom';
import { parseRelayList } from '@/lib/relayListSync';

/**
 * NostrSync - Syncs user's Nostr data
 *
 * This component runs globally to sync various Nostr data when the user logs in.
 * Currently syncs:
 * - NIP-65 relay list (kind 10002), looked up on indexer relays too
 * - BUD-03 Blossom server list (kind 10063)
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();

  const relayListSync = useRelayListSync();
  const syncedEvent = relayListSync.data?.event;
  const relayListUpdatedAt = config.relayMetadata.updatedAt;

  const pubkey = user?.pubkey;

  // Adopt the published relay list when it is newer than the local one.
  // `config` and `updateConfig` are scoped to the active account (see
  // AppProvider), and the lookup is keyed by pubkey, but never adopt a list
  // signed by anyone other than the active account.
  useEffect(() => {
    if (!syncedEvent || syncedEvent.pubkey !== pubkey || syncedEvent.created_at <= relayListUpdatedAt) return;
    const fetchedRelays = parseRelayList(syncedEvent);
    if (!fetchedRelays.some((relay) => relay.read) || !fetchedRelays.some((relay) => relay.write)) return;
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: fetchedRelays,
        updatedAt: syncedEvent.created_at,
      },
    }));
  }, [syncedEvent, pubkey, relayListUpdatedAt, updateConfig]);

  // Once the lookup settles, refresh a follow list loaded before it. Don't
  // cancel a follow lookup already in flight from login.
  const relayListSettled = relayListSync.isSuccess || relayListSync.isError;
  useEffect(() => {
    if (!user || !relayListSettled) return;
    void queryClient.invalidateQueries(
      { queryKey: ['nostr', 'follows', user.pubkey] },
      { cancelRefetch: false },
    );
  }, [user, relayListSettled, relayListSync.dataUpdatedAt, queryClient]);

  // Adopt the published Blossom server list (BUD-03) when it is newer than the
  // local one. Re-runs whenever the active account changes; a lookup still in
  // flight for the previous account is cancelled and its result discarded.
  const blossomUpdatedAt = config.blossomServerMetadata.updatedAt;
  useEffect(() => {
    if (!pubkey) return;

    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);

    const syncBlossomServersFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10063], authors: [pubkey], limit: 1 }],
          { signal },
        );
        if (controller.signal.aborted) return;

        const event = events.find((candidate) => candidate.pubkey === pubkey);
        if (!event || event.created_at <= blossomUpdatedAt) return;

        const fetchedServers = parseBlossomServerList(event);
        if (fetchedServers.length === 0) return;

        updateConfig((current) => {
          // Another write may have landed for this account in the meantime.
          if ((current.blossomServerMetadata?.updatedAt ?? 0) >= event.created_at) return current;
          return {
            ...current,
            blossomServerMetadata: {
              servers: fetchedServers,
              updatedAt: event.created_at,
            },
          };
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Failed to sync Blossom servers from Nostr:', error);
      }
    };

    void syncBlossomServersFromNostr();
    return () => controller.abort();
  }, [pubkey, blossomUpdatedAt, nostr, updateConfig]);

  return null;
}
