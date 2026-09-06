import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { parseSearchInput } from './searchUtils';

describe('parseSearchInput', () => {
  it('recognizes a hashtag without passing its hash to the relay filter', () => {
    expect(parseSearchInput(' #Nostr ')).toEqual({ type: 'hashtag', value: 'nostr' });
  });

  it('recognizes npubs as profile lookups', () => {
    const pubkey = 'f'.repeat(64);
    expect(parseSearchInput(nip19.npubEncode(pubkey))).toEqual({ type: 'profile', pubkey });
  });

  it('preserves relay hints from nprofiles', () => {
    const pubkey = 'f'.repeat(64);
    const relays = ['wss://relay.example'];
    expect(parseSearchInput(nip19.nprofileEncode({ pubkey, relays }))).toEqual({ type: 'profile', pubkey, relays });
  });

  it('recognizes NIP-05 addresses', () => {
    expect(parseSearchInput('Alice@Example.com')).toEqual({ type: 'nip05', value: 'alice@example.com' });
  });

  it('leaves ordinary words as a text search', () => {
    expect(parseSearchInput('open source')).toEqual({ type: 'text', value: 'open source' });
  });
});
