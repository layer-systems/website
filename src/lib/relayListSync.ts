import type { NostrEvent, NostrSigner, NPool } from '@nostrify/nostrify';
import type { NLoginType } from '@nostrify/react/login';
import { INDEXER_RELAYS } from '@/lib/appRelays';
import { isConclusive, lookupOnRelays } from '@/lib/queryFollowList';
import { newestEvent } from '@/lib/replaceableLists';
import { normalizeRelayUrl, type RelayEntry } from '@/lib/relayList';

/** What a lookup of the user's published NIP-65 relay list found. */
export interface RelayListSyncResult {
  /** The newest published kind 10002, or `null` when none was found. */
  event: NostrEvent | null;
  /** Relays that returned that newest version. */
  foundOn: string[];
  /** Relays that only returned an older version. */
  outdated: string[];
  /** Relays that completed the lookup. */
  checked: string[];
  /** Every relay that was asked. */
  queried: string[];
}

/**
 * The relay entries of a kind 10002 event, canonicalised and de-duplicated.
 * An `r` tag without a marker means read and write (NIP-65); tags with an
 * unknown marker or an unusable URL are dropped.
 */
export function parseRelayList(event: NostrEvent): RelayEntry[] {
  const relays = new Map<string, RelayEntry>();
  for (const [name, url, marker] of event.tags) {
    if (name !== 'r' || !url) continue;
    if (marker && marker !== 'read' && marker !== 'write') continue;
    const parsed = normalizeRelayUrl(url);
    if (!parsed.ok) continue;
    const entry = relays.get(parsed.url) ?? { url: parsed.url, read: false, write: false };
    entry.read ||= !marker || marker === 'read';
    entry.write ||= !marker || marker === 'write';
    relays.set(parsed.url, entry);
  }
  return [...relays.values()];
}

/** How long a NIP-07 extension may take to list its relays. */
const SIGNER_RELAYS_TIMEOUT_MS = 2000;

/**
 * Relays the signer already knows for this user: the NIP-46 bunker's own
 * relays, or the relays a NIP-07 extension reports through `getRelays`.
 * Best effort; never throws.
 */
export async function signerRelays(login: NLoginType | undefined, signer: NostrSigner | undefined): Promise<string[]> {
  if (login?.type === 'bunker') return login.data.relays;
  if (login?.type !== 'extension' || !signer?.getRelays) return [];
  try {
    const relays = await Promise.race([
      signer.getRelays(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getRelays timed out')), SIGNER_RELAYS_TIMEOUT_MS)),
    ]);
    return Object.keys(relays);
  } catch {
    return [];
  }
}

/**
 * Looks up `pubkey`'s kind 10002 on `sources` plus the indexer relays, waiting
 * for every relay to answer, and returns the newest version. Not finding one
 * is only reported when at least one indexer completed the lookup; otherwise
 * this throws so the caller can retry.
 */
export async function lookupRelayList(
  pool: NPool,
  pubkey: string,
  sources: string[],
  signal: AbortSignal,
): Promise<RelayListSyncResult> {
  const lookup = await lookupOnRelays(
    pool,
    [...sources, ...INDEXER_RELAYS],
    { kinds: [10002], authors: [pubkey], limit: 1 },
    signal,
  );
  const event = newestEvent(lookup.hits.map(({ event }) => event)) ?? null;
  if (!event && !isConclusive(lookup, INDEXER_RELAYS)) {
    throw new Error('None of the indexer relays answered.');
  }
  const foundOn = new Set(lookup.hits.filter((hit) => hit.event.id === event?.id).map((hit) => hit.url));
  return {
    event,
    foundOn: [...foundOn],
    outdated: [...new Set(lookup.hits.map((hit) => hit.url).filter((url) => !foundOn.has(url)))],
    checked: [...lookup.completed],
    queried: lookup.relays,
  };
}
