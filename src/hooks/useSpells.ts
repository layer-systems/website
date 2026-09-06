import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useCurrentUser } from './useCurrentUser';
import { useMyFollows } from './useFollows';
import { useNostrPublish } from './useNostrPublish';
import { tagValue, tagValues } from '@/lib/nostrUtils';

/**
 * A third-party draft NIP (not in the official nostr-protocol/nips registry)
 * from the Grimoire client (github.com/purrgrammer/grimoire): kind 777
 * "Spell" events encode a REQ filter as portable, shareable tags, with
 * `$me`/`$contacts` runtime variables and relative timestamps ("7d", "now").
 * Kind numbers are adopted as-is for interop with that client.
 */
export const SPELL_KIND = 777;

const RELATIVE_TIME_RE = /^(\d+)(s|m|h|d|w|mo|y)$/;
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2_592_000,
  y: 31_536_000,
};

/** A single NIP-01 tag-filter letter, e.g. the `t` in `#t`. */
const TAG_LETTER_RE = /^[a-zA-Z]$/;
/** Caps a relay-sourced spell's `limit` so Run can't be tricked into a huge query. */
const MAX_SPELL_LIMIT = 500;

/** Resolves `now`, `<n><unit>` (e.g. `7d`) or a literal unix timestamp string. */
export function resolveTimestamp(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'now') return Math.floor(Date.now() / 1000);
  const relative = RELATIVE_TIME_RE.exec(trimmed);
  if (relative) {
    const [, amount, unit] = relative;
    return Math.floor(Date.now() / 1000) - Number(amount) * UNIT_SECONDS[unit];
  }
  const absolute = Number(trimmed);
  return Number.isFinite(absolute) && absolute > 0 ? Math.floor(absolute) : undefined;
}

export interface SpellInput {
  name?: string;
  description?: string;
  kinds: number[];
  /** `$me`, `$contacts`, or a literal list of pubkeys (hex). */
  authors?: string[];
  /** A single `#<letter>` tag filter, e.g. `{ letter: 't', values: ['bitcoin'] }`. */
  tagFilter?: { letter: string; values: string[] };
  limit?: number;
  since?: string;
  until?: string;
  search?: string;
  topics?: string[];
}

export interface ParsedSpell {
  name?: string;
  description: string;
  kinds: number[];
  authors: string[];
  tagFilter?: { letter: string; values: string[] };
  limit?: number;
  since?: string;
  until?: string;
  search?: string;
  topics: string[];
  event: NostrEvent;
}

/** Builds the tag set for a spell event per the draft NIP. */
export function encodeSpellTags(input: SpellInput): string[][] {
  const tags: string[][] = [['cmd', 'REQ']];
  for (const kind of input.kinds) tags.push(['k', String(kind)]);
  if (input.authors?.length) tags.push(['authors', ...input.authors]);
  if (input.tagFilter?.values.length) tags.push(['tag', input.tagFilter.letter, ...input.tagFilter.values]);
  if (input.limit) tags.push(['limit', String(input.limit)]);
  if (input.since?.trim()) tags.push(['since', input.since.trim()]);
  if (input.until?.trim()) tags.push(['until', input.until.trim()]);
  if (input.search?.trim()) tags.push(['search', input.search.trim()]);
  if (input.name?.trim()) tags.push(['name', input.name.trim()]);
  tags.push(['alt', `Spell: ${input.description || input.name || 'a saved Nostr query'}`]);
  for (const topic of input.topics ?? []) if (topic.trim()) tags.push(['t', topic.trim()]);
  return tags;
}

export function parseSpell(event: NostrEvent): ParsedSpell {
  const kinds = tagValues(event, 'k').map(Number).filter((n) => Number.isFinite(n));
  const authorsTag = event.tags.find(([name]) => name === 'authors');
  const tagFilterTag = event.tags.find(([name]) => name === 'tag');
  const limitValue = tagValue(event, 'limit');

  return {
    name: tagValue(event, 'name'),
    description: event.content,
    kinds,
    authors: authorsTag ? authorsTag.slice(1) : [],
    tagFilter: tagFilterTag ? { letter: tagFilterTag[1], values: tagFilterTag.slice(2) } : undefined,
    limit: limitValue ? Number(limitValue) : undefined,
    since: tagValue(event, 'since'),
    until: tagValue(event, 'until'),
    search: tagValue(event, 'search'),
    topics: tagValues(event, 't'),
    event,
  };
}

/** Resolves a parsed spell's `$me`/`$contacts` and relative timestamps into a real filter. */
export function resolveSpellFilter(
  spell: ParsedSpell,
  context: { me: string | undefined; contacts: string[] },
): NostrFilter | null {
  if (spell.kinds.length === 0) return null;

  const filter: NostrFilter = { kinds: spell.kinds };

  if (spell.authors.length > 0) {
    const resolved = spell.authors.flatMap((author) => {
      if (author === '$me') return context.me ? [context.me] : [];
      if (author === '$contacts') return context.contacts;
      return [author];
    });
    if (resolved.length === 0) return null;
    filter.authors = resolved;
  }

  // Relay-provided events are untrusted: a malformed spell must not produce
  // a filter key like "#undefined", or a limit that is 0/NaN/huge enough to
  // lock up the UI on Run.
  if (spell.tagFilter && TAG_LETTER_RE.test(spell.tagFilter.letter) && spell.tagFilter.values.length > 0) {
    filter[`#${spell.tagFilter.letter}`] = spell.tagFilter.values;
  }

  if (spell.limit !== undefined && Number.isFinite(spell.limit) && spell.limit > 0) {
    filter.limit = Math.min(spell.limit, MAX_SPELL_LIMIT);
  }
  if (spell.since) {
    const since = resolveTimestamp(spell.since);
    if (since !== undefined) filter.since = since;
  }
  if (spell.until) {
    const until = resolveTimestamp(spell.until);
    if (until !== undefined) filter.until = until;
  }
  if (spell.search) filter.search = spell.search;

  return filter;
}

/** `$me`/`$contacts` for the signed-in user, ready to hand to `resolveSpellFilter`. */
export function useSpellContext() {
  const { user } = useCurrentUser();
  const { data: contacts } = useMyFollows();
  return { me: user?.pubkey, contacts: contacts ?? [] };
}

export function useMySpells() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'spells', 'mine', user?.pubkey ?? ''],
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [SPELL_KIND], authors: [user!.pubkey], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });
}

export function useDiscoverSpells() {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'spells', 'discover'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [SPELL_KIND], limit: 100 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 60_000,
  });
}

export function useCreateSpell() {
  const publish = useNostrPublish();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async (input: SpellInput) => {
      if (!user) throw new Error('Sign in to save a spell');
      return publish.mutateAsync({ kind: SPELL_KIND, content: input.description ?? '', tags: encodeSpellTags(input) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nostr', 'spells', 'mine', user?.pubkey ?? ''] });
      queryClient.invalidateQueries({ queryKey: ['nostr', 'spells', 'discover'] });
    },
  });
}

/** Runs a spell's resolved filter on demand — a spell is a saved query, not a subscription. */
export function useRunSpell(filter: NostrFilter | null) {
  const { nostr } = useNostr();

  return useMutation({
    mutationFn: async () => {
      if (!filter) throw new Error('This spell has no runnable filter');
      return nostr.query([filter], { signal: AbortSignal.timeout(8000) });
    },
  });
}
