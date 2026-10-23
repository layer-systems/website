import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

/**
 * NIP-51 lists: shared parsing, encryption and validation, so every list hook
 * (mute list, bookmarks, follow sets, the Lists app) treats public and private
 * items the same way.
 *
 * Public items live in `tags`. Private items are a JSON array shaped like
 * `tags`, encrypted to the author's own key and stored in `content` — NIP-44
 * today, NIP-04 in lists written by older clients (recognisable by `?iv=`).
 */

/** Tag names that can appear as list items. */
export type ItemTagName = 'p' | 'e' | 'a' | 't' | 'word' | 'relay' | 'emoji';

export interface ListKindInfo {
  kind: number;
  name: string;
  /** Singular noun for one list of this kind, e.g. "follow set". */
  noun: string;
  /** What the list is for, shown in empty states and the create dialog. */
  description: string;
  /** Sets are addressable (many per user, keyed by `d`); standard lists are replaceable (one per user). */
  type: 'set' | 'standard';
  itemTags: ItemTagName[];
  /** Kinds an `a` item may point at; unrestricted when absent. */
  addressKinds?: number[];
}

export const LIST_KINDS: ListKindInfo[] = [
  {
    kind: 30000,
    name: 'Follow sets',
    noun: 'follow set',
    description: 'Groups of people you can read as their own feed.',
    type: 'set',
    itemTags: ['p'],
  },
  {
    kind: 30002,
    name: 'Relay sets',
    noun: 'relay set',
    description: 'Named groups of relays, e.g. for a topic or a region.',
    type: 'set',
    itemTags: ['relay'],
  },
  {
    kind: 30003,
    name: 'Bookmark sets',
    noun: 'bookmark set',
    description: 'Notes and articles saved under a heading of your choice.',
    type: 'set',
    itemTags: ['e', 'a'],
  },
  {
    kind: 30004,
    name: 'Curation sets',
    noun: 'curation set',
    description: 'Hand-picked articles and music tracks to share with others.',
    type: 'set',
    itemTags: ['a', 'e'],
    addressKinds: [30023, 31337],
  },
  {
    kind: 30015,
    name: 'Interest sets',
    noun: 'interest set',
    description: 'Hashtags grouped around one interest.',
    type: 'set',
    itemTags: ['t'],
  },
  {
    kind: 30030,
    name: 'Emoji sets',
    noun: 'emoji set',
    description: 'Custom emoji you can use in notes and reactions.',
    type: 'set',
    itemTags: ['emoji'],
  },
  {
    kind: 39089,
    name: 'Starter packs',
    noun: 'starter pack',
    description: 'People to recommend to newcomers. Usually public.',
    type: 'set',
    itemTags: ['p'],
  },
  {
    kind: 10000,
    name: 'Mute list',
    noun: 'mute list',
    description: 'People, hashtags, words and threads you don’t want to see.',
    type: 'standard',
    itemTags: ['p', 't', 'word', 'e'],
  },
  {
    kind: 10001,
    name: 'Pinned notes',
    noun: 'pinned notes list',
    description: 'Notes you want to show off on your profile.',
    type: 'standard',
    itemTags: ['e'],
  },
  {
    kind: 10003,
    name: 'Bookmarks',
    noun: 'bookmark list',
    description: 'Notes and articles you have saved, shown in the Bookmarks app.',
    type: 'standard',
    itemTags: ['e', 'a'],
    addressKinds: [30023],
  },
  {
    kind: 10004,
    name: 'Communities',
    noun: 'community list',
    description: 'NIP-72 communities you belong to.',
    type: 'standard',
    itemTags: ['a'],
    addressKinds: [34550],
  },
  {
    kind: 10006,
    name: 'Blocked relays',
    noun: 'blocked relay list',
    description: 'Relays clients should never connect to on your behalf.',
    type: 'standard',
    itemTags: ['relay'],
  },
  {
    kind: 10007,
    name: 'Search relays',
    noun: 'search relay list',
    description: 'Relays to use for search queries.',
    type: 'standard',
    itemTags: ['relay'],
  },
  {
    kind: 10015,
    name: 'Interests',
    noun: 'interest list',
    description: 'Hashtags and interest sets you care about.',
    type: 'standard',
    itemTags: ['t', 'a'],
    addressKinds: [30015],
  },
  {
    kind: 10030,
    name: 'Emojis',
    noun: 'emoji list',
    description: 'Emoji and emoji sets you want at hand.',
    type: 'standard',
    itemTags: ['emoji', 'a'],
    addressKinds: [30030],
  },
];

const KIND_INFO = new Map(LIST_KINDS.map((info) => [info.kind, info]));

