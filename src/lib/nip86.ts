import type { NUser } from '@nostrify/react/login';

export const NIP86_METHODS = [
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
  'changerelayname',
  'changerelaydescription',
  'changerelayicon',
  'allowkind',
  'disallowkind',
  'listallowedkinds',
  'blockip',
  'unblockip',
  'listblockedips',
] as const;

export type Nip86Method = (typeof NIP86_METHODS)[number];

interface Nip86Response<T> {
  result?: T;
  error?: string;
}

export interface RelayManagementUrls {
  websocket: string;
  http: string;
}

export function normalizeRelayManagementUrl(value: string): RelayManagementUrls {
  const input = value.trim();
  if (!input) throw new Error('Enter a relay URL.');

  const withProtocol = /^[a-z]+:\/\//i.test(input) ? input : `wss://${input}`;
  const url = new URL(withProtocol);

  if (!['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol)) {
    throw new Error('Relay URLs must use ws, wss, http, or https.');
  }

  url.hash = '';
  const websocket = new URL(url);
  websocket.protocol = url.protocol === 'http:' ? 'ws:' : url.protocol === 'https:' ? 'wss:' : url.protocol;

  const http = new URL(url);
  http.protocol = url.protocol === 'ws:' ? 'http:' : url.protocol === 'wss:' ? 'https:' : url.protocol;

  return { websocket: websocket.toString(), http: http.toString() };
}

export function isHex64(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value.trim());
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function callNip86<T>(
  user: NUser,
  relayUrl: string,
  method: Nip86Method,
  params: unknown[] = [],
): Promise<T> {
  const { http } = normalizeRelayManagementUrl(relayUrl);
  const body = JSON.stringify({ method, params });
  const payload = await sha256Hex(body);
  const event = await user.signer.signEvent({
    kind: 27235,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', http],
      ['method', 'POST'],
      ['payload', payload],
    ],
  });

  let response: Response;
  try {
    response = await fetch(http, {
      method: 'POST',
      headers: {
        Accept: 'application/nostr+json+rpc, application/json',
        Authorization: `Nostr ${btoa(JSON.stringify(event))}`,
        'Content-Type': 'application/nostr+json+rpc',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('The relay management endpoint timed out.');
    }
    throw new Error('Could not reach the management endpoint. The relay may not support NIP-86 or browser CORS requests.');
  }

  if (response.status === 401) throw new Error('The relay rejected the NIP-98 authorization.');
  if (!response.ok) throw new Error(`Relay returned HTTP ${response.status} ${response.statusText}.`);

  let data: Nip86Response<T>;
  try {
    data = await response.json() as Nip86Response<T>;
  } catch {
    throw new Error('The relay returned an invalid NIP-86 response.');
  }

  if (data.error) throw new Error(data.error);
  if (!Object.prototype.hasOwnProperty.call(data, 'result')) {
    throw new Error('The relay response did not include a result.');
  }

  return data.result as T;
}
