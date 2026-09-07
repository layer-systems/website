import { describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { NSecSigner } from '@nostrify/nostrify';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  classifyMethod,
  isBlockedIpList,
  isEventRefList,
  isKindList,
  isPubkeyList,
  Nip86Error,
  nip86Call,
  nip86Params,
  normalizeRelayHttpUrl,
  parseEventIdInput,
  parseKindInput,
  parsePubkeyInput,
  parseRoles,
  partitionMethods,
  relayWsUrl,
  sanitizeIconUrl,
  validateIpInput,
  validateReason,
  validateRoleColor,
  validateRoleId,
} from './nip86';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);

describe('normalizeRelayHttpUrl', () => {
  it('normalizes bare hosts and common schemes to https', () => {
    expect(normalizeRelayHttpUrl('relay.example.com')).toBe('https://relay.example.com/');
    expect(normalizeRelayHttpUrl('wss://relay.example.com')).toBe('https://relay.example.com/');
    expect(normalizeRelayHttpUrl('https://relay.example.com/')).toBe('https://relay.example.com/');
    expect(normalizeRelayHttpUrl('  relay.example.com  ')).toBe('https://relay.example.com/');
  });

  it('keeps ports and paths', () => {
    expect(normalizeRelayHttpUrl('wss://relay.example.com:8443/relay')).toBe(
      'https://relay.example.com:8443/relay',
    );
  });

  it('maps ws:// to http:// for local relays', () => {
    expect(normalizeRelayHttpUrl('ws://localhost:7777')).toBe('http://localhost:7777/');
    expect(normalizeRelayHttpUrl('http://localhost:7777')).toBe('http://localhost:7777/');
  });

  it('rejects garbage and non-web schemes', () => {
    expect(normalizeRelayHttpUrl('')).toBeUndefined();
    expect(normalizeRelayHttpUrl('   ')).toBeUndefined();
    expect(normalizeRelayHttpUrl('ftp://relay.example.com')).toBeUndefined();
    expect(normalizeRelayHttpUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('derives the websocket URL for NIP-98 u tags', () => {
    expect(relayWsUrl('https://relay.example.com/')).toBe('wss://relay.example.com/');
    expect(relayWsUrl('http://localhost:7777/')).toBe('ws://localhost:7777/');
  });
});

describe('capability model', () => {
  it('classifies core, passthrough and extension methods', () => {
    expect(classifyMethod('supportedmethods')).toBe('core');
    expect(classifyMethod('banpubkey')).toBe('core');
    expect(classifyMethod('changerelayicon')).toBe('core');
    expect(classifyMethod('stat')).toBe('passthrough');
    expect(classifyMethod('purgeallevents')).toBe('extension');
    expect(classifyMethod('listroles')).toBe('extension');
  });

  it('partitions advertised methods, keeping extensions separate', () => {
    const { core, extensions } = partitionMethods([
      'supportedmethods',
      'banpubkey',
      'stat',
      'purgeallevents',
    ]);
    expect(core).toContain('banpubkey');
    expect(core).toContain('stat');
    expect(extensions).toEqual(['purgeallevents']);
  });
});

describe('response validators', () => {
  it('accepts well-shaped lists', () => {
    expect(isPubkeyList([{ pubkey: HEX_A, reason: 'spam' }, { pubkey: HEX_B }])).toBe(true);
    expect(isEventRefList([{ id: HEX_A }])).toBe(true);
    expect(isBlockedIpList([{ ip: '203.0.113.7', reason: 'scanner' }])).toBe(true);
    expect(isKindList([0, 1, 30023])).toBe(true);
  });

  it('rejects malformed lists', () => {
    expect(isPubkeyList([{ pubkey: 3 }])).toBe(false);
    expect(isPubkeyList([{ pubkey: HEX_A, reason: 42 }])).toBe(false);
    expect(isEventRefList([{ id: HEX_A }, 'oops'])).toBe(false);
    expect(isBlockedIpList([{ ip: null }])).toBe(false);
    expect(isKindList([1, -1])).toBe(false);
    expect(isKindList([1, 70000])).toBe(false);
    expect(isKindList(['1'])).toBe(false);
    expect(isPubkeyList('not-an-array')).toBe(false);
  });

  it('parses roles from both string and object shapes', () => {
    expect(parseRoles(['admin', { id: 'mod', label: 'Moderator', order: 2 }])).toEqual([
      { id: 'admin' },
      { id: 'mod', label: 'Moderator', description: undefined, color: undefined, order: 2 },
    ]);
    expect(parseRoles([{ name: 'legacy' }])).toEqual([
      { id: 'legacy', label: undefined, description: undefined, color: undefined, order: undefined },
    ]);
    expect(parseRoles('nope')).toEqual([]);
    expect(parseRoles([{}, { id: '' }, 42])).toEqual([]);
  });
});

describe('input validation', () => {
  it('accepts hex pubkeys and decodes npub/nprofile', () => {
    expect(parsePubkeyInput(HEX_A.toUpperCase())).toBe(HEX_A);

    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    expect(parsePubkeyInput(nip19.npubEncode(pubkey))).toBe(pubkey);
    expect(parsePubkeyInput(nip19.nprofileEncode({ pubkey }))).toBe(pubkey);
  });

  it('rejects bad pubkeys', () => {
    expect(parsePubkeyInput('')).toHaveProperty('error');
    expect(parsePubkeyInput('1234')).toHaveProperty('error');
    expect(parsePubkeyInput('npub1broken')).toHaveProperty('error');
  });

  it('accepts hex event ids and decodes note/nevent', () => {
    expect(parseEventIdInput(HEX_B)).toBe(HEX_B);
    expect(parseEventIdInput(nip19.noteEncode(HEX_B))).toBe(HEX_B);
    expect(parseEventIdInput(nip19.neventEncode({ id: HEX_B }))).toBe(HEX_B);
    expect(parseEventIdInput('zzzz')).toHaveProperty('error');
  });

  it('validates IPs and CIDR ranges', () => {
    expect(validateIpInput('203.0.113.7')).toBeUndefined();
    expect(validateIpInput('203.0.113.0/24')).toBeUndefined();
    expect(validateIpInput('2001:db8::1')).toBeUndefined();
    expect(validateIpInput('2001:db8::/32')).toBeUndefined();

    expect(validateIpInput('')).toBeTruthy();
    expect(validateIpInput('999.1.2.3')).toBeTruthy();
    expect(validateIpInput('10.0.0.1/33')).toBeTruthy();
    expect(validateIpInput('2001:db8::1/129')).toBeTruthy();
    expect(validateIpInput('not an ip')).toBeTruthy();
  });

  it('validates kind numbers', () => {
    expect(parseKindInput('1')).toBe(1);
    expect(parseKindInput('30023')).toBe(30023);
    expect(parseKindInput('0')).toBe(0);
    expect(parseKindInput('')).toHaveProperty('error');
    expect(parseKindInput('-1')).toHaveProperty('error');
    expect(parseKindInput('65536')).toHaveProperty('error');
    expect(parseKindInput('abc')).toHaveProperty('error');
  });

  it('validates role ids and colors', () => {
    expect(validateRoleId('moderator')).toBeUndefined();
    expect(validateRoleId('')).toBeTruthy();
    expect(validateRoleId('two words')).toBeTruthy();
    expect(validateRoleId('x'.repeat(65))).toBeTruthy();

    expect(validateRoleColor('')).toBeUndefined();
    expect(validateRoleColor('#8b5cf6')).toBeUndefined();
    expect(validateRoleColor('#fff')).toBeUndefined();
    expect(validateRoleColor('red')).toBeTruthy();
  });

  it('sanitizes icon URLs', () => {
    expect(sanitizeIconUrl('https://example.com/icon.png')).toBe('https://example.com/icon.png');
    expect(sanitizeIconUrl('javascript:alert(1)')).toHaveProperty('error');
    expect(sanitizeIconUrl('data:image/png;base64,xx')).toHaveProperty('error');
    expect(sanitizeIconUrl('')).toHaveProperty('error');
    expect(sanitizeIconUrl('not a url')).toHaveProperty('error');
  });

  it('only allows http:// for local relays', () => {
    expect(sanitizeIconUrl('http://localhost:4869/icon.png')).toBe('http://localhost:4869/icon.png');
    expect(sanitizeIconUrl('http://127.0.0.1/icon.png')).toBe('http://127.0.0.1/icon.png');
    expect(sanitizeIconUrl('http://relay.example.com/icon.png')).toHaveProperty('error');
  });

  it('caps reason length', () => {
    expect(validateReason('spam')).toBeUndefined();
    expect(validateReason('x'.repeat(501))).toBeTruthy();
  });
});

describe('nip86Params', () => {
  it('builds list params as empty arrays', () => {
    expect(nip86Params('supportedmethods')).toEqual([]);
    expect(nip86Params('listbannedpubkeys')).toEqual([]);
    expect(nip86Params('listallowedkinds')).toEqual([]);
  });

  it('appends reasons only when present', () => {
    expect(nip86Params('banpubkey', { pubkey: HEX_A, reason: ' spam ' })).toEqual([HEX_A, 'spam']);
    expect(nip86Params('banpubkey', { pubkey: HEX_A, reason: '  ' })).toEqual([HEX_A]);
    expect(nip86Params('unbanpubkey', { pubkey: HEX_A })).toEqual([HEX_A]);
  });

  it('never adds a reason to unblockip (NIP-86 defines none)', () => {
    expect(nip86Params('unblockip', { ip: '203.0.113.7', reason: 'ignored' })).toEqual(['203.0.113.7']);
  });

  it('builds kind, role and presentation params', () => {
    expect(nip86Params('allowkind', { kind: 4 })).toEqual([4]);
    expect(nip86Params('createrole', { roleId: 'mod', role: { label: 'Mod', description: '', color: '#fff', order: 1 } })).toEqual([
      'mod',
      'Mod',
      '',
      '#fff',
      1,
    ]);
    expect(nip86Params('deleterole', { roleId: 'mod' })).toEqual(['mod']);
    expect(nip86Params('assignrole', { pubkey: HEX_A, roleId: 'mod' })).toEqual([HEX_A, 'mod']);
    expect(nip86Params('changerelayname', { text: 'My Relay' })).toEqual(['My Relay']);
  });
});

describe('nip86Call', () => {
  const url = 'https://relay.example.com/';
  const signer = new NSecSigner(generateSecretKey());

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('POSTs JSON-RPC with a NIP-98 authorization header carrying u and payload tags', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ result: ['supportedmethods'] }));
    const result = await nip86Call<string[]>(url, { signer, method: 'supportedmethods', fetchFn });

    expect(result).toEqual(['supportedmethods']);
    expect(fetchFn).toHaveBeenCalledOnce();

    const [requestUrl, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestUrl).toBe(url);
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/nostr+json+rpc');

    const auth = headers.get('Authorization') ?? '';
    expect(auth.startsWith('Nostr ')).toBe(true);

    const { N64 } = await import('@nostrify/nostrify/utils');
    const event: NostrEvent = N64.decodeEvent(auth.slice('Nostr '.length));
    expect(event.kind).toBe(27235);
    expect(event.tags.find(([name]) => name === 'u')?.[1]).toBe('wss://relay.example.com/');
    expect(event.tags.find(([name]) => name === 'method')?.[1]).toBe('POST');

    const body = init.body as string;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    const expectedPayload = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    expect(event.tags.find(([name]) => name === 'payload')?.[1]).toBe(expectedPayload);
    expect(JSON.parse(body)).toEqual({ method: 'supportedmethods', params: [] });
  });

  it('maps 401 and 403 to dedicated error codes', async () => {
    const unauthorized = vi.fn<typeof fetch>(async () => jsonResponse({}, 401));
    await expect(nip86Call(url, { signer, method: 'supportedmethods', fetchFn: unauthorized })).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
    });

    const forbidden = vi.fn<typeof fetch>(async () => jsonResponse({}, 403));
    await expect(nip86Call(url, { signer, method: 'banpubkey', params: [HEX_A], fetchFn: forbidden })).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
  });

  it('treats non-JSON success responses as malformed (relay likely has no management API)', async () => {
    const html = vi.fn<typeof fetch>(
      async () => new Response('<html>relay</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    await expect(nip86Call(url, { signer, method: 'supportedmethods', fetchFn: html })).rejects.toMatchObject({
      code: 'malformed',
    });
  });

  it('surfaces relay error envelopes as rpc-error', async () => {
    const failing = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'not a manager' }));
    await expect(nip86Call(url, { signer, method: 'banpubkey', params: [HEX_A], fetchFn: failing })).rejects.toMatchObject({
      code: 'rpc-error',
      message: expect.stringContaining('not a manager'),
    });
  });

  it('maps network failures to unreachable', async () => {
    const down = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(nip86Call(url, { signer, method: 'supportedmethods', fetchFn: down })).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  it('never puts secrets in error messages', async () => {
    const refusing = {
      getPublicKey: async () => HEX_A,
      signEvent: async () => {
        throw new Error('user rejected');
      },
    };
    try {
      await nip86Call(url, { signer: refusing, method: 'supportedmethods' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Nip86Error);
      expect((error as Nip86Error).code).toBe('signing-failed');
      expect((error as Nip86Error).message).not.toContain('Nostr ');
    }
  });
});
