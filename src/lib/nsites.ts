import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Nostr-hosted web apps: NIP-5A nsites (static sites whose files live on
 * Blossom, listed by a signed manifest) and napps, the nostrapps launcher's
 * kind for nsites that also declare launcher capabilities.
 *
 * Everything here works on manifests that came from relays, so every value is
 * validated before it reaches a URL.
 */

/** NIP-5A root site: one per pubkey, replaceable, no `d` tag. */
export const NSITE_ROOT_KIND = 15128;
/** NIP-5A named site: addressable by `d` tag. */
export const NSITE_NAMED_KIND = 35128;
/** nostrapps napp: an nsite with launcher capabilities (eskema/nostrapps). */
export const NAPP_KIND = 35130;

export const NSITE_KINDS = [NSITE_ROOT_KIND, NSITE_NAMED_KIND, NAPP_KIND] as const;

export function isNsiteKind(kind: number): boolean {
  return (NSITE_KINDS as readonly number[]).includes(kind);
}

/** The public NIP-5A gateway sites are served from unless the user picks another. */
export const DEFAULT_NSITE_GATEWAY = 'nsite.lol';

/** Where napps are handed off to, since they need the launcher's bridge to run. */
export const NOSTRAPPS_LAUNCHER = 'https://nostrapps.com/';

const HEX64 = /^[0-9a-f]{64}$/;
/** NIP-5A: canonical named-site identifiers fit in one DNS label next to the pubkey. */
const CANONICAL_D_TAG = /^[a-z0-9-]{1,13}$/;
/** Same as `nostr-tools`' NIP-19 limit on what we will embed in an `naddr`. */
const MAX_IDENTIFIER_LENGTH = 256;
/** Card text is short; the rest of a runaway tag is never shown. */
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 280;

/** Paths, in order of preference, that an nsite's icon is looked for at. */
const ICON_PATHS = ['/favicon.svg', '/icon.svg', '/apple-touch-icon.png', '/icon.png', '/favicon.png', '/favicon.ico'];

export interface Nsite {
  event: NostrEvent;
  kind: number;
  pubkey: string;
  /** The `d` tag; empty for a root site. */
  identifier: string;
  title?: string;
  description?: string;
  /** Absolute path → sha256, from the manifest's `path` tags. */
  paths: Map<string, string>;
  /** `https:` Blossom servers the manifest suggests. */
  servers: string[];
  /** Repository or archive the site was built from, when it is a plain `https:` URL. */
  source?: string;
  /** Napp only: action patterns it handles (`profile`, `view:0`, …). */
  actions: string[];
  /** Napp only: launcher capability domains it asks for (`ui`, …). */
  requires: string[];
  /** Napp only: icon path from the manifest's `icon` tag. */
  iconPath?: string;
}

function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([tag]) => tag === name)?.[1];
}

function allTags(event: NostrEvent, name: string): string[] {
  return event.tags
    .filter(([tag, value]) => tag === name && typeof value === 'string' && value.length > 0)
    .map(([, value]) => value);
}

function clip(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * An `https:` URL with no credentials in it. Manifests have been seen carrying
 * CI tokens inside `source` URLs; we neither link nor display those.
 */
export function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') && !path.includes('..') && !path.includes('\\');
}

/**
 * Parses an nsite or napp manifest. Returns null for anything that is not a
 * usable manifest: the wrong kind, no file mapping, or an identifier that
 * contradicts the kind (NIP-5A: root sites carry no `d` tag, named sites must).
 */
