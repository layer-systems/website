import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { buildQuoteReference, parseEmbeddedRepost, repostReference, summarizeReposts } from './useReposts';

function repost(pubkey: string, createdAt: number, tags: string[][] = [], content = ''): NostrEvent {
  return { id: `${pubkey}-${createdAt}`, pubkey, created_at: createdAt, kind: 6, tags, content, sig: '' };
}

function note(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'note-id',
    pubkey: 'note-author',
    created_at: 100,
    kind: 1,
    tags: [],
    content: 'hello',
    sig: '',
    ...overrides,
  };
}

describe('summarizeReposts', () => {
  it('counts each author once', () => {
    const events = [repost('alice', 1), repost('bob', 2)];
    expect(summarizeReposts(events).count).toBe(2);
  });

  it('keeps only the latest repost per author', () => {
    const events = [repost('alice', 1), repost('alice', 2)];
    const summary = summarizeReposts(events);
    expect(summary.count).toBe(1);
    expect(summary.byAuthor.get('alice')?.created_at).toBe(2);
  });

  it('returns zero for no reposts', () => {
    expect(summarizeReposts(undefined).count).toBe(0);
    expect(summarizeReposts([]).byAuthor.size).toBe(0);
  });
});

describe('repostReference', () => {
  it('reads the id and relay hint from the required e tag', () => {
    const event = repost('alice', 1, [['e', 'target-id', 'wss://relay.example']]);
    expect(repostReference(event)).toEqual({ id: 'target-id', relay: 'wss://relay.example' });
  });

  it('omits relay when the e tag has no third entry', () => {
    const event = repost('alice', 1, [['e', 'target-id']]);
    expect(repostReference(event)).toEqual({ id: 'target-id', relay: undefined });
  });

  it('returns null when there is no e tag', () => {
    const event = repost('alice', 1, [['p', 'someone']]);
    expect(repostReference(event)).toBeNull();
  });
});

describe('parseEmbeddedRepost', () => {
  it('parses a valid embedded note', () => {
    const original = note();
    const event = repost('alice', 1, [['e', original.id]], JSON.stringify(original));
    expect(parseEmbeddedRepost(event)).toEqual(original);
  });

  it('returns null for empty content, per NIP-18 (e.g. NIP-70-protected notes)', () => {
    const event = repost('alice', 1, [['e', 'target-id']], '');
    expect(parseEmbeddedRepost(event)).toBeNull();
  });

  it('returns null for malformed JSON instead of throwing', () => {
    const event = repost('alice', 1, [['e', 'target-id']], '{not json');
    expect(parseEmbeddedRepost(event)).toBeNull();
  });

  it('returns null when the JSON is not a well-formed event', () => {
    const event = repost('alice', 1, [['e', 'target-id']], JSON.stringify({ foo: 'bar' }));
    expect(parseEmbeddedRepost(event)).toBeNull();
  });
});

describe('buildQuoteReference', () => {
  it('produces a nostr: nevent reference', () => {
    const target = note({ id: '1'.repeat(64), pubkey: '2'.repeat(64) });
    const reference = buildQuoteReference(target, []);
    expect(reference).toMatch(/^nostr:nevent1[a-z0-9]+$/);
  });
});
