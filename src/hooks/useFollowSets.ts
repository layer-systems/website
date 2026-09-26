import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNip51Sets } from '@/hooks/useNip51Lists';
import { listTitle, type Nip51List } from '@/lib/nip51';

/** A NIP-51 follow set (kind 30000): a named, user-curated group of pubkeys. */
export interface FollowSet {
  /** The `d` tag, unique per author. */
  identifier: string;
  title: string;
  /** Public and decrypted private members combined. */
  pubkeys: string[];
  createdAt: number;
}

const PUBKEY_RE = /^[0-9a-f]{64}$/;

function toFollowSets(lists: Nip51List[]): FollowSet[] {
  const sets: FollowSet[] = [];
  for (const list of lists) {
    const pubkeys = [
      ...new Set(
        [...list.publicItems, ...list.privateItems]
          .filter(([name, value]) => name === 'p' && typeof value === 'string' && PUBKEY_RE.test(value))
          .map(([, value]) => value),
      ),
    ];
    if (pubkeys.length === 0) continue;
    sets.push({ identifier: list.identifier ?? '', title: listTitle(list), pubkeys, createdAt: list.createdAt });
  }
  return sets.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The signed-in user's non-empty NIP-51 follow sets, including private
 * members, sorted by title. Shares its cache with the Lists app, so edits
 * there show up in the Feed's list picker right away.
 */
export function useMyFollowSets() {
  const { user } = useCurrentUser();
  return useNip51Sets(user?.pubkey, 30000, toFollowSets);
}
