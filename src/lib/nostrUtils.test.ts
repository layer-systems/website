import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { buildReplyTree, isReply, replyReference, rootReference, type ReplyNode } from './nostrUtils';

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

function reply(
  id: string,
  tags: string[][],
  createdAt: number,
  pubkey = `author-of-${id}`,
): NostrEvent {
  return { ...note(tags), id, pubkey, created_at: createdAt };
}

/** Flattened "id>child" shape for terse tree assertions. */
function shape(nodes: ReplyNode[]): unknown[] {
  return nodes.map((node) => [
    node.event.id,
    shape(node.children),
    ...(node.misplaced ? ['misplaced'] : []),
    ...(node.cycle ? ['cycle'] : []),
  ]);
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

  it('is undefined for a note that only mentions another event', () => {
    expect(rootReference(note([['e', 'mentioned-id', '', 'mention']]))).toBeUndefined();
  });

  it('ignores a mention when falling back to the positional scheme', () => {
    const event = note([
      ['e', 'mentioned-id', '', 'mention'],
      ['e', 'root-id'],
    ]);
    expect(rootReference(event)).toBe('root-id');
  });
});

describe('replyReference', () => {
  it('prefers the marked reply tag over the root tag', () => {
    const event = note([
      ['e', 'root-id', '', 'root'],
      ['e', 'parent-id', '', 'reply'],
    ]);
    expect(replyReference(event)).toBe('parent-id');
  });

  it('returns the root tag for a direct reply to the root', () => {
    expect(replyReference(note([['e', 'root-id', '', 'root']]))).toBe('root-id');
  });

  it('falls back to the last positional e tag per the deprecated scheme', () => {
    const event = note([
      ['e', 'root-id'],
      ['e', 'parent-id'],
    ]);
    expect(replyReference(event)).toBe('parent-id');
  });

  it('uses the only positional e tag as the parent', () => {
    expect(replyReference(note([['e', 'parent-id']]))).toBe('parent-id');
  });

  it('ignores mentions', () => {
    const event = note([
      ['e', 'mentioned-id', '', 'mention'],
      ['e', 'parent-id', '', 'reply'],
    ]);
    expect(replyReference(event)).toBe('parent-id');
  });

  it('skips a self-reference in the positional scheme', () => {
    const event = note([
      ['e', 'root-id'],
      ['e', 'x'],
    ]);
    expect(replyReference(event)).toBe('root-id');
  });

  it('skips a self-referencing reply marker and falls back to the root', () => {
    const event = note([
      ['e', 'root-id', '', 'root'],
      ['e', 'x', '', 'reply'],
    ]);
    expect(replyReference(event)).toBe('root-id');
  });

  it('is undefined for a root note', () => {
    expect(replyReference(note([]))).toBeUndefined();
  });

  it('is undefined for a note that only mentions another event', () => {
    expect(replyReference(note([['e', 'mentioned-id', '', 'mention']]))).toBeUndefined();
  });
});