export function listKindInfo(kind: number): ListKindInfo | undefined {
  return KIND_INFO.get(kind);
}

export const SET_KINDS = LIST_KINDS.filter((info) => info.type === 'set').map((info) => info.kind);
export const STANDARD_KINDS = LIST_KINDS.filter((info) => info.type === 'standard').map((info) => info.kind);

export function isSetKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/** Kind 30001 only ever held the deprecated generic lists. */
export const LEGACY_GENERIC_KIND = 30001;

/**
 * Before NIP-51 moved them to replaceable kinds, clients stored these lists
 * as kind 30000/30001 with a well-known `d` tag. They map onto a standard list.
 */
const LEGACY_TARGETS: Record<string, number> = {
  '30000:mute': 10000,
  '30001:mute': 10000,
  '30001:pin': 10001,
  '30001:bookmark': 10003,
  '30001:communities': 10004,
};

/** The standard list kind a deprecated list migrates to, or undefined for a normal list. */
export function legacyTargetKind(kind: number, identifier: string | undefined): number | undefined {
  if (identifier === undefined) return undefined;
  return LEGACY_TARGETS[`${kind}:${identifier}`];
}

export const ITEM_LABELS: Record<ItemTagName, string> = {
  p: 'Person',
  e: 'Note',
  a: 'Address',
  t: 'Hashtag',
  word: 'Word',
  relay: 'Relay',
  emoji: 'Emoji',
};

/** The result of opening a list's private items. */
export interface PrivateItems {
  tags: string[][];
  /**
   * `none`: no ciphertext. `ok`: decrypted. `locked`: ciphertext exists but
   * this signer couldn't (or wouldn't) open it — the list must not be
   * rewritten, or those items would be lost.
   */
  status: 'none' | 'ok' | 'locked';
  /** The ciphertext used the legacy NIP-04 scheme and will be upgraded on the next save. */
  legacyEncryption: boolean;
}

export function isNip04Ciphertext(content: string): boolean {
  return content.includes('?iv=');
}

/**
 * Successful decryptions, keyed by author and ciphertext. Several queries read
 * the same list (overview, detail, mute filtering), and without this an
 * extension or remote signer would prompt once for each. It only ever lives
 * in memory.
 */
const decryptCache = new Map<string, string[][]>();
const DECRYPT_CACHE_LIMIT = 200;

type ListSigner = Pick<NostrSigner, 'nip04' | 'nip44'>;

export async function decryptPrivateItems(
  signer: ListSigner,
  pubkey: string,
  content: string,
): Promise<PrivateItems> {
  if (!content) return { tags: [], status: 'none', legacyEncryption: false };
  const legacyEncryption = isNip04Ciphertext(content);
  const cacheKey = `${pubkey}:${content}`;
  const cached = decryptCache.get(cacheKey);
  if (cached) return { tags: cached, status: 'ok', legacyEncryption };

  try {
    const plaintext = legacyEncryption
      ? await signer.nip04?.decrypt(pubkey, content)
      : await signer.nip44?.decrypt(pubkey, content);
    if (plaintext === undefined) return { tags: [], status: 'locked', legacyEncryption };
    const parsed: unknown = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) return { tags: [], status: 'locked', legacyEncryption };
    const tags = parsed.filter(
      (tag): tag is string[] => Array.isArray(tag) && tag.length > 0 && tag.every((part) => typeof part === 'string'),
    );
    if (decryptCache.size >= DECRYPT_CACHE_LIMIT) {
      const oldest = decryptCache.keys().next().value;
      if (oldest !== undefined) decryptCache.delete(oldest);
    }
    decryptCache.set(cacheKey, tags);
    return { tags, status: 'ok', legacyEncryption };
  } catch {
    return { tags: [], status: 'locked', legacyEncryption };
  }
}

/** Always NIP-44. An empty private section is stored as empty content. */
export async function encryptPrivateItems(signer: ListSigner, pubkey: string, tags: string[][]): Promise<string> {
  if (tags.length === 0) return '';
  if (!signer.nip44) {
    throw new Error('Your signer can’t encrypt with NIP-44, so private items can’t be saved. Make them public or use another signer.');
  }
  const content = await signer.nip44.encrypt(pubkey, JSON.stringify(tags));
  decryptCache.set(`${pubkey}:${content}`, tags);
  return content;
}

