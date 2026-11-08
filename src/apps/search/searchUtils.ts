import { nip19 } from 'nostr-tools';

export type SearchInput =
  | { type: 'empty' }
  | { type: 'hashtag'; value: string }
  | { type: 'profile'; pubkey: string; relays?: string[] }
  | { type: 'nip05'; value: string }
  | { type: 'text'; value: string };

const NIP05_RE = /^(?:[a-z0-9._-]+)@(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;
const HASHTAG_RE = /^#([\p{L}\p{N}_-]+)$/u;

/**
 * Safety net for relays that ignore `search`: every query term must appear in
 * the note, ignoring case and quotes. NIP-50 `key:value` extensions are skipped.
 */
export function noteMatches(content: string, query: string): boolean {
  const text = content.toLowerCase();
  return query
    .toLowerCase()
    .replace(/"/g, ' ')
    .split(/\s+/u)
    .filter((term) => term && !/^[a-z_]+:\S/.test(term))
    .every((term) => text.includes(term));
}

export function parseSearchInput(input: string): SearchInput {
  const value = input.trim();
  if (!value) return { type: 'empty' };

  const hashtag = value.match(HASHTAG_RE);
  if (hashtag) return { type: 'hashtag', value: hashtag[1].toLowerCase() };

  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return { type: 'profile', pubkey: decoded.data };
    if (decoded.type === 'nprofile') return { type: 'profile', pubkey: decoded.data.pubkey, relays: decoded.data.relays };
  } catch {
    // A normal text search need not be a NIP-19 identifier.
  }

  if (NIP05_RE.test(value)) return { type: 'nip05', value: value.toLowerCase() };
  return { type: 'text', value };
}
