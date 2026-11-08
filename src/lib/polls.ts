import type { NostrEvent } from '@nostrify/nostrify';

/**
 * NIP-88 polls: a kind 1068 poll lists its options, the relays it expects
 * answers on, its type and an optional end time; kind 1018 responses point at
 * it with an `e` tag and carry one or more `response` tags.
 *
 * Everything here is pure so the rules that decide a result can be read (and
 * reasoned about) without any React or relay code in the way.
 */

export const POLL_KIND = 1068;
export const POLL_RESPONSE_KIND = 1018;

export type PollType = 'singlechoice' | 'multiplechoice';

export interface PollOption {
  id: string;
  label: string;
}

export interface Poll {
  event: NostrEvent;
  /** The poll's label, from `content`. */
  question: string;
  options: PollOption[];
  /** Relays the poll expects responses on, already validated and deduplicated. */
  relays: string[];
  pollType: PollType;
  /** Unix seconds; undefined when the poll has no (valid) end time. */
  endsAt?: number;
}

/** NIP-88 option ids are "any alphanumeric"; the length cap is app policy. */
const OPTION_ID_RE = /^[A-Za-z0-9]{1,64}$/;

export const MAX_OPTIONS = 20;
export const MAX_OPTION_LABEL = 200;
export const MAX_QUESTION = 1000;
export const MAX_POLL_RELAYS = 8;

/**
 * Responses dated further than this into the future are ignored. Otherwise a
 * voter could pre-date a response so it stays their "latest" forever.
 */
export const FUTURE_TOLERANCE_SECONDS = 10 * 60;

export function isValidOptionId(id: string): boolean {
  return OPTION_ID_RE.test(id);
}

/** A websocket relay URL in canonical form, or undefined if it is not one. */
export function normalizeRelayUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return undefined;
    if (!url.hostname || url.username || url.password) return undefined;
    url.hash = '';
    // `new URL` keeps a lone trailing slash on the root path; relays are
    // usually written without it, so drop it to make duplicates collapse.
    return url.pathname === '/' && !url.search ? url.href.replace(/\/$/, '') : url.href;
  } catch {
    return undefined;
  }
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value || !/^\d{1,12}$/.test(value)) return undefined;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : undefined;
}

/**
 * Reads a kind 1068 event into a poll, or returns null when it cannot be
 * voted on: no question, or fewer than two usable options. Malformed option
 * tags and duplicate ids are dropped (the first occurrence wins), invalid
 * relay URLs are ignored, and a missing or unknown `polltype` means
 * single choice, as NIP-88 specifies for a missing one.
 */
export function parsePoll(event: NostrEvent): Poll | null {
  if (event.kind !== POLL_KIND) return null;
  const question = event.content.trim();
  if (!question) return null;

  const options: PollOption[] = [];
  const seen = new Set<string>();
  for (const [name, id, label] of event.tags) {
    if (name !== 'option' || typeof id !== 'string' || typeof label !== 'string') continue;
    const text = label.trim();
    if (!isValidOptionId(id) || !text || seen.has(id)) continue;
    seen.add(id);
    options.push({ id, label: text });
    if (options.length >= MAX_OPTIONS) break;
  }
  if (options.length < 2) return null;

  const relays: string[] = [];
  for (const [name, value] of event.tags) {
    if (name !== 'relay') continue;
    const url = normalizeRelayUrl(value);
    if (url && !relays.includes(url)) relays.push(url);
    if (relays.length >= MAX_POLL_RELAYS) break;
  }

  const type = event.tags.find(([name]) => name === 'polltype')?.[1];
  const endsAt = parseTimestamp(event.tags.find(([name]) => name === 'endsAt')?.[1]);

  return {
    event,
    question,
    options,
    relays,
    pollType: type === 'multiplechoice' ? 'multiplechoice' : 'singlechoice',
    endsAt,
  };
}

export function isPoll(event: NostrEvent): boolean {
  return parsePoll(event) !== null;
}

export function isPollClosed(poll: Pick<Poll, 'endsAt'>, now = Math.floor(Date.now() / 1000)): boolean {
  return poll.endsAt !== undefined && now >= poll.endsAt;
}

/** Whether a response's timestamp falls inside the poll's limits. */
export function isWithinPollLimits(
  poll: Poll,
  createdAt: number,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (createdAt < poll.event.created_at) return false;
  if (poll.endsAt !== undefined && createdAt > poll.endsAt) return false;
  return createdAt <= now + FUTURE_TOLERANCE_SECONDS;
}

/**
 * The option ids a response actually selects, or null if the response does
 * not count:
 *
 * - **singlechoice**: only the first `response` tag is the answer. If that
 *   first tag names an option the poll does not have, the response is invalid;
 *   later tags are never promoted in its place.
 * - **multiplechoice**: every distinct valid option id counts once, whatever
 *   order or repetition the tags have. Unknown ids are ignored; a response
 *   with none left is invalid.
 */
export function responseChoices(poll: Poll, response: NostrEvent): string[] | null {
  if (response.kind !== POLL_RESPONSE_KIND) return null;
  if (!response.tags.some(([name, value]) => name === 'e' && value === poll.event.id)) return null;

  const valid = new Set(poll.options.map((option) => option.id));
  const answers = response.tags
    .filter(([name, value]) => name === 'response' && typeof value === 'string')
    .map(([, value]) => value);

  if (poll.pollType === 'singlechoice') {
    const first = answers[0];
    return first !== undefined && valid.has(first) ? [first] : null;
  }

  const chosen: string[] = [];
  for (const id of answers) {
    if (valid.has(id) && !chosen.includes(id)) chosen.push(id);
  }
  return chosen.length > 0 ? chosen : null;
}