/** A parsed NIP-51 list: metadata plus public and private item tags. */
export interface Nip51List {
  kind: number;
  pubkey: string;
  /** The `d` tag for sets; undefined for standard lists. */
  identifier?: string;
  title?: string;
  image?: string;
  description?: string;
  /** Non-item public tags other than `d`, kept verbatim so nothing written by other clients is lost. */
  extraTags: string[][];
  publicItems: string[][];
  /**
   * Every decrypted private tag. Unknown private tags are kept here too (and
   * simply not rendered), so a save never drops them.
   */
  privateItems: string[][];
  privateStatus: PrivateItems['status'];
  legacyEncryption: boolean;
  createdAt: number;
  /** Id of the event this was parsed from; absent for a list that doesn't exist yet. */
  eventId?: string;
}

/** Tags never carried over to a new version: signing clients add their own. */
const DROPPED_TAGS = new Set(['d', 'client']);

function tagOf(tags: string[][], name: string): string | undefined {
  return tags.find(([tagName]) => tagName === name)?.[1];
}

export function isItemTag(kind: number, tag: string[]): boolean {
  const info = listKindInfo(kind);
  // Unknown or legacy kinds: treat anything that isn't list metadata as an item.
  const allowed: readonly string[] = info?.itemTags ?? ['p', 'e', 'a', 't', 'word', 'relay', 'emoji', 'r'];
  return allowed.includes(tag[0]) && typeof tag[1] === 'string' && tag[1].length > 0;
}

export function parseList(event: NostrEvent, privateItems: PrivateItems): Nip51List {
  const publicItems: string[][] = [];
  const extraTags: string[][] = [];
  for (const tag of event.tags) {
    if (DROPPED_TAGS.has(tag[0])) continue;
    if (isItemTag(event.kind, tag)) publicItems.push(tag);
    else extraTags.push(tag);
  }

  return {
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: isSetKind(event.kind) ? (tagOf(event.tags, 'd') ?? '') : undefined,
    title: tagOf(event.tags, 'title')?.trim() || tagOf(event.tags, 'name')?.trim() || undefined,
    image: tagOf(event.tags, 'image'),
    description: tagOf(event.tags, 'description')?.trim() || undefined,
    extraTags,
    publicItems,
    privateItems: privateItems.tags,
    privateStatus: privateItems.status,
    legacyEncryption: privateItems.legacyEncryption,
    createdAt: event.created_at,
    eventId: event.id,
  };
}

/** A list with no versions published yet. */
export function emptyList(kind: number, pubkey: string, identifier?: string): Nip51List {
  return {
    kind,
    pubkey,
    identifier: isSetKind(kind) ? (identifier ?? '') : undefined,
    extraTags: [],
    publicItems: [],
    privateItems: [],
    privateStatus: 'none',
    legacyEncryption: false,
    createdAt: 0,
  };
}

/** Private tags that render as items for this kind; the rest stay hidden but are preserved. */
export function visiblePrivateItems(list: Nip51List): string[][] {
  return list.privateItems.filter((tag) => isItemTag(list.kind, tag));
}

/**
 * True for the emptied replacement published when a set is deleted: relays
 * that ignore NIP-09 keep serving it, and it should read as gone.
 */
export function isDeletedPlaceholder(list: Nip51List): boolean {
  return (
    isSetKind(list.kind) &&
    list.publicItems.length === 0 &&
    list.privateStatus === 'none' &&
    !list.title &&
    !list.description &&
    !list.image &&
    list.extraTags.every(([name]) => name === 'alt')
  );
}

export function listTitle(list: Pick<Nip51List, 'kind' | 'identifier' | 'title'>): string {
  return list.title || list.identifier || listKindInfo(list.kind)?.name || `Kind ${list.kind} list`;
}

/** Stable identity of an item within a list: its tag name and value. */
export function itemKey(tag: string[]): string {
  return `${tag[0]}:${tag[1]}`;
}

/** Builds the unsigned event for a list. Private items must already be encrypted into `content`. */
export function listEventTemplate(list: Nip51List, content: string): { kind: number; content: string; tags: string[][] } {
  const tags: string[][] = [];
  if (isSetKind(list.kind)) tags.push(['d', list.identifier ?? '']);
  const extras = list.extraTags.filter(([name]) => !['title', 'image', 'description', 'name'].includes(name));
  if (list.title) tags.push(['title', list.title]);
  if (list.image) tags.push(['image', list.image]);
  if (list.description) tags.push(['description', list.description]);
  tags.push(...extras, ...list.publicItems);
  return { kind: list.kind, content, tags };
}

/** `kind:pubkey:d`, the NIP-01 address of a set. */
export function listAddress(list: Pick<Nip51List, 'kind' | 'pubkey' | 'identifier'>): string {
  return `${list.kind}:${list.pubkey}:${list.identifier ?? ''}`;
}

