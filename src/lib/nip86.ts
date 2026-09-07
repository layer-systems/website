import { N64 } from '@nostrify/nostrify/utils';
import type { NostrSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/**
 * NIP-86 "Relay Management API" client plumbing.
 *
 * NIP-86 is a *draft, optional* JSON-RPC-like protocol over plain HTTP(S),
 * served on the same URI as the relay's WebSocket endpoint — it is not a
 * WebSocket command protocol. Every request is a POST with the content type
 * `application/nostr+json+rpc`, authorized with a NIP-98 event (kind 27235)
 * whose `u` tag is the relay URL and which — unlike base NIP-98 — MUST carry
 * a `payload` tag binding it to the request body.
 *
 * Implementations vary widely because the NIP is still a draft, so nothing
 * here assumes more than `supportedmethods`: every other method is only ever
 * called after the relay advertised it.
 */

/** Every method name defined by the current NIP-86 draft. */
export const NIP86_CORE_METHODS = [
  'supportedmethods',
  'banpubkey',
  'unbanpubkey',
  'listbannedpubkeys',
  'allowpubkey',
  'unallowpubkey',
  'listallowedpubkeys',
  'listeventsneedingmoderation',
  'allowevent',
  'banevent',
  'listbannedevents',
  'listallowedkinds',
  'allowkind',
  'disallowkind',
  'blockip',
  'unblockip',
  'listblockedips',
  'createrole',
  'editrole',
  'deleterole',
  'assignrole',
  'unassignrole',
  'changerelayname',
  'changerelaydescription',
  'changerelayicon',
] as const;

export type Nip86CoreMethod = (typeof NIP86_CORE_METHODS)[number];

const CORE_METHOD_SET = new Set<string>(NIP86_CORE_METHODS);

/**
 * `stat` predates NIP-86 in several relay implementations and returns relay
 * metadata rather than policy data, so it is *not* treated as a relay-specific
 * management extension — it is a recognized non-management method and gets no
 * console UI.
 */
const PASSTHROUGH_METHODS = new Set(['stat']);

/** What an advertised method name means to this client. */
export type Nip86MethodClass = 'core' | 'passthrough' | 'extension';

export function classifyMethod(name: string): Nip86MethodClass {
  if (CORE_METHOD_SET.has(name)) return 'core';
  if (PASSTHROUGH_METHODS.has(name)) return 'passthrough';
  return 'extension';
}

/**
 * Split an advertised method list into standard NIP-86 methods and
 * relay-specific extensions. Unknown names are extensions and must be shown
 * separately — never blended into the standard surface.
 */
export function partitionMethods(methods: string[]): { core: string[]; extensions: string[] } {
  const core: string[] = [];
  const extensions: string[] = [];
  for (const name of methods) {
    if (classifyMethod(name) === 'extension') extensions.push(name);
    else core.push(name);
  }
  return { core, extensions };
}

/* --------------------------------------------------------------------------
 * Request and error plumbing
 * ------------------------------------------------------------------------ */

export const NIP86_CONTENT_TYPE = 'application/nostr+json+rpc';

/** How long a single management request may take before it is aborted. */
export const NIP86_TIMEOUT_MS = 10_000;

export type Nip86ErrorCode =
  | 'invalid-url'
  | 'unreachable'
  | 'http-error'
  | 'unauthorized'
  | 'forbidden'
  | 'malformed'
  | 'rpc-error'
  | 'signing-failed'
  | 'not-logged-in'
  | 'unsupported';

/**
 * An operator-facing error. `message` is safe to show in the UI and to copy
 * into the audit log: it never contains the request body, the authorization
 * header, or any key material.
 */
export class Nip86Error extends Error {
  readonly code: Nip86ErrorCode;
  /** HTTP status when the failure came from an HTTP response. */
  readonly status?: number;

  constructor(code: Nip86ErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'Nip86Error';
    this.code = code;
    this.status = status;
  }
}

export function isNip86Error(error: unknown): error is Nip86Error {
  return error instanceof Nip86Error;
}

/**
 * Normalize operator input into the HTTP(S) endpoint NIP-86 speaks on.
 *
 * Accepts `relay.example.com`, `wss://` and `https://` forms; everything is
 * canonicalized to `https://` (plain `ws://`/`http://` is kept only for local
 * development relays). Returns `undefined` when the input cannot name a host.
 */
export function normalizeRelayHttpUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return undefined;
  }

  switch (parsed.protocol) {
    case 'wss:':
      parsed.protocol = 'https:';
      break;
    case 'ws:':
      parsed.protocol = 'http:';
      break;
    case 'https:':
    case 'http:':
      break;
    default:
      return undefined;
  }

  if (!parsed.hostname) return undefined;
  return parsed.href;
}

