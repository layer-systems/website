import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { encodeSpellTags, parseSpell, resolveSpellFilter, resolveTimestamp, type ParsedSpell } from './useSpells';

function spellEvent(tags: string[][], content = ''): NostrEvent {
  return { id: 'x', pubkey: 'author', created_at: 0, kind: 777, tags, content, sig: '' };
}

/** A ParsedSpell as if it came straight off a relay — encodeSpellTags always produces well-formed data, so malformed cases are built by hand. */
function parsedSpell(overrides: Partial<ParsedSpell>): ParsedSpell {
  return {
    description: '',
    kinds: [1],
    authors: [],
    topics: [],
    event: spellEvent([]),
    ...overrides,
  };
}

describe('resolveTimestamp', () => {
  it('resolves a relative duration against now', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(resolveTimestamp('7d')).toBeCloseTo(now - 7 * 86400, -1);
  });

  it('resolves "now"', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(resolveTimestamp('now')).toBeCloseTo(now, -1);
  });

  it('resolves an absolute unix timestamp', () => {
    expect(resolveTimestamp('1700000000')).toBe(1700000000);
  });

  it('is undefined for blank input', () => {
    expect(resolveTimestamp('')).toBeUndefined();
    expect(resolveTimestamp('   ')).toBeUndefined();
  });
});

describe('encodeSpellTags / parseSpell round-trip', () => {
  it('round-trips a spell with authors, a tag filter, since and topics', () => {
    const tags = encodeSpellTags({
      name: 'Bitcoin from contacts',
      description: 'Notes about Bitcoin from my contacts',
      kinds: [1],
      authors: ['$contacts'],
      tagFilter: { letter: 't', values: ['bitcoin'] },
      since: '7d',
      limit: 50,
      topics: ['bitcoin', 'social'],
    });
    const event = spellEvent(tags, 'Notes about Bitcoin from my contacts');
    const parsed = parseSpell(event);

    expect(parsed.name).toBe('Bitcoin from contacts');
    expect(parsed.kinds).toEqual([1]);
    expect(parsed.authors).toEqual(['$contacts']);
    expect(parsed.tagFilter).toEqual({ letter: 't', values: ['bitcoin'] });
    expect(parsed.since).toBe('7d');
    expect(parsed.limit).toBe(50);
    expect(parsed.topics).toEqual(['bitcoin', 'social']);
  });
});

describe('resolveSpellFilter', () => {
  it('resolves $me and $contacts into real pubkeys', () => {
    const event = spellEvent(encodeSpellTags({ kinds: [1], authors: ['$me', '$contacts'] }));
    const filter = resolveSpellFilter(parseSpell(event), { me: 'abc', contacts: ['def', 'ghi'] });
    expect(filter?.authors).toEqual(['abc', 'def', 'ghi']);
  });

  it('returns null when $me is required but nobody is signed in', () => {
    const event = spellEvent(encodeSpellTags({ kinds: [1], authors: ['$me'] }));
    const filter = resolveSpellFilter(parseSpell(event), { me: undefined, contacts: [] });
    expect(filter).toBeNull();
  });

  it('returns null when there are no kinds', () => {
    const event = spellEvent(encodeSpellTags({ kinds: [] }));
    const filter = resolveSpellFilter(parseSpell(event), { me: undefined, contacts: [] });
    expect(filter).toBeNull();
  });

  it('turns a tag filter into a #<letter> filter field', () => {
    const event = spellEvent(
      encodeSpellTags({ kinds: [1], tagFilter: { letter: 't', values: ['bitcoin', 'nostr'] } }),
    );
    const filter = resolveSpellFilter(parseSpell(event), { me: undefined, contacts: [] });
    expect(filter?.['#t']).toEqual(['bitcoin', 'nostr']);
  });

  it('ignores a malformed (non-single-letter) tag filter instead of producing "#undefined"', () => {
    const spell = parsedSpell({ tagFilter: { letter: '', values: ['x'] } });
    const filter = resolveSpellFilter(spell, { me: undefined, contacts: [] });
    expect(Object.keys(filter ?? {}).some((key) => key.startsWith('#'))).toBe(false);
  });

  it('clamps an excessive limit to the maximum', () => {
    const spell = parsedSpell({ limit: 1_000_000 });
    const filter = resolveSpellFilter(spell, { me: undefined, contacts: [] });
    expect(filter?.limit).toBe(500);
  });

  it('drops a zero or NaN limit rather than sending a degenerate query', () => {
    expect(resolveSpellFilter(parsedSpell({ limit: 0 }), { me: undefined, contacts: [] })?.limit).toBeUndefined();
    expect(resolveSpellFilter(parsedSpell({ limit: NaN }), { me: undefined, contacts: [] })?.limit).toBeUndefined();
  });

  it('keeps a normal, in-range limit as-is', () => {
    const spell = parsedSpell({ limit: 50 });
    const filter = resolveSpellFilter(spell, { me: undefined, contacts: [] });
    expect(filter?.limit).toBe(50);
  });
});
