import { describe, expect, it } from 'vitest';
import { parseNwcUri } from './nwc';

const PUBKEY = 'a'.repeat(64);
const SECRET = 'b'.repeat(64);

describe('parseNwcUri', () => {
  it('parses a well-formed nostr+walletconnect:// link', () => {
    const uri = `nostr+walletconnect://${PUBKEY}?relay=wss%3A%2F%2Frelay.example.com&secret=${SECRET}`;
    const connection = parseNwcUri(uri);
    expect(connection).toEqual({
      pubkey: PUBKEY,
      relay: 'wss://relay.example.com',
      secret: SECRET,
    });
  });

  it('accepts the legacy nostrwalletconnect:// scheme', () => {
    const uri = `nostrwalletconnect://${PUBKEY}?relay=wss%3A%2F%2Frelay.example.com&secret=${SECRET}`;
    expect(() => parseNwcUri(uri)).not.toThrow();
  });

  it('rejects a non-Wallet-Connect URI', () => {
    expect(() => parseNwcUri('https://example.com')).toThrow();
  });

  it('rejects a missing secret', () => {
    const uri = `nostr+walletconnect://${PUBKEY}?relay=wss%3A%2F%2Frelay.example.com`;
    expect(() => parseNwcUri(uri)).toThrow();
  });

  it('rejects a non-hex pubkey', () => {
    const uri = `nostr+walletconnect://not-hex?relay=wss%3A%2F%2Frelay.example.com&secret=${SECRET}`;
    expect(() => parseNwcUri(uri)).toThrow();
  });

  it('rejects a relay that is not a websocket URL', () => {
    const uri = `nostr+walletconnect://${PUBKEY}?relay=https%3A%2F%2Frelay.example.com&secret=${SECRET}`;
    expect(() => parseNwcUri(uri)).toThrow();
  });

  it('lowercases hex fields', () => {
    const uri = `nostr+walletconnect://${PUBKEY.toUpperCase()}?relay=wss%3A%2F%2Frelay.example.com&secret=${SECRET.toUpperCase()}`;
    const connection = parseNwcUri(uri);
    expect(connection.pubkey).toBe(PUBKEY);
    expect(connection.secret).toBe(SECRET);
  });
});
