import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { newestEvent } from './replaceableLists';

/**
 * NIP-F4 podcasts. Each show is its own key pair: the show's metadata (kind
 * 10154) and its episodes (kind 54) are signed by that key, so the event's
 * `pubkey` — never a tag — is the show identity.
 *
 * NIP-F4's prose names the authored-podcasts list "kind:10164", but its own
 * example, NIP-51 and the NIP index all use 10064. 10064 is used here; see
 * NIP.md.
 */
export const PODCAST_EPISODE_KIND = 54;
export const PODCAST_METADATA_KIND = 10154;
export const FAVORITE_PODCASTS_KIND = 10054;
export const AUTHORED_PODCASTS_KIND = 10064;

export type PodcastRole = 'host' | 'cohost' | 'editor';
export const PODCAST_ROLES: PodcastRole[] = ['host', 'cohost', 'editor'];

const HEX64 = /^[0-9a-f]{64}$/;
const MAX_URL_LENGTH = 2048;
const MAX_SOURCES = 8;

export function isHexPubkey(value: unknown): value is string {
  return typeof value === 'string' && HEX64.test(value);
}

/**
 * The only media URLs we load: https, nothing else. Everything here came from
 * a relay, and the CSP only admits https media anyway, so an http, data:,
 * blob: or javascript: URL is dropped rather than half-working.
 */
export function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** A MIME type we are willing to pass to the media element, or undefined. */
function cleanMediaType(value: string | undefined): string | undefined {
  const type = value?.trim().toLowerCase();
  return type && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type) && type.length <= 100 ? type : undefined;
}

function text(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function firstTag(event: Pick<NostrEvent, 'tags'>, name: string): string | undefined {
  return event.tags.find(([tagName, value]) => tagName === name && typeof value === 'string')?.[1];
}

/**
 * NIP-36: `undefined` without the tag, otherwise the (possibly empty) reason.
 */
export function contentWarning(event: Pick<NostrEvent, 'tags'>): string | undefined {
  const tag = event.tags.find(([name]) => name === 'content-warning');
  if (!tag) return undefined;
  return text(tag[1], 200) ?? '';
}

export interface PodcastPerson {
  pubkey: string;
  role?: PodcastRole;
}

export interface PodcastShow {
  /** The show's own key — the identity everything else is scoped to. */
  pubkey: string;
  title: string;
  image?: string;
  description?: string;
  websites: string[];
  /** People the show *claims*. Unverified until each lists the show in their kind 10064. */
  people: PodcastPerson[];
  contentWarning?: string;
  createdAt: number;
  eventId: string;
}

/** Parses a kind 10154 event, or returns undefined when it can't be shown. */
export function parsePodcastMetadata(event: NostrEvent): PodcastShow | undefined {
  if (event.kind !== PODCAST_METADATA_KIND || !isHexPubkey(event.pubkey)) return undefined;
  const title = text(firstTag(event, 'title'), 200);
  if (!title) return undefined;

  const websites = [...new Set(event.tags
    .filter(([name]) => name === 'website')
    .map(([, value]) => safeHttpsUrl(value))
    .filter((url): url is string => Boolean(url)))].slice(0, 5);

  const people = new Map<string, PodcastPerson>();
  for (const [name, pubkey, role] of event.tags) {
    if (name !== 'p' || !isHexPubkey(pubkey) || pubkey === event.pubkey || people.has(pubkey)) continue;
    people.set(pubkey, { pubkey, role: PODCAST_ROLES.find((candidate) => candidate === role) });
  }

  return {
    pubkey: event.pubkey,
    title,
    image: safeHttpsUrl(firstTag(event, 'image')),
    description: text(firstTag(event, 'description'), 5000),
    websites,
    people: [...people.values()].slice(0, 20),
    contentWarning: contentWarning(event),
    createdAt: event.created_at,
    eventId: event.id,
  };
}

/**
 * The current metadata of each show. Kind 10154 is replaceable, so only the
 * newest event per key counts (NIP-01 tie-break) — an older, valid version is
 * never resurrected when the newest one turns out to be malformed.
 */
export function newestShows(events: NostrEvent[]): Map<string, PodcastShow> {
  const byAuthor = new Map<string, NostrEvent[]>();
  for (const event of events) {
    if (event.kind !== PODCAST_METADATA_KIND) continue;
    const list = byAuthor.get(event.pubkey) ?? [];
    list.push(event);
    byAuthor.set(event.pubkey, list);
  }
  const shows = new Map<string, PodcastShow>();
  for (const [pubkey, list] of byAuthor) {
    const latest = newestEvent(list);
    const show = latest && parsePodcastMetadata(latest);
    if (show) shows.set(pubkey, show);
  }
  return shows;
}

export interface AudioSource {
  url: string;
  type?: string;
}

export interface PodcastEpisode {
  id: string;
  /** The show key that signed the episode. */
  showPubkey: string;
  title: string;
  description?: string;
  image?: string;
  /** Markdown show notes. */
  notes: string;
  sources: AudioSource[];
  contentWarning?: string;
  createdAt: number;
}

/** Parses a kind 54 event; undefined when it lacks a title or any playable https audio. */
export function parseEpisode(event: NostrEvent): PodcastEpisode | undefined {
  if (event.kind !== PODCAST_EPISODE_KIND || !isHexPubkey(event.pubkey) || !/^[0-9a-f]{64}$/.test(event.id)) return undefined;
  const title = text(firstTag(event, 'title'), 300);
  if (!title) return undefined;

  const seen = new Set<string>();
  const sources: AudioSource[] = [];
  for (const [name, value, type] of event.tags) {
    if (name !== 'audio') continue;
    const url = safeHttpsUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ url, type: cleanMediaType(type) });
    if (sources.length >= MAX_SOURCES) break;
  }
  if (sources.length === 0) return undefined;

  return {
    id: event.id,
    showPubkey: event.pubkey,
    title,
    description: text(firstTag(event, 'description'), 2000),
    image: safeHttpsUrl(firstTag(event, 'image')),
    notes: event.content.slice(0, 100_000),
    sources,
    contentWarning: contentWarning(event),
    createdAt: event.created_at,
  };
}