export function parseNsite(event: NostrEvent): Nsite | null {
  if (!isNsiteKind(event.kind) || !HEX64.test(event.pubkey)) return null;

  const identifier = firstTag(event, 'd') ?? '';
  if (event.kind === NSITE_ROOT_KIND) {
    if (event.tags.some(([tag]) => tag === 'd')) return null;
  } else if (!identifier || identifier.length > MAX_IDENTIFIER_LENGTH) {
    return null;
  }

  const paths = new Map<string, string>();
  for (const [tag, path, hash] of event.tags) {
    if (tag !== 'path' || typeof path !== 'string' || typeof hash !== 'string') continue;
    const normalized = hash.toLowerCase();
    if (isAbsolutePath(path) && HEX64.test(normalized) && !paths.has(path)) paths.set(path, normalized);
  }
  if (paths.size === 0) return null;

  const servers = [
    ...new Set(
      allTags(event, 'server')
        .map((server) => safeHttpsUrl(server))
        .filter((server): server is string => Boolean(server))
        .map((server) => server.replace(/\/+$/, '')),
    ),
  ];

  const isNapp = event.kind === NAPP_KIND;
  const iconTag = isNapp ? firstTag(event, 'icon') : undefined;

  return {
    event,
    kind: event.kind,
    pubkey: event.pubkey,
    identifier,
    title: clip(firstTag(event, 'title'), MAX_TITLE),
    description: clip(firstTag(event, 'description'), MAX_DESCRIPTION),
    paths,
    servers,
    source: safeHttpsUrl(firstTag(event, 'source')),
    actions: isNapp ? allTags(event, 'action').slice(0, 32) : [],
    requires: isNapp ? allTags(event, 'requires').slice(0, 32) : [],
    iconPath: iconTag && isAbsolutePath(iconTag) ? iconTag : undefined,
  };
}

/** `kind:pubkey:d` — one entry per site, however many versions relays return. */
export function nsiteAddress(site: Pick<Nsite, 'kind' | 'pubkey' | 'identifier'>): string {
  return `${site.kind}:${site.pubkey}:${site.identifier}`;
}

/** Keeps the newest manifest per address (NIP-01: ties go to the lowest id). */
export function latestNsites(sites: Nsite[]): Nsite[] {
  const byAddress = new Map<string, Nsite>();
  for (const site of sites) {
    const key = nsiteAddress(site);
    const current = byAddress.get(key);
    if (
      !current ||
      site.event.created_at > current.event.created_at ||
      (site.event.created_at === current.event.created_at && site.event.id < current.event.id)
    ) {
      byAddress.set(key, site);
    }
  }
  return [...byAddress.values()].sort((a, b) => b.event.created_at - a.event.created_at);
}

/** NIP-5A `pubkeyB36`: the raw 32-byte key in lowercase base36, always 50 characters. */
export function pubkeyToBase36(pubkey: string): string {
  if (!HEX64.test(pubkey)) throw new Error('Not a hex pubkey');
  return BigInt(`0x${pubkey}`).toString(36).padStart(50, '0');
}

/** Inverse of {@link pubkeyToBase36}. */
export function base36ToPubkey(label: string): string {
  if (!/^[0-9a-z]{50}$/.test(label)) throw new Error('Not a base36 pubkey');
  let value = 0n;
  for (const char of label) value = value * 36n + BigInt(parseInt(char, 36));
  const hex = value.toString(16);
  if (hex.length > 64) throw new Error('base36 pubkey overflows 32 bytes');
  return hex.padStart(64, '0');
}

/**
 * The single DNS label a NIP-5A host serves this site under, or undefined when
 * the site has none: napps are not nsites to a gateway, and a named site whose
 * identifier is not canonical cannot be put into a hostname.
 */
export function nsiteHostLabel(site: Pick<Nsite, 'kind' | 'pubkey' | 'identifier'>): string | undefined {
  if (site.kind === NSITE_ROOT_KIND) return nip19.npubEncode(site.pubkey);
  if (site.kind !== NSITE_NAMED_KIND) return undefined;
  if (!CANONICAL_D_TAG.test(site.identifier) || site.identifier.endsWith('-')) return undefined;
  return `${pubkeyToBase36(site.pubkey)}${site.identifier}`;
}

/** A bare hostname: lowercase labels, at least one dot, no scheme, port or path. */
export function isValidGatewayHost(host: string): boolean {
  return (
    host.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
  );
}

/** Lowercases and strips a pasted scheme, path or trailing dot. */
export function normalizeGatewayHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/\.$/, '');
}

/**
 * A gateway on our own host (or under it) would serve arbitrary sites from our
 * site's neighbourhood. It cannot read this origin's storage either way, but
 * there is no reason to allow it.
 */
