import { nip19 } from 'nostr-tools';

export type SearchInput =
  | { type: 'empty' }
  | { type: 'hashtag'; value: string }
  | { type: 'profile'; pubkey: string; relays?: string[] }
  | { type: 'nip05'; value: string }
  | { type: 'text'; value: string };

const NIP05_RE = /^(?:[a-z0-9._-]+)@(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;
const HASHTAG_RE = /^#([\p{L}\p{N}_-]+)$/u;

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