/** NIP-01 ordering: later timestamp wins, the lowest id breaks ties. */
function isNewer(candidate: NostrEvent, current: NostrEvent): boolean {
  if (candidate.created_at !== current.created_at) return candidate.created_at > current.created_at;
  return candidate.id < current.id;
}

export interface PollTally {
  /** Votes per option id. */
  counts: Record<string, number>;
  /** Pubkeys whose vote is counted — at most one response each. */
  voters: number;
  /** The counted choices of each voter. */
  choices: Map<string, string[]>;
  /** Responses that were fetched but did not count (invalid or out of range). */
  ignored: number;
  /** Responses replaced by a later valid response from the same pubkey. */
  superseded: number;
}

/**
 * Counts one vote per pubkey: the latest valid response within the poll's
 * limits. Invalid or out-of-range responses are skipped before the latest is
 * picked, so they can neither add a vote nor erase an earlier valid one.
 * Duplicate events (the same id from several relays) are counted once.
 */
export function tallyPoll(
  poll: Poll,
  responses: Iterable<NostrEvent>,
  now = Math.floor(Date.now() / 1000),
): PollTally {
  const unique = new Map<string, NostrEvent>();
  for (const response of responses) unique.set(response.id, response);

  const latest = new Map<string, { event: NostrEvent; choices: string[] }>();
  let ignored = 0;
  let valid = 0;

  for (const event of unique.values()) {
    const choices = isWithinPollLimits(poll, event.created_at, now) ? responseChoices(poll, event) : null;
    if (!choices) {
      ignored += 1;
      continue;
    }
    valid += 1;
    const current = latest.get(event.pubkey);
    if (!current || isNewer(event, current.event)) latest.set(event.pubkey, { event, choices });
  }

  const counts: Record<string, number> = Object.fromEntries(poll.options.map((option) => [option.id, 0]));
  const choices = new Map<string, string[]>();
  for (const [pubkey, vote] of latest) {
    choices.set(pubkey, vote.choices);
    for (const id of vote.choices) counts[id] += 1;
  }

  return { counts, voters: latest.size, choices, ignored, superseded: valid - latest.size };
}

/** Random alphanumeric option id, like the ones in the NIP-88 example. */
export function generateOptionId(length = 9): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export interface PollDraft {
  question: string;
  options: string[];
  pollType: PollType;
  /** Unix seconds, or undefined for a poll that never closes. */
  endsAt?: number;
  relays: string[];
}

export type PollDraftResult =
  | { ok: true; tags: string[][]; content: string }
  | { ok: false; error: string };

/**
 * Validates what a user typed into the composer and turns it into the tags
 * of a kind 1068 event. Option ids are freshly generated and unique.
 */
export function buildPollEvent(draft: PollDraft, now = Math.floor(Date.now() / 1000)): PollDraftResult {
  const question = draft.question.trim();
  if (!question) return { ok: false, error: 'Ask a question.' };
  if (question.length > MAX_QUESTION) return { ok: false, error: `Keep the question under ${MAX_QUESTION} characters.` };

  const labels = draft.options.map((option) => option.trim()).filter(Boolean);
  if (labels.length < 2) return { ok: false, error: 'Add at least two options.' };
  if (labels.length > MAX_OPTIONS) return { ok: false, error: `A poll can have at most ${MAX_OPTIONS} options.` };
  if (labels.some((label) => label.length > MAX_OPTION_LABEL)) {
    return { ok: false, error: `Keep each option under ${MAX_OPTION_LABEL} characters.` };
  }
  const folded = labels.map((label) => label.toLocaleLowerCase());
  if (new Set(folded).size !== folded.length) return { ok: false, error: 'Two options have the same text.' };

  const relays: string[] = [];
  for (const value of draft.relays) {
    if (!value.trim()) continue;
    const url = normalizeRelayUrl(value);
    if (!url) return { ok: false, error: `“${value.trim()}” is not a relay address (wss://…).` };
    if (!relays.includes(url)) relays.push(url);
  }
  if (relays.length === 0) return { ok: false, error: 'Add at least one relay for responses.' };
  if (relays.length > MAX_POLL_RELAYS) return { ok: false, error: `Use at most ${MAX_POLL_RELAYS} relays.` };

  if (draft.endsAt !== undefined) {
    if (!Number.isSafeInteger(draft.endsAt)) return { ok: false, error: 'The end time is not valid.' };
    if (draft.endsAt <= now + 60) return { ok: false, error: 'The end time must be at least a minute from now.' };
  }

  const ids = new Set<string>();
  while (ids.size < labels.length) ids.add(generateOptionId());
  const optionIds = [...ids];

  const tags: string[][] = [
    ...labels.map((label, index) => ['option', optionIds[index], label]),
    ...relays.map((url) => ['relay', url]),
    ['polltype', draft.pollType],
    ...(draft.endsAt !== undefined ? [['endsAt', String(draft.endsAt)]] : []),
    ['alt', `Poll: ${question.slice(0, 200)}`],
  ];

  return { ok: true, tags, content: question };
}

/** Tags for a kind 1018 response, choices kept in the order they were given. */
export function buildResponseTags(poll: Poll, choices: string[]): string[][] {
  const valid = new Set(poll.options.map((option) => option.id));
  const picked = [...new Set(choices)].filter((id) => valid.has(id));
  const counted = poll.pollType === 'singlechoice' ? picked.slice(0, 1) : picked;
  return [['e', poll.event.id], ...counted.map((id) => ['response', id])];
}