export function isGatewayAllowed(host: string, ownHost: string): boolean {
  if (!isValidGatewayHost(host)) return false;
  const own = ownHost.toLowerCase();
  return host !== own && !host.endsWith(`.${own}`) && !own.endsWith(`.${host}`);
}

/** Where a gateway serves the site, or undefined when it cannot be served from one. */
export function nsiteGatewayUrl(
  site: Pick<Nsite, 'kind' | 'pubkey' | 'identifier'>,
  gateway: string,
): string | undefined {
  if (!isValidGatewayHost(gateway)) return undefined;
  const label = nsiteHostLabel(site);
  return label ? `https://${label}.${gateway}/` : undefined;
}

/** Whether a gateway can serve this site: it needs a hostname label and an index page. */
export function isGatewayRunnable(site: Nsite): boolean {
  return Boolean(nsiteHostLabel(site)) && site.paths.has('/index.html');
}

export function nsiteNaddr(site: Pick<Nsite, 'kind' | 'pubkey' | 'identifier'>, relays?: string[]): string {
  return nip19.naddrEncode({
    kind: site.kind,
    pubkey: site.pubkey,
    identifier: site.identifier,
    relays: relays?.slice(0, 2),
  });
}

/** Opens a napp in the nostrapps launcher, which provides the bridge it needs. */
export function nostrappsLaunchUrl(site: Pick<Nsite, 'kind' | 'pubkey' | 'identifier'>): string {
  return `${NOSTRAPPS_LAUNCHER}#app=${nsiteNaddr(site)}`;
}

/**
 * A content-addressed Blossom URL for the site's icon, from the manifest's own
 * servers. No gateway is involved, so a directory of a hundred sites does not
 * make a gateway resolve a hundred manifests.
 */
export function nsiteIconUrl(site: Nsite): string | undefined {
  const server = site.servers[0];
  if (!server) return undefined;
  const candidates = site.iconPath ? [site.iconPath, ...ICON_PATHS] : ICON_PATHS;
  for (const path of candidates) {
    const hash = site.paths.get(path);
    if (hash) return `${server}/${hash}`;
  }
  return undefined;
}

/** Card title: the manifest's, else the identifier, else nothing (the caller uses the author). */
export function nsiteTitle(site: Nsite): string | undefined {
  return site.title ?? (site.identifier || undefined);
}

export type NsitePointer = { kind: number; pubkey: string; identifier: string; relays?: string[] };

/**
 * What a user may paste to open a site: an `naddr` for any of the three kinds,
 * an `npub` (its root site), or a NIP-5A hostname or URL from any gateway.
 */
export function parseNsiteInput(input: string): NsitePointer | undefined {
  const value = input.trim().replace(/^nostr:/i, '');
  if (!value) return undefined;

  if (/^(naddr1|npub1)/i.test(value)) {
    try {
      const decoded = nip19.decode(value.toLowerCase());
      if (decoded.type === 'npub') {
        return { kind: NSITE_ROOT_KIND, pubkey: decoded.data, identifier: '' };
      }
      if (decoded.type === 'naddr' && isNsiteKind(decoded.data.kind)) {
        const { kind, pubkey, identifier, relays } = decoded.data;
        if (kind === NSITE_ROOT_KIND ? identifier !== '' : identifier === '') return undefined;
        return { kind, pubkey, identifier, relays };
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  const host = normalizeGatewayHost(value);
  const label = host.split('.')[0];
  if (!label || !host.includes('.')) return undefined;

  if (label.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(label);
      return decoded.type === 'npub' ? { kind: NSITE_ROOT_KIND, pubkey: decoded.data, identifier: '' } : undefined;
    } catch {
      return undefined;
    }
  }

  const named = /^([0-9a-z]{50})([a-z0-9-]{1,13})$/.exec(label);
  if (named && !named[2].endsWith('-')) {
    try {
      return { kind: NSITE_NAMED_KIND, pubkey: base36ToPubkey(named[1]), identifier: named[2] };
    } catch {
      return undefined;
    }
  }
  return undefined;
}
