import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** A NIP-51 follow set (kind 30000): a named, user-curated group of pubkeys. */
export interface FollowSet {
  /** The `d` tag, unique per author. */
  identifier: string;
  title: string;
  pubkeys: string[];
  createdAt: number;
}

/**
 * Old clients stored mute and pin lists as kind 30000 with these `d` tags,
 * before NIP-51 moved them to replaceable kinds. They are not feeds.
 */
const LEGACY_IDENTIFIERS = new Set(['mute', 'pin']);

function parseFollowSet(event: NostrEvent): FollowSet | undefined {
  if (event.kind !== 30000) return undefined;

  const identifier = event.tags.find(([name]) => name === 'd')?.[1];
  if (!identifier || LEGACY_IDENTIFIERS.has(identifier)) return undefined;

  const pubkeys = [
    ...new Set(
      event.tags
        .filter(([name, value]) => name === 'p' && typeof value === 'string' && /^[0-9a-f]{64}$/.test(value))
        .map(([, value]) => value),
    ),
  ];
  if (pubkeys.length === 0) return undefined;

  const title =
    event.tags.find(([name]) => name === 'title')?.[1]?.trim() ||
    event.tags.find(([name]) => name === 'name')?.[1]?.trim() ||
    identifier;

  return { identifier, title, pubkeys, createdAt: event.created_at };
}

/** The signed-in user's non-empty NIP-51 follow sets, sorted by title. */
export function useMyFollowSets() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<FollowSet[]>({
    queryKey: ['nostr', 'follow-sets', user?.pubkey ?? ''],
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [30000], authors: [user!.pubkey], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Relays may return several versions of one addressable event; keep the newest.
      const latest = new Map<string, FollowSet>();
      for (const event of events) {
        if (event.pubkey !== user!.pubkey) continue;
        const set = parseFollowSet(event);
        if (!set) continue;
        const existing = latest.get(set.identifier);
        if (!existing || existing.createdAt < set.createdAt) latest.set(set.identifier, set);
      }

      return [...latest.values()].sort((a, b) => a.title.localeCompare(b.title));
    },
    staleTime: 5 * 60 * 1000,
  });
}