export function listNaddr(list: Pick<Nip51List, 'kind' | 'pubkey' | 'identifier'>, relays?: string[]): string {
  return nip19.naddrEncode({ kind: list.kind, pubkey: list.pubkey, identifier: list.identifier ?? '', relays });
}

/** A `d` tag from a title, with a random suffix so two lists with the same name don't collide. */
export function generateIdentifier(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return slug ? `${slug}-${suffix}` : suffix;
}

// ---------------------------------------------------------------------------
// Item operations
// ---------------------------------------------------------------------------

export type ListOperation =
  | { type: 'add'; tag: string[]; private: boolean }
  | { type: 'remove'; key: string }
  | { type: 'setPrivacy'; key: string; private: boolean }
  | { type: 'move'; key: string; direction: -1 | 1 }
  | { type: 'meta'; title?: string; image?: string; description?: string }
  | { type: 'merge'; publicItems: string[][]; privateItems: string[][] }
  | { type: 'clear' };

function hasItem(list: Nip51List, key: string): boolean {
  return list.publicItems.some((tag) => itemKey(tag) === key) || list.privateItems.some((tag) => itemKey(tag) === key);
}

/**
 * Applies one edit. Edits are replayed on the freshest copy of the list right
 * before publishing, so changes made in another client since it was loaded
 * are merged rather than overwritten.
 */
export function applyListOperation(list: Nip51List, op: ListOperation): Nip51List {
  switch (op.type) {
    case 'add': {
      if (hasItem(list, itemKey(op.tag))) return list;
      // NIP-51: new items go at the end, keeping the list chronological.
      return op.private
        ? { ...list, privateItems: [...list.privateItems, op.tag] }
        : { ...list, publicItems: [...list.publicItems, op.tag] };
    }
    case 'remove':
      return {
        ...list,
        publicItems: list.publicItems.filter((tag) => itemKey(tag) !== op.key),
        privateItems: list.privateItems.filter((tag) => itemKey(tag) !== op.key),
      };
    case 'setPrivacy': {
      const from = op.private ? list.publicItems : list.privateItems;
      const tag = from.find((candidate) => itemKey(candidate) === op.key);
      if (!tag) return list;
      const remaining = from.filter((candidate) => itemKey(candidate) !== op.key);
      return op.private
        ? { ...list, publicItems: remaining, privateItems: [...list.privateItems, tag] }
        : { ...list, privateItems: remaining, publicItems: [...list.publicItems, tag] };
    }
    case 'move': {
      const field = list.publicItems.some((tag) => itemKey(tag) === op.key) ? 'publicItems' : 'privateItems';
      const items = [...list[field]];
      const index = items.findIndex((tag) => itemKey(tag) === op.key);
      // Private items may include hidden, unrecognised tags; step over them
      // so a move always visibly changes the order.
      let target = index + op.direction;
      while (target >= 0 && target < items.length && !isItemTag(list.kind, items[target])) target += op.direction;
      if (index < 0 || target < 0 || target >= items.length) return list;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...list, [field]: items };
    }
    case 'meta':
      return {
        ...list,
        title: op.title !== undefined ? op.title.trim() || undefined : list.title,
        image: op.image !== undefined ? op.image.trim() || undefined : list.image,
        description: op.description !== undefined ? op.description.trim() || undefined : list.description,
      };
    case 'merge': {
      let next = list;
      for (const tag of op.publicItems) next = applyListOperation(next, { type: 'add', tag, private: false });
      for (const tag of op.privateItems) next = applyListOperation(next, { type: 'add', tag, private: true });
      return next;
    }
    case 'clear':
      return {
        ...list,
        publicItems: [],
        // Unknown private tags aren't items the user can see, so they aren't cleared either.
        privateItems: list.privateItems.filter((tag) => !isItemTag(list.kind, tag)),
      };
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const SHORTCODE = /^[a-zA-Z0-9_-]+$/;

export type ParsedItem = { ok: true; tag: string[] } | { ok: false; error: string };

function relayHint(relays: string[] | undefined): string | undefined {
  return relays?.find((url) => url.startsWith('wss://'));
}

function stripNostrUri(value: string): string {
  return value.trim().replace(/^nostr:/i, '');
}

export function normalizeRelayUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'wss:') return undefined;
    // `new URL` lowercases the host; drop a lone trailing slash for a canonical form.
    return url.href.replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export function isValidAddress(value: string, addressKinds?: number[]): boolean {
  const [kindPart, pubkey, ...rest] = value.split(':');
  const kind = Number(kindPart);
  if (!/^\d+$/.test(kindPart ?? '') || !HEX64.test(pubkey ?? '') || rest.length === 0) return false;
  if (kind < 30000 || kind >= 40000) return false;
  return !addressKinds || addressKinds.includes(kind);
}

