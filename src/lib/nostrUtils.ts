import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

/** Protocols we are willing to put into an href or a src. */
const SAFE_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'nostr:']);

/**
 * Returns the URL only if it uses a protocol that cannot execute script.
 * Everything reaching this function came from a relay, so `javascript:` and
 * `data:` URLs must never survive it.
 */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/** A short, stable stand-in when someone has published no display name. */
export function genUserName(pubkey: string): string {
  return `npub…${pubkey.slice(-6)}`;
}

export function displayName(pubkey: string, metadata?: NostrMetadata): string {
  const name = metadata?.display_name?.trim() || metadata?.name?.trim();
  return name || genUserName(pubkey);
}

export function npubOf(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

const UNITS: [limit: number, divisor: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, 1, 'second'],
  [3600, 60, 'minute'],
  [86400, 3600, 'hour'],
  [604800, 86400, 'day'],
  [2629800, 604800, 'week'],
  [31557600, 2629800, 'month'],
];

/** "3 min ago" style timestamps, localized by the browser. */
export function relativeTime(unixSeconds: number): string {
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const diff = unixSeconds - Math.floor(Date.now() / 1000);
  const magnitude = Math.abs(diff);

  for (const [limit, divisor, unit] of UNITS) {
    if (magnitude < limit) {
      return formatter.format(Math.round(diff / divisor), unit);
    }
  }
  return formatter.format(Math.round(diff / 31557600), 'year');
}

export function absoluteTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

/**
 * Relay hints travel inside `nprofile`/`nevent`/`naddr` identifiers and are the
 * only reason many deep links resolve at all: the event often lives on a relay
 * the reader does not subscribe to. They are carried through window params as a
 * comma-separated list.
 */
export function encodeRelayHints(relays: string[] | undefined): string | undefined {
  const safe = (relays ?? []).filter((url) => url.startsWith('wss://') || url.startsWith('ws://'));
  return safe.length > 0 ? safe.join(',') : undefined;
}

export function decodeRelayHints(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const relays = value.split(',').filter((url) => url.startsWith('wss://') || url.startsWith('ws://'));
  return relays.length > 0 ? relays : undefined;
}

/** First value of a tag, e.g. `tagValue(event, 'title')`. */
export function tagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([tagName]) => tagName === name)?.[1];
}

/** All values of a repeated tag. */
export function tagValues(event: NostrEvent, name: string): string[] {
  return event.tags.filter(([tagName]) => tagName === name).map(([, value]) => value).filter(Boolean);
}

/**
 * The event a reply points at, following NIP-10: prefer an explicit `root`
 * marker, fall back to the first positional `e` tag (the deprecated scheme
 * puts the root id first: `["e", <root-id>], ["e", <reply-id>]`).
 */
export function rootReference(event: NostrEvent): string | undefined {
  const marked = event.tags.find(([name, , , marker]) => name === 'e' && marker === 'root');
  if (marked) return marked[1];
  const positional = event.tags.filter(([name]) => name === 'e');
  return positional[0]?.[1];
}

/**
 * True for a reply per NIP-10: a marked `root`/`reply` `e` tag, or an
 * unmarked one (the deprecated positional scheme). An `e` tag marked
 * `mention` alone does not make an event a reply — it cites another event
 * without being part of its thread.
 */
export function isReply(event: NostrEvent): boolean {
  return event.tags.some(([name, , , marker]) => name === 'e' && marker !== 'mention');
}
