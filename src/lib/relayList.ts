import type { RelayMetadata } from '@/contexts/AppContext';

/** One entry of a NIP-65 relay list. */
export type RelayEntry = RelayMetadata['relays'][number];

export type RelayMode = Partial<Pick<RelayEntry, 'read' | 'write'>>;

export type RelayUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Turns whatever the user typed into the canonical form the pool keys relays
 * by (`wss://host/path/`, lower-case host, trailing slash on a bare host).
 * A missing scheme is assumed to be `wss://`; anything else is rejected so a
 * typo can never downgrade the connection to plain `ws://` or `https://`.
 */
export function normalizeRelayUrl(input: string): RelayUrlResult {
  const value = input.trim();
  if (!value) return { ok: false, error: 'Enter a relay address.' };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `wss://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: 'That is not a valid relay address.' };
  }

  if (parsed.protocol !== 'wss:') {
    return { ok: false, error: 'Relay addresses must start with wss://.' };
  }
  if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
    return { ok: false, error: 'That address has no valid host name.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Relay addresses cannot contain credentials.' };
  }

  parsed.hash = '';
  return { ok: true, url: parsed.href };
}

/** Why `url` cannot be removed, or `null` when it can. */
export function removeBlocker(relays: RelayEntry[], url: string): string | null {
  const relay = relays.find((r) => r.url === url);
  if (!relay) return null;
  const rest = relays.filter((r) => r.url !== url);
  if (relay.read && !rest.some((r) => r.read)) return 'This is your only read relay.';
  if (relay.write && !rest.some((r) => r.write)) return 'This is your only write relay.';
  return null;
}

/**
 * Why `mode` cannot be applied to `url`, or `null` when it can. A relay must
 * keep at least one marker (NIP-65 has no way to express "neither"), and the
 * list as a whole must keep at least one read and one write relay.
 */
export function modeBlocker(relays: RelayEntry[], url: string, mode: RelayMode): string | null {
  const next = relays.map((r) => (r.url === url ? { ...r, ...mode } : r));
  const relay = next.find((r) => r.url === url);
  if (!relay) return null;
  if (!relay.read && !relay.write) return 'Remove the relay instead of turning off both read and write.';
  if (!next.some((r) => r.read)) return 'Keep at least one read relay.';
  if (!next.some((r) => r.write)) return 'Keep at least one write relay.';
  return null;
}

/** NIP-65 `r` tags: no marker means both read and write. */
export function relayListTags(relays: RelayEntry[]): string[][] {
  return relays
    .filter((r) => r.read || r.write)
    .map((r) => (r.read && r.write ? ['r', r.url] : ['r', r.url, r.read ? 'read' : 'write']));
}

/** A relay's NIP-11 info document lives at the same address over HTTPS. */
export function relayInfoUrl(url: string): string {
  return url.replace(/^wss:\/\//, 'https://');
}

/** Short label for tables and lists: no scheme, no trailing slash. */
export function relayLabel(url: string): string {
  return url.replace(/^wss?:\/\//, '').replace(/\/$/, '');
}
