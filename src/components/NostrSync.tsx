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

  // Adopt the published relay list when it is newer than the local one.
  useEffect(() => {
    if (!syncedEvent || syncedEvent.created_at <= relayListUpdatedAt) return;
    const fetchedRelays = parseRelayList(syncedEvent);
    if (!fetchedRelays.some((relay) => relay.read) || !fetchedRelays.some((relay) => relay.write)) return;
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: fetchedRelays,
        updatedAt: syncedEvent.created_at,
      },
    }));
  }, [syncedEvent, relayListUpdatedAt, updateConfig]);

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

  useEffect(() => {
    if (!user) return;

    const syncBlossomServersFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10063], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];

          // Only update if the event is newer than our stored data
          if (event.created_at > config.blossomServerMetadata.updatedAt) {
            const fetchedServers = parseBlossomServerList(event);

            if (fetchedServers.length > 0) {
              console.log('Syncing Blossom server list from Nostr:', fetchedServers);
              updateConfig((current) => ({
                ...current,
                blossomServerMetadata: {
                  servers: fetchedServers,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync Blossom servers from Nostr:', error);
      }
    };

    syncBlossomServersFromNostr();
  }, [user, config.blossomServerMetadata.updatedAt, nostr, updateConfig]);

  return null;
}