/** The WebSocket form of a normalized management endpoint, for NIP-98 `u` tags and NIP-11 fetches. */
export function relayWsUrl(httpUrl: string): string {
  const parsed = new URL(httpUrl);
  parsed.protocol = parsed.protocol === 'http:' ? 'ws:' : 'wss:';
  return parsed.href;
}

/**
 * Sign a NIP-98 authorization header for one management request.
 *
 * The `u` tag must be the relay URL exactly as the relay knows it — the
 * WebSocket form — and the `payload` tag the SHA-256 of the request body, as
 * NIP-86 requires. The signed event never leaves this function except as a
 * base64 token in the returned header value.
 */
export async function signNip86AuthHeader(
  signer: NostrSigner,
  httpUrl: string,
  body: string,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const payload = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  const event = await signer.signEvent({
    kind: 27235,
    content: '',
    tags: [
      ['u', relayWsUrl(httpUrl)],
      ['method', 'POST'],
      ['payload', payload],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  return `Nostr ${N64.encodeEvent(event)}`;
}

export interface Nip86CallOptions {
  signer: NostrSigner;
  method: string;
  params?: unknown[];
  signal?: AbortSignal;
  /** Injecting fetch keeps the client testable and the signing path honest. */
  fetchFn?: typeof fetch;
}

/**
 * Perform one NIP-86 management call. The response envelope is validated
 * (`result` on success, `error` string on failure); anything else — including
 * the HTML error pages many relays return for unknown content types — is a
 * `malformed` error rather than a JSON exception.
 */
export async function nip86Call<T = unknown>(httpUrl: string, options: Nip86CallOptions): Promise<T> {
  const { signer, method, params = [], signal, fetchFn = fetch } = options;

  const body = JSON.stringify({ method, params });

  let authorization: string;
  try {
    authorization = await signNip86AuthHeader(signer, httpUrl, body);
  } catch (error) {
    throw new Nip86Error(
      'signing-failed',
      `Your signer refused to authorize the request: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let response: Response;
  try {
    response = await fetchFn(httpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': NIP86_CONTENT_TYPE,
        Authorization: authorization,
      },
      body,
      signal: signal ?? AbortSignal.timeout(NIP86_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Nip86Error(
      'unreachable',
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'The relay did not answer in time.'
        : 'The relay could not be reached. Check the URL and your connection.',
    );
  }

  if (response.status === 401) {
    throw new Nip86Error(
      'unauthorized',
      'The relay rejected the NIP-98 authorization (401). The signed-in key may not be a manager of this relay.',
      401,
    );
  }
  if (response.status === 403) {
    throw new Nip86Error(
      'forbidden',
      'The relay authorized the request but forbids this operation for your key (403).',
      403,
    );
  }
  if (!response.ok) {
    throw new Nip86Error('http-error', `The relay answered with HTTP ${response.status}.`, response.status);
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new Nip86Error(
      'malformed',
      'The relay did not return a NIP-86 response. It may not speak the management API (or answered with a web page).',
      response.status,
    );
  }

  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    throw new Nip86Error('malformed', 'The relay returned an unexpected response shape.', response.status);
  }

  const { result, error } = envelope as { result?: unknown; error?: unknown };
  if (error !== undefined && error !== null) {
    const detail = typeof error === 'string' ? error : 'unknown relay error';
    throw new Nip86Error('rpc-error', `The relay refused the operation: ${detail}`, response.status);
  }

  return result as T;
}

/* --------------------------------------------------------------------------
 * NIP-11 relay information document (identity shown after connecting)
 * ------------------------------------------------------------------------ */

export interface RelayInfo {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  software?: string;
  version?: string;
  icon?: string;
}

/**
 * Fetch the relay's NIP-11 information document. Returns `undefined` when the
 * relay does not publish one — that says nothing about NIP-86 support, so it
 * is never an error here.
 */
export async function fetchRelayInfo(
  httpUrl: string,
  opts?: { signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<RelayInfo | undefined> {
  try {
    const response = await (opts?.fetchFn ?? fetch)(httpUrl, {
      headers: { Accept: 'application/nostr+json' },
      signal: opts?.signal ?? AbortSignal.timeout(NIP86_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const doc: unknown = await response.json();
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return undefined;
    const record = doc as Record<string, unknown>;
    const pick = (key: keyof RelayInfo) =>
      typeof record[key] === 'string' ? (record[key] as string) : undefined;
    return {
      name: pick('name'),
      description: pick('description'),
      pubkey: pick('pubkey'),
      contact: pick('contact'),
      software: pick('software'),
      version: pick('version'),
      icon: pick('icon'),
    };
  } catch {
    return undefined;
  }
}

/* --------------------------------------------------------------------------
 * Response shapes (validated — relays are untrusted input)
 * ------------------------------------------------------------------------ */

export interface ReasonedEntry {
  reason?: string;
}

export interface BannedPubkey extends ReasonedEntry {
  pubkey: string;
}

export interface AllowedPubkey extends ReasonedEntry {
  pubkey: string;
}

export interface ModeratedEventRef extends ReasonedEntry {
  id: string;
}

export interface BannedEvent extends ReasonedEntry {
  id: string;
}

export interface BlockedIp extends ReasonedEntry {
  ip: string;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isReasonedEntry(value: unknown): value is ReasonedEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reason = (value as ReasonedEntry).reason;
  return reason === undefined || typeof reason === 'string';
}

export function isPubkeyList(value: unknown): value is BannedPubkey[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => isReasonedEntry(item) && typeof (item as BannedPubkey).pubkey === 'string',
    )
  );
}

export function isEventRefList(value: unknown): value is ModeratedEventRef[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isReasonedEntry(item) && typeof (item as ModeratedEventRef).id === 'string')
  );
}

export function isBlockedIpList(value: unknown): value is BlockedIp[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isReasonedEntry(item) && typeof (item as BlockedIp).ip === 'string')
  );
}

export function isKindList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 65535)
  );
}

/** A role as returned by role-listing extensions (`listroles` is not standard NIP-86). */
export interface Nip86Role {
  id: string;
  label?: string;
  description?: string;
  color?: string;
  order?: number;
}

/** Tolerant parser for the various shapes relays give `listroles` results. */
export function parseRoles(value: unknown): Nip86Role[] {
  if (!Array.isArray(value)) return [];

  const roles: Nip86Role[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item) {
      roles.push({ id: item });
      continue;
    }
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = record.id ?? record.name;
    if (typeof id !== 'string' || !id) continue;
    roles.push({
      id,
      label: typeof record.label === 'string' ? record.label : undefined,
      description: typeof record.description === 'string' ? record.description : undefined,
      color: typeof record.color === 'string' ? record.color : undefined,
      order: typeof record.order === 'number' ? record.order : undefined,
    });
  }
  return roles;
}

/* --------------------------------------------------------------------------
 * Input validation. Every validator returns an operator-safe message or
 * undefined; nothing is signed or sent before its input passes.
 * ------------------------------------------------------------------------ */

const HEX_64_RE = /^[0-9a-f]{64}$/i;

/**
 * Accept a 32-byte hex pubkey, or decode an `npub1…`/`nprofile1…` into one.
 * Returns the canonical (lowercase) hex string or an error message.
 */
export function parsePubkeyInput(input: string): string | { error: string } {
  const value = input.trim();
  if (!value) return { error: 'Enter a public key.' };
  if (HEX_64_RE.test(value)) return value.toLowerCase();

  if (/^npub1|^nprofile1/i.test(value)) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === 'npub') return decoded.data;
      if (decoded.type === 'nprofile') return decoded.data.pubkey;
    } catch {
      // fall through to the error below
    }
    return { error: 'That NIP-19 identifier could not be decoded.' };
  }

  return { error: 'A public key is 64 hex characters, or an npub1… / nprofile1… identifier.' };
}

/** Validate a 32-byte hex event id (or `note1…`/`nevent1…`). */
export function parseEventIdInput(input: string): string | { error: string } {
  const value = input.trim();
  if (!value) return { error: 'Enter an event ID.' };
  if (HEX_64_RE.test(value)) return value.toLowerCase();

  if (/^note1|^nevent1/i.test(value)) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === 'note') return decoded.data;
      if (decoded.type === 'nevent') return decoded.data.id;
    } catch {
      // fall through
    }
    return { error: 'That NIP-19 identifier could not be decoded.' };
  }

  return { error: 'An event ID is 64 hex characters, or a note1… / nevent1… identifier.' };
}

const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE = /^[0-9a-f:]*:[0-9a-f:.]*$/i;

/**
 * Validate an IP address or CIDR range. Exactly what a relay accepts varies
 * by implementation, so this only rules out values that cannot be an address.
 */
export function validateIpInput(input: string): string | undefined {
  const value = input.trim();
  if (!value) return 'Enter an IP address or CIDR range.';

  const [address, prefix, ...rest] = value.split('/');
  if (rest.length > 0) return 'Use a single “/” for a CIDR range, e.g. 203.0.113.0/24.';

  const isV4 = IPV4_RE.test(address);
  const isV6 = !isV4 && address.includes(':') && IPV6_RE.test(address);
  if (!isV4 && !isV6) return 'That is not a valid IPv4 or IPv6 address.';

  if (prefix !== undefined) {
    if (!/^\d+$/.test(prefix)) return 'The CIDR prefix must be a number.';
    const size = Number(prefix);
    const max = isV4 ? 32 : 128;
    if (size < 0 || size > max) return `The CIDR prefix must be between 0 and ${max}.`;
  }

  return undefined;
}

/** Validate a Nostr kind number (0–65535 per NIP-01). */
export function parseKindInput(input: string): number | { error: string } {
  const value = input.trim();
  if (!/^\d+$/.test(value)) return { error: 'A kind is a whole number, e.g. 1 or 30023.' };
  const kind = Number(value);
  if (kind < 0 || kind > 65535) return { error: 'Kinds range from 0 to 65535.' };
  return kind;
}

/** Role ids go into RPC params verbatim; keep them slug-shaped and short. */
export function validateRoleId(input: string): string | undefined {
  const value = input.trim();
  if (!value) return 'Enter a role ID.';
  if (value.length > 64) return 'Role IDs must be 64 characters or fewer.';
  if (!/^[\w-]+$/.test(value)) return 'Use letters, numbers, dashes and underscores only.';
  return undefined;
}

/** Hex color for role presentation, `#rgb`/`#rrggbb`, or empty. */
export function validateRoleColor(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
    ? undefined
    : 'Use a hex color like #8b5cf6, or leave it empty.';
}

/** Loopback/`.local` hostnames — the only ones http:// is trusted for below. */
function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
}

/**
 * Validate and sanitize a relay icon URL before it is shown or submitted.
 * Only https (and http for local relays) URLs survive — anything else could
 * smuggle script into the page when rendered as an image.
 */
export function sanitizeIconUrl(input: string): string | { error: string } {
  const value = input.trim();
  if (!value) return { error: 'Enter an icon URL.' };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalHostname(parsed.hostname))) {
      return { error: 'Only https:// icon URLs are allowed (http:// only for local relays).' };
    }
    return parsed.href;
  } catch {
    return { error: 'That is not a valid URL.' };
  }
}

/** A management payload is never longer than a sentence; cap reasons defensively. */
export function validateReason(input: string): string | undefined {
  return input.length <= 500 ? undefined : 'Keep the reason under 500 characters.';
}

/* --------------------------------------------------------------------------
 * Parameter builders — the single place that knows each method's signature.
 * Reasons are only ever appended when the operator typed one.
 * ------------------------------------------------------------------------ */

export function withReason(value: string, reason: string): unknown[] {
  const trimmed = reason.trim();
  return trimmed ? [value, trimmed] : [value];
}

export function nip86Params(
  method: Nip86CoreMethod,
  input: {
    pubkey?: string;
    eventId?: string;
    ip?: string;
    kind?: number;
    reason?: string;
    roleId?: string;
    role?: { label: string; description: string; color: string; order: number };
    text?: string;
  } = {},
): unknown[] {
  const reason = input.reason?.trim() ?? '';

  switch (method) {
    case 'supportedmethods':
    case 'listbannedpubkeys':
    case 'listallowedpubkeys':
    case 'listeventsneedingmoderation':
    case 'listbannedevents':
    case 'listallowedkinds':
    case 'listblockedips':
      return [];
    case 'banpubkey':
    case 'unbanpubkey':
    case 'allowpubkey':
    case 'unallowpubkey':
      return withReason(input.pubkey ?? '', reason);
    case 'allowevent':
    case 'banevent':
      return withReason(input.eventId ?? '', reason);
    case 'blockip':
      return withReason(input.ip ?? '', reason);
    case 'unblockip':
      return [input.ip ?? ''];
    case 'allowkind':
    case 'disallowkind':
      return [input.kind ?? 0];
    case 'createrole':
    case 'editrole': {
      const role = input.role ?? { label: '', description: '', color: '', order: 0 };
      return [input.roleId ?? '', role.label, role.description, role.color, role.order];
    }
    case 'deleterole':
      return [input.roleId ?? ''];
    case 'assignrole':
    case 'unassignrole':
      return [input.pubkey ?? '', input.roleId ?? ''];
    case 'changerelayname':
    case 'changerelaydescription':
    case 'changerelayicon':
      return [input.text ?? ''];
  }
}