/** Valid episodes, newest first, one per id. */
export function parseEpisodes(events: NostrEvent[]): PodcastEpisode[] {
  const byId = new Map<string, PodcastEpisode>();
  for (const event of events) {
    const episode = parseEpisode(event);
    if (episode && !byId.has(episode.id)) byId.set(episode.id, episode);
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

/**
 * Show keys each author lists in their newest kind 10064. Lists not signed by
 * the author they are attributed to never get here, because the map is keyed
 * by the event's own `pubkey`.
 */
export function authoredShows(events: NostrEvent[]): Map<string, Set<string>> {
  const byAuthor = new Map<string, NostrEvent[]>();
  for (const event of events) {
    if (event.kind !== AUTHORED_PODCASTS_KIND) continue;
    byAuthor.set(event.pubkey, [...(byAuthor.get(event.pubkey) ?? []), event]);
  }
  const result = new Map<string, Set<string>>();
  for (const [author, list] of byAuthor) {
    const latest = newestEvent(list);
    if (!latest) continue;
    result.set(author, new Set(latest.tags.filter(([name, value]) => name === 'p' && isHexPubkey(value)).map(([, value]) => value)));
  }
  return result;
}

export interface Attribution extends PodcastPerson {
  verified: boolean;
}

/**
 * NIP-F4: a `p` tag in show metadata is only a claim. It is confirmed when the
 * named person's own authored-podcasts list names the show back.
 */
export function attributePeople(show: PodcastShow, authored: Map<string, Set<string>>): Attribution[] {
  return show.people.map((person) => ({
    ...person,
    verified: authored.get(person.pubkey)?.has(show.pubkey) ?? false,
  }));
}

/** A shareable `nevent` for an episode, with the author, kind and relay hints a reader needs. */
export function episodeNevent(episode: Pick<PodcastEpisode, 'id' | 'showPubkey'>, relays: string[] = []): string {
  return nip19.neventEncode({
    id: episode.id,
    author: episode.showPubkey,
    kind: PODCAST_EPISODE_KIND,
    relays: relays.filter((url) => url.startsWith('wss://')).slice(0, 2),
  });
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export interface ShowInput {
  title: string;
  description: string;
  image: string;
  websites: string[];
  people: PodcastPerson[];
}

/** Tags this client edits on kind 10154. Everything else on the previous version is kept. */
const MANAGED_METADATA_TAGS = new Set(['title', 'image', 'description', 'website', 'p', 'alt', 'client']);

export type BuildResult = { ok: true; tags: string[][] } | { ok: false; error: string };

/**
 * Tags for a new version of the show's kind 10154. `previous` is the newest
 * published version; tags this form doesn't manage are carried over so a save
 * doesn't silently drop what another client wrote.
 */
export function buildMetadataTags(input: ShowInput, showPubkey: string, previous?: NostrEvent): BuildResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give the show a title.' };
  if (title.length > 200) return { ok: false, error: 'Keep the title under 200 characters.' };
  const image = input.image.trim();
  if (image && !safeHttpsUrl(image)) return { ok: false, error: 'The cover image must be an https:// URL.' };
  const websites: string[] = [];
  for (const raw of input.websites.map((value) => value.trim()).filter(Boolean)) {
    const url = safeHttpsUrl(raw);
    if (!url) return { ok: false, error: `“${raw}” is not an https:// website URL.` };
    if (!websites.includes(url)) websites.push(url);
  }
  const people = new Map<string, PodcastPerson>();
  for (const person of input.people) {
    if (!isHexPubkey(person.pubkey)) return { ok: false, error: 'One of the people is not a valid public key.' };
    if (person.pubkey === showPubkey) return { ok: false, error: 'The show can’t list its own key as a host.' };
    people.set(person.pubkey, person);
  }

  const tags: string[][] = [['title', title]];
  if (image) tags.push(['image', safeHttpsUrl(image)!]);
  if (input.description.trim()) tags.push(['description', input.description.trim()]);
  for (const url of websites) tags.push(['website', url]);
  for (const person of people.values()) tags.push(person.role ? ['p', person.pubkey, person.role] : ['p', person.pubkey]);
  if (previous) tags.push(...previous.tags.filter(([name]) => !MANAGED_METADATA_TAGS.has(name)));
  tags.push(['alt', `Podcast: ${title}`]);
  return { ok: true, tags };
}

export interface EpisodeInput {
  title: string;
  description: string;
  image: string;
  sources: AudioSource[];
  contentWarning?: string;
}

export function buildEpisodeTags(input: EpisodeInput): BuildResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give the episode a title.' };
  if (title.length > 300) return { ok: false, error: 'Keep the title under 300 characters.' };
  const image = input.image.trim();
  if (image && !safeHttpsUrl(image)) return { ok: false, error: 'The episode artwork must be an https:// URL.' };
  const audio: string[][] = [];
  for (const source of input.sources) {
    const url = safeHttpsUrl(source.url);
    if (!url) return { ok: false, error: 'Audio must be an https:// URL.' };
    if (audio.some(([, existing]) => existing === url)) continue;
    const type = cleanMediaType(source.type);
    audio.push(type ? ['audio', url, type] : ['audio', url]);
  }
  if (audio.length === 0) return { ok: false, error: 'Add the episode’s audio: an https:// URL or an upload.' };

  const tags: string[][] = [['title', title]];
  if (image) tags.push(['image', safeHttpsUrl(image)!]);
  if (input.description.trim()) tags.push(['description', input.description.trim()]);
  tags.push(...audio);
  if (input.contentWarning !== undefined) {
    tags.push(input.contentWarning.trim() ? ['content-warning', input.contentWarning.trim()] : ['content-warning']);
  }
  tags.push(['alt', `Podcast episode: ${title}`]);
  return { ok: true, tags };
}

/** "1:02:03" / "4:05". */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