/**
 * Turns user input into a canonical item tag for `tagName`: NIP-19 codes
 * become hex ids and `kind:pubkey:d` coordinates, relay URLs must be `wss://`,
 * hashtags and words are lowercased.
 */
export function parseItemInput(tagName: ItemTagName, input: string, options: { addressKinds?: number[]; emojiUrl?: string } = {}): ParsedItem {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter a value.' };

  switch (tagName) {
    case 'p': {
      const value = stripNostrUri(raw);
      if (HEX64.test(value.toLowerCase())) return { ok: true, tag: ['p', value.toLowerCase()] };
      try {
        const decoded = nip19.decode(value);
        if (decoded.type === 'npub') return { ok: true, tag: ['p', decoded.data] };
        if (decoded.type === 'nprofile') {
          const hint = relayHint(decoded.data.relays);
          return { ok: true, tag: hint ? ['p', decoded.data.pubkey, hint] : ['p', decoded.data.pubkey] };
        }
      } catch {
        // fall through
      }
      return { ok: false, error: 'Enter an npub, nprofile or 64-character hex public key.' };
    }
    case 'e': {
      const value = stripNostrUri(raw);
      if (HEX64.test(value.toLowerCase())) return { ok: true, tag: ['e', value.toLowerCase()] };
      try {
        const decoded = nip19.decode(value);
        if (decoded.type === 'note') return { ok: true, tag: ['e', decoded.data] };
        if (decoded.type === 'nevent') {
          const hint = relayHint(decoded.data.relays);
          return { ok: true, tag: hint ? ['e', decoded.data.id, hint] : ['e', decoded.data.id] };
        }
      } catch {
        // fall through
      }
      return { ok: false, error: 'Enter a note, nevent or 64-character hex event id.' };
    }
    case 'a': {
      const value = stripNostrUri(raw);
      let address: string | undefined;
      let hint: string | undefined;
      if (value.startsWith('naddr1')) {
        try {
          const decoded = nip19.decode(value);
          if (decoded.type === 'naddr') {
            address = `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`;
            hint = relayHint(decoded.data.relays);
          }
        } catch {
          // fall through
        }
      } else {
        const [kind, pubkey, ...rest] = value.split(':');
        address = `${kind}:${(pubkey ?? '').toLowerCase()}:${rest.join(':')}`;
      }
      if (!address || !isValidAddress(address, options.addressKinds)) {
        const kinds = options.addressKinds ? ` of kind ${options.addressKinds.join(' or ')}` : '';
        return { ok: false, error: `Enter an naddr or kind:pubkey:identifier address${kinds}.` };
      }
      return { ok: true, tag: hint ? ['a', address, hint] : ['a', address] };
    }
    case 't': {
      const value = raw.replace(/^#/, '').toLowerCase();
      if (!value || /\s/.test(value)) return { ok: false, error: 'Enter a single hashtag without spaces.' };
      return { ok: true, tag: ['t', value] };
    }
    case 'word': {
      return { ok: true, tag: ['word', raw.toLowerCase()] };
    }
    case 'relay': {
      const url = normalizeRelayUrl(raw);
      if (!url) return { ok: false, error: 'Enter a relay URL starting with wss://.' };
      return { ok: true, tag: ['relay', url] };
    }
    case 'emoji': {
      const shortcode = raw.replace(/^:|:$/g, '');
      if (!SHORTCODE.test(shortcode)) return { ok: false, error: 'Shortcodes may only use letters, numbers, - and _.' };
      const url = options.emojiUrl?.trim() ?? '';
      if (!isHttpsUrl(url)) return { ok: false, error: 'Enter an https:// image URL for the emoji.' };
      return { ok: true, tag: ['emoji', shortcode, url] };
    }
  }
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Re-checks an item that is about to be published, whatever its origin. */
export function isValidItem(tag: string[], addressKinds?: number[]): boolean {
  const [name, value] = tag;
  if (typeof value !== 'string') return false;
  switch (name) {
    case 'p':
    case 'e':
      return HEX64.test(value);
    case 'a':
      return isValidAddress(value, addressKinds);
    case 'relay':
      return normalizeRelayUrl(value) !== undefined;
    case 't':
    case 'word':
      return value.length > 0 && value === value.toLowerCase();
    case 'emoji':
      return SHORTCODE.test(value) && isHttpsUrl(tag[2] ?? '');
    default:
      return true;
  }
}
