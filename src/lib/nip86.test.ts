import { describe, expect, it } from 'vitest';
import { isHex64, normalizeRelayManagementUrl } from './nip86';

describe('normalizeRelayManagementUrl', () => {
  it('adds secure relay protocols to bare hosts', () => {
    expect(normalizeRelayManagementUrl('relay.example.com')).toEqual({
      websocket: 'wss://relay.example.com/',
      http: 'https://relay.example.com/',
    });
  });

  it('preserves paths while converting websocket URLs for HTTP management', () => {
    expect(normalizeRelayManagementUrl('ws://localhost:7777/nostr')).toEqual({
      websocket: 'ws://localhost:7777/nostr',
      http: 'http://localhost:7777/nostr',
    });
  });

  it('rejects unsupported protocols', () => {
    expect(() => normalizeRelayManagementUrl('ftp://relay.example.com')).toThrow();
  });
});

describe('isHex64', () => {
  it('accepts Nostr pubkeys and event ids in hex form', () => {
    expect(isHex64('a'.repeat(64))).toBe(true);
    expect(isHex64('npub1nothex')).toBe(false);
  });
});
