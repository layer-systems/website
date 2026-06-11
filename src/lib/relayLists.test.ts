import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  latestRelaySets,
  normalizeRelayUrl,
  parseRelayList,
  RELAY_LIST_KIND,
  RELAY_SET_KIND,
} from './relayLists';

function event(overrides: Partial<NostrEvent>): NostrEvent {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    sig: 'c'.repeat(128),
    created_at: 1,
    kind: RELAY_SET_KIND,
    content: '',
    tags: [],
    ...overrides,
  };
}

describe('relay list helpers', () => {
  it('normalizes websocket relay URLs', () => {
    expect(normalizeRelayUrl(' wss://relay.example.com/ ')).toBe('wss://relay.example.com');
    expect(() => normalizeRelayUrl('https://relay.example.com')).toThrow(/wss/);
  });

  it('parses NIP-65 read and write markers', () => {
    const parsed = parseRelayList(event({
      kind: RELAY_LIST_KIND,
      tags: [
        ['r', 'wss://both.example.com'],
        ['r', 'wss://read.example.com', 'read'],
        ['r', 'wss://write.example.com', 'write'],
      ],
    }));

    expect(parsed.map(({ mode }) => mode)).toEqual(['both', 'read', 'write']);
  });

  it('keeps the newest set version and respects later deletion requests', () => {
    const oldSet = event({ id: '1'.repeat(64), created_at: 10, tags: [['d', 'friends'], ['title', 'Old']] });
    const newSet = event({ id: '2'.repeat(64), created_at: 20, tags: [['d', 'friends'], ['title', 'New']] });
    const deletion = event({
      id: '3'.repeat(64),
      kind: 5,
      created_at: 30,
      tags: [['a', `${RELAY_SET_KIND}:${newSet.pubkey}:friends`]],
    });
    const recreated = event({ id: '4'.repeat(64), created_at: 40, tags: [['d', 'friends'], ['title', 'Recreated']] });

    expect(latestRelaySets([oldSet, newSet])).toHaveLength(1);
    expect(latestRelaySets([oldSet, newSet, deletion])).toHaveLength(0);
    expect(latestRelaySets([oldSet, newSet, deletion, recreated])[0]?.title).toBe('Recreated');
  });
});
