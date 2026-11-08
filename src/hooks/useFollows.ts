import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NPool } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { FOLLOW_INDEXERS, queryFollowList } from '@/lib/queryFollowList';
import { normalizeRelayUrl } from '@/lib/relayList';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** The pubkeys in a user's kind 3 contact list. */
export function useFollows(pubkey: string | undefined) {
  const { nostr } = useNostr();

  const { config } = useAppContext();
  const configured = config.relayMetadata.relays;

  return useQuery<string[]>({
    queryKey: ['nostr', 'follows', pubkey ?? '', configured],
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      const pool = nostr as NPool;
      const bootstrap = [...configured.map((relay) => relay.url), ...FOLLOW_INDEXERS];
      let discoveryFailed = false;
      const relayList = await queryFollowList(
        pool, bootstrap, { kinds: [10002], authors: [pubkey!], limit: 1 }, signal,
      ).catch(() => {
        signal.throwIfAborted();
        discoveryFailed = true;
        return undefined;
      });
      const writeRelays = (relayList?.tags ?? [])
        .filter(([name, , marker]) => name === 'r' && (!marker || marker === 'write'))
        .flatMap(([, url]) => {
          const parsed = normalizeRelayUrl(url ?? '');
          return parsed.ok ? [parsed.url] : [];
        });
      const event = await queryFollowList(
        pool,
        [...writeRelays, ...configured.filter((relay) => relay.write).map((relay) => relay.url), ...FOLLOW_INDEXERS],
        { kinds: [3], authors: [pubkey!], limit: 1 },
        signal,
      );

      if (!event) {
        if (discoveryFailed) throw new Error('Could not discover the account’s write relays');
        return [];
      }

      return [
        ...new Set(
          event.tags
            .filter(([name, value]) => name === 'p' && /^[0-9a-f]{64}$/.test(value ?? ''))
            .map(([, value]) => value),
        ),
      ];
    },
    staleTime: (query) => query.state.data?.length ? 5 * 60 * 1000 : 0,
    retry: 2,
  });
}

/** Convenience wrapper for the signed-in user's own follow list. */
export function useMyFollows() {
  const { user } = useCurrentUser();
  return useFollows(user?.pubkey);
}
