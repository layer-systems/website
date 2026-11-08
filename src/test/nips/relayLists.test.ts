import { describe, expect, it } from 'vitest';
import { relayListTags } from '@/lib/relayList';
import { parseRelayList } from '@/lib/relayListSync';
import { event } from './fixtures';

describe('NIP-65 — relay list metadata', () => {
  it('65-READ: reads the independent example from NIP-65 with the correct directions', () => {
    const incoming = event({ kind: 10002, tags: [
      ['r', 'wss://alicerelay.example.com'],
      ['r', 'wss://brando-relay.com'],
      ['r', 'wss://expensive-relay.example2.com', 'write'],
      ['r', 'wss://nostr-relay.example.com', 'read'],
    ] });
    expect(parseRelayList(incoming)).toEqual([
      { url: 'wss://alicerelay.example.com/', read: true, write: true },
      { url: 'wss://brando-relay.com/', read: true, write: true },
      { url: 'wss://expensive-relay.example2.com/', read: false, write: true },
      { url: 'wss://nostr-relay.example.com/', read: true, write: false },
    ]);
  });

  it('65-WRITE: writes r tags, omitting the marker only when both directions are enabled', () => {
    expect(relayListTags([
      { url: 'wss://both.example.com/', read: true, write: true },
      { url: 'wss://read.example.com/', read: true, write: false },
      { url: 'wss://write.example.com/', read: false, write: true },
      { url: 'wss://disabled.example.com/', read: false, write: false },
    ])).toEqual([
      ['r', 'wss://both.example.com/'],
      ['r', 'wss://read.example.com/', 'read'],
      ['r', 'wss://write.example.com/', 'write'],
    ]);
  });

  it('65-MERGE: combines repeated directions for the same normalized relay (app policy)', () => {
    expect(parseRelayList(event({ kind: 10002, tags: [
      ['r', 'wss://RELAY.example.com', 'read'],
      ['r', 'wss://relay.example.com/', 'write'],
    ] }))).toEqual([{ url: 'wss://relay.example.com/', read: true, write: true }]);
  });

  it('65-INVALID: ignores unusable URLs, unknown markers and unrelated tags (app policy)', () => {
    expect(parseRelayList(event({ kind: 10002, tags: [
      ['r'], ['r', ''], ['r', 'javascript:alert(1)'],
      ['r', 'wss://relay.example.com/', 'unknown'], ['relay', 'wss://other.example.com/'],
    ] }))).toEqual([]);
  });
});
