import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { summarizeReactions } from './useReactions';

function reaction(pubkey: string, content: string, createdAt: number): NostrEvent {
  return { id: `${pubkey}-${createdAt}`, pubkey, created_at: createdAt, kind: 7, tags: [], content, sig: '' };
}

describe('summarizeReactions', () => {
  it('counts each author once', () => {
    const events = [reaction('alice', '+', 1), reaction('bob', '+', 2)];
    expect(summarizeReactions(events).count).toBe(2);
  });

  it('keeps only the latest reaction per author', () => {
    const events = [reaction('alice', '+', 1), reaction('alice', '-', 2)];
    const summary = summarizeReactions(events);
    expect(summary.count).toBe(0);
    expect(summary.byAuthor.get('alice')?.content).toBe('-');
  });

  it('excludes downvotes from the count', () => {
    const events = [reaction('alice', '+', 1), reaction('bob', '-', 1)];
    expect(summarizeReactions(events).count).toBe(1);
  });

  it('returns zero for no reactions', () => {
    expect(summarizeReactions(undefined).count).toBe(0);
    expect(summarizeReactions([]).byAuthor.size).toBe(0);
  });
});
