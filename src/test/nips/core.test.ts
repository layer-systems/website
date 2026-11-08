import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReplyTags, isExpired, isReply, replyReference, rootReference } from '@/lib/nostrUtils';
import { newestEvent } from '@/lib/replaceableLists';
import { eventPow, getPow, mineChunk } from '@/lib/pow';
import { clientTags } from '@/lib/clientTags';
import { AUTHOR, OTHER_AUTHOR, ROOT_ID, PARENT_ID, event } from './fixtures';

describe('NIP-01 — selecting a revision within one replaceable coordinate', () => {
  it('01-REV: chooses newest timestamp, then lowest lexical id regardless of arrival order', () => {
    const old = event({ kind: 10002, created_at: 1 });
    const high = event({ kind: 10002, id: 'ff'.repeat(32), created_at: 2 });
    const low = event({ kind: 10002, id: '00'.repeat(32), created_at: 2 });
    for (const input of [[old, high, low], [low, high, old], [high, old, low]]) {
      const before = [...input];
      expect(newestEvent(input)).toBe(low);
      expect(input).toEqual(before);
    }
    expect(newestEvent([])).toBeUndefined();
  });
});

describe('NIP-10 — marked replies and legacy positional references', () => {
  it('10-DIRECT: emits one root marker for a direct reply', () => {
    expect(buildReplyTags(event({ id: ROOT_ID }), OTHER_AUTHOR)).toEqual([
      ['e', ROOT_ID, '', 'root', AUTHOR], ['p', AUTHOR],
    ]);
  });

  it('10-NESTED: preserves the thread root and explicitly marks the direct parent', () => {
    const parent = event({ id: PARENT_ID, tags: [['e', ROOT_ID, '', 'root', OTHER_AUTHOR]] });
    const tags = buildReplyTags(parent);
    expect(tags).toEqual([
      ['e', ROOT_ID, '', 'root', OTHER_AUTHOR],
      ['e', PARENT_ID, '', 'reply', AUTHOR], ['p', AUTHOR],
    ]);
    const incoming = event({ tags });
    expect(rootReference(incoming)).toBe(ROOT_ID);
    expect(replyReference(incoming)).toBe(PARENT_ID);
  });

  it('10-LEGACY: reads first/last positional e tags as root/direct parent', () => {
    const incoming = event({ tags: [['e', ROOT_ID], ['e', PARENT_ID]] });
    expect(rootReference(incoming)).toBe(ROOT_ID);
    expect(replyReference(incoming)).toBe(PARENT_ID);
  });

  it('10-QUOTE: q citations do not turn a standalone note into a reply', () => {
    const incoming = event({ tags: [['q', ROOT_ID, 'wss://relay.example.com', OTHER_AUTHOR]] });
    expect(isReply(incoming)).toBe(false);
    expect(rootReference(incoming)).toBeUndefined();
    expect(replyReference(incoming)).toBeUndefined();
  });
});

describe('NIP-13 — mining and committed difficulty', () => {
  it('13-HASH: mines the exact NIP-01 UTF-8 serialization and replaces stale nonce tags', () => {
    const template = event({ content: 'Grüße 🌍\n"quoted"', tags: [['t', 'nostr'], ['nonce', '999', '30']] });
    const originalTags = structuredClone(template.tags);
    const mined = mineChunk(template, 4, 0, 4096).event;
    expect(mined).toBeDefined();
    if (!mined) throw new Error('Fixture did not produce a mined event');
    // Independent oracle: do not use the hashing/PoW functions used by the miner.
    const wire = JSON.stringify([0, mined.pubkey, mined.created_at, mined.kind, mined.tags, mined.content]);
    expect(mined.id).toBe(createHash('sha256').update(wire, 'utf8').digest('hex'));
    expect(mined.id).toMatch(/^0/);
    expect(mined.tags.filter(([name]) => name === 'nonce')).toEqual([
      ['nonce', expect.stringMatching(/^\d+$/), '4'],
    ]);
    expect(template.tags).toEqual(originalTags);
  });

  it('13-VECTOR: reads the 36-bit example from NIP-13', () => {
    expect(getPow('000000000e9d97a1ab09fc381030b346cdd7a142ad57e6df0b46dc9bef6c7e2d')).toBe(36);
  });

  it('13-COMMIT: credits no more than the committed target or actual leading bits', () => {
    const id = '000f' + 'f'.repeat(60); // Exactly twelve leading zero bits.
    expect(eventPow({ id, tags: [['nonce', '1', '8']] })).toBe(8);
    expect(eventPow({ id, tags: [['nonce', '1', '20']] })).toBe(12);
  });
});

describe('NIP-40 — expiration in Unix seconds', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    [1_699_999_999, true], [1_700_000_000, true], [1_700_000_001, false],
  ])('40-TIME: expiration %i yields expired=%s', (timestamp, expired) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    expect(isExpired(event({ tags: [['expiration', String(timestamp)]] }))).toBe(expired);
  });

  it.each(['', 'tomorrow', '1700000000oops', '-1', '1.5', '9007199254740992'])(
    '40-INVALID: ignores malformed expiration %j (defensive app policy)', (value) => {
      expect(isExpired(event({ tags: [['expiration', value]] }))).toBe(false);
    },
  );

  it('40-ABSENT: events without expiration do not expire', () => {
    expect(isExpired(event())).toBe(false);
  });
});

describe('NIP-89 — optional client attribution only', () => {
  it('89-NAME: adds a name-only client tag without inventing a handler coordinate', () => {
    expect(clientTags(1, [], true)).toEqual([['client', 'LAYER.systems']]);
  });

  it('89-EXISTING: preserves an existing client tag without duplication', () => {
    const tags = [['client', 'Other client', `31990:${AUTHOR}:app`, 'wss://relay.example.com']];
    expect(clientTags(1, tags, true)).toEqual(tags);
    expect(clientTags(1, tags, true)[0]).not.toBe(tags[0]);
  });

  it('89-PRIVACY: honors opt-out and does not auto-attribute private or unknown kinds (app policy)', () => {
    expect(clientTags(1, [['client', 'Other'], ['t', 'nostr']], false)).toEqual([['t', 'nostr']]);
    for (const kind of [4, 1059, 10000, 24133, 65535]) {
      expect(clientTags(kind, [], true)).toEqual([]);
    }
  });
});
