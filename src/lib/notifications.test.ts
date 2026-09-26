import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { notificationParentId, notificationTarget } from './notifications';

function note(id: string, tags: string[][], kind = 1): NostrEvent {
  return { id, pubkey: 'author', created_at: 0, kind, tags, content: '', sig: '' };
}

const parentEvent = note('parent-id', []);

describe('notificationParentId', () => {
  it('prefers the NIP-10 reply marker', () => {
    const event = note('reply', [['e', 'root-id', '', 'root'], ['e', 'parent-id', '', 'reply']]);
    expect(notificationParentId({ event, kind: 'reply' })).toBe('parent-id');
  });

  it('falls back to the root marker for a top-level reply', () => {
    const event = note('reply', [['e', 'root-id', '', 'root']]);
    expect(notificationParentId({ event, kind: 'reply' })).toBe('root-id');
  });

  it('falls back to the last positional e tag', () => {
    const event = note('reply', [['e', 'root-id'], ['e', 'parent-id']]);
    expect(notificationParentId({ event, kind: 'reply' })).toBe('parent-id');
  });

  it('ignores mention markers and non-reply notifications', () => {
    expect(notificationParentId({ event: note('reply', [['e', 'cited', '', 'mention']]), kind: 'reply' })).toBeUndefined();
    expect(notificationParentId({ event: note('m', [['e', 'x', '', 'root']]), kind: 'mention' })).toBeUndefined();
  });
});

describe('notificationTarget', () => {
  const reply = note('reply', [['e', 'root-id', '', 'root'], ['e', 'parent-id', '', 'reply']]);

  it('opens the parent with the reply highlighted once the parent is found', () => {
    const parents = new Map([['parent-id', parentEvent]]);
    expect(notificationTarget({ event: reply, kind: 'reply' }, parents)).toEqual({ id: 'parent-id', highlight: 'reply' });
  });

  it('optimistically opens the parent while parents are still loading', () => {
    expect(notificationTarget({ event: reply, kind: 'reply' })).toEqual({ id: 'parent-id', highlight: 'reply' });
  });

  it('falls back to the reply itself when the parent is unavailable', () => {
    expect(notificationTarget({ event: reply, kind: 'reply' }, new Map())).toEqual({ id: 'reply' });
  });

  it('falls back to the reply when it has no resolvable parent', () => {
    expect(notificationTarget({ event: note('reply', []), kind: 'reply' }, new Map())).toEqual({ id: 'reply' });
  });

  it('keeps mentions opening the event itself', () => {
    const mention = note('mention', [['e', 'root-id', '', 'root']]);
    expect(notificationTarget({ event: mention, kind: 'mention' }, new Map())).toEqual({ id: 'mention' });
  });

  it('opens the referenced note for reactions and nothing for untargeted zaps', () => {
    expect(notificationTarget({ event: note('r', [['e', 'note-id']], 7), kind: 'reaction' })).toEqual({ id: 'note-id' });
    expect(notificationTarget({ event: note('z', [], 9735), kind: 'zap' })).toBeUndefined();
  });
});
