import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { isReply, rootReference } from './nostrUtils';

function note(tags: string[][]): NostrEvent {
  return {
    id: 'x',
    pubkey: 'y',
    created_at: 0,
    kind: 1,
    tags,
    content: 'hello',
    sig: '',
  };
}

describe('isReply', () => {
  it('is false for a root note with no e tag', () => {
    expect(isReply(note([]))).toBe(false);
  });

  it('is true for a note with a marked root e tag', () => {
    expect(isReply(note([['e', 'root-id', '', 'root']]))).toBe(true);
  });

  it('is true for a note using the deprecated positional e tag', () => {
    expect(isReply(note([['e', 'parent-id']]))).toBe(true);
  });

  it('is false for a note that only mentions another event', () => {
    expect(isReply(note([['e', 'mentioned-id', '', 'mention']]))).toBe(false);
  });

  it('is true for a note with a mention alongside a marked reply', () => {
    expect(
      isReply(
        note([
          ['e', 'root-id', '', 'root'],
          ['e', 'mentioned-id', '', 'mention'],
        ]),
      ),
    ).toBe(true);
  });
});

describe('rootReference', () => {
  it('prefers the marked root tag over positional ones', () => {
    const event = note([
      ['e', 'mention-id', '', 'mention'],
      ['e', 'root-id', '', 'root'],
    ]);
    expect(rootReference(event)).toBe('root-id');
  });

  it('falls back to the first positional e tag per the deprecated scheme', () => {
    const event = note([
      ['e', 'root-id'],
      ['e', 'reply-id'],
    ]);
    expect(rootReference(event)).toBe('root-id');
  });

  it('is undefined for a root note', () => {
    expect(rootReference(note([]))).toBeUndefined();
  });
});