describe('buildReplyTree', () => {
  it('returns an empty list when there are no replies', () => {
    expect(buildReplyTree('root', [])).toEqual([]);
  });

  it('nests replies beneath their marked parent', () => {
    const events = [
      reply('a', [['e', 'root', '', 'root']], 1),
      reply(
        'b',
        [
          ['e', 'root', '', 'root'],
          ['e', 'a', '', 'reply'],
        ],
        2,
      ),
      reply(
        'c',
        [
          ['e', 'root', '', 'root'],
          ['e', 'b', '', 'reply'],
        ],
        3,
      ),
    ];
    expect(shape(buildReplyTree('root', events))).toEqual([
      ['a', [['b', [['c', []]]]]],
    ]);
  });

  it('keeps direct replies to the root at the top level', () => {
    const events = [
      reply('a', [['e', 'root', '', 'root']], 1),
      reply('b', [['e', 'root', '', 'root']], 2),
    ];
    expect(shape(buildReplyTree('root', events))).toEqual([
      ['a', []],
      ['b', []],
    ]);
  });

  it('nests positional replies beneath the last e tag', () => {
    const events = [
      reply('a', [['e', 'root']], 1),
      reply(
        'b',
        [
          ['e', 'root'],
          ['e', 'a'],
        ],
        2,
      ),
    ];
    expect(shape(buildReplyTree('root', events))).toEqual([['a', [['b', []]]]]);
  });

  it('sorts siblings by creation time, not input order', () => {
    const events = [
      reply('b', [['e', 'root', '', 'root']], 2),
      reply('a', [['e', 'root', '', 'root']], 1),
    ];
    expect(shape(buildReplyTree('root', events))).toEqual([
      ['a', []],
      ['b', []],
    ]);
  });

  it('attaches replies before parents that arrive later', () => {
    const events = [
      reply(
        'b',
        [
          ['e', 'root', '', 'root'],
          ['e', 'a', '', 'reply'],
        ],
        2,
      ),
      reply('a', [['e', 'root', '', 'root']], 3),
    ];
    expect(shape(buildReplyTree('root', events))).toEqual([['a', [['b', []]]]]);
  });

  it('promotes replies whose parent was never fetched, marked misplaced', () => {
    const events = [
      reply(
        'b',
        [
          ['e', 'root', '', 'root'],
          ['e', 'missing', '', 'reply'],
        ],
        1,
      ),
    ];
    expect(shape(buildReplyTree('root', events))).toEqual([['b', [], 'misplaced']]);
  });

  it('promotes replies with a malformed reference instead of dropping them', () => {
    const events = [reply('a', [['e', '', '', 'reply']], 1)];
    const nodes = buildReplyTree('root', events);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].event.id).toBe('a');
  });

  it('promotes a self-referencing reply to the root', () => {
    const events = [reply('a', [['e', 'a', '', 'reply']], 1)];
    expect(shape(buildReplyTree('root', events))).toEqual([['a', []]]);
  });

  it('breaks cycles so every event renders exactly once', () => {
    const events = [
      reply('a', [['e', 'b', '', 'reply']], 1),
      reply('b', [['e', 'a', '', 'reply']], 2),
    ];
    const nodes = buildReplyTree('root', events);
    // Neither side of the loop has a trustworthy parent, so both surface at
    // the root flagged as a cycle instead of pretending a nesting.
    expect(shape(nodes)).toEqual([
      ['a', [], 'misplaced', 'cycle'],
      ['b', [], 'misplaced', 'cycle'],
    ]);
  });

  it('resolves conflicting markers through the marked reply tag', () => {
    const events = [
      reply('a', [['e', 'root', '', 'root']], 1),
      reply('b', [['e', 'root', '', 'root']], 2),
      reply(
        'c',
        [
          ['e', 'b'],
          ['e', 'a', '', 'reply'],
        ],
        3,
      ),
    ];
    expect(shape(buildReplyTree('root', events))).toEqual([
      ['a', [['c', []]]],
      ['b', []],
    ]);
  });

  it('drops duplicate event ids and events that repeat the root id', () => {
    const events = [
      reply('a', [['e', 'root', '', 'root']], 1),
      reply('a', [['e', 'root', '', 'root']], 1),
      reply('root', [['e', 'root', '', 'root']], 2),
    ];
    expect(shape(buildReplyTree('root', events))).toEqual([['a', []]]);
  });

  it('records the parent author for attribution', () => {
    const events = [
      reply('a', [['e', 'root', '', 'root']], 1, 'alice'),
      reply(
        'b',
        [
          ['e', 'root', '', 'root'],
          ['e', 'a', '', 'reply'],
        ],
        2,
        'bob',
      ),
    ];
    const [a] = buildReplyTree('root', events);
    expect(a.parentPubkey).toBeUndefined();
    expect(a.children[0].parentPubkey).toBe('alice');
  });
});
