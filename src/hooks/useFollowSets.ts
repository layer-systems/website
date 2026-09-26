import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { NUser } from '@nostrify/react/login';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** A NIP-51 follow set (kind 30000): a named, user-curated group of pubkeys. */
export interface FollowSet {
  /** The `d` tag, unique per author. */
  identifier: string;
  title: string;
  /** Public and decrypted private members combined. */
  pubkeys: string[];
  createdAt: number;
}

/**
 * Old clients stored mute and pin lists as kind 30000 with these `d` tags,
 * before NIP-51 moved them to replaceable kinds. They are not feeds.
 */
const LEGACY_IDENTIFIERS = new Set(['mute', 'pin']);

const PUBKEY_RE = /^[0-9a-f]{64}$/;

/**
 * Decrypts a list's private entries. NIP-51 uses NIP-44, but older clients
 * wrote NIP-04 ciphertext, recognisable by its `?iv=` suffix. Anything the
 * signer can't open is skipped, so the list falls back to its public members.
 */
async function decryptPrivateTags(signer: NUser['signer'], pubkey: string, content: string): Promise<string[][]> {
  if (!content) return [];
  try {
    const isNip04 = content.includes('?iv=');
    const plaintext = isNip04
      ? await signer.nip04?.decrypt(pubkey, content)
      : await signer.nip44?.decrypt(pubkey, content);
    if (!plaintext) return [];
    const parsed: unknown = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is string[] => Array.isArray(tag));
  } catch {
    return [];
  }
}

async function parseFollowSet(event: NostrEvent, user: NUser): Promise<FollowSet | undefined> {
  const identifier = event.tags.find(([name]) => name === 'd')?.[1];
  if (!identifier) return undefined;

  const privateTags = await decryptPrivateTags(user.signer, user.pubkey, event.content);
  const pubkeys = [
    ...new Set(
      [...event.tags, ...privateTags]
        .filter(([name, value]) => name === 'p' && typeof value === 'string' && PUBKEY_RE.test(value))
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

/** The signed-in user's non-empty NIP-51 follow sets, including private members, sorted by title. */
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

      // Relays may return several versions of one addressable event; keep the
      // newest before parsing, so a list emptied later doesn't resurface from an
      // older version and each list is decrypted only once.
      const latest = new Map<string, NostrEvent>();
      for (const event of events) {
        if (event.kind !== 30000 || event.pubkey !== user!.pubkey) continue;
        const identifier = event.tags.find(([name]) => name === 'd')?.[1];
        if (!identifier || LEGACY_IDENTIFIERS.has(identifier)) continue;
        const existing = latest.get(identifier);
        if (!existing || existing.created_at < event.created_at) latest.set(identifier, event);
      }

      // Sequential so extension and remote signers aren't hit with a burst of requests.
      const sets: FollowSet[] = [];
      for (const event of latest.values()) {
        const set = await parseFollowSet(event, user!);
        if (set) sets.push(set);
      }

      return sets.sort((a, b) => a.title.localeCompare(b.title));
    },
    staleTime: 5 * 60 * 1000,
  });
}
