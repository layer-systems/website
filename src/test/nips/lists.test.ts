import { describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { decryptPrivateItems, emptyList, encryptPrivateItems, listAddress, listEventTemplate, listNaddr, parseList } from '@/lib/nip51';
import { AUTHOR, OTHER_AUTHOR, ROOT_ID, event } from './fixtures';

describe('NIP-51 — public/private items and list identity', () => {
  it.each([10000, 10003, 30000, 30003])('51-IDENTITY: kind %i emits d only for addressable sets', (kind) => {
    const list = emptyList(kind, AUTHOR, 'friends');
    list.publicItems = kind === 10003 || kind === 30003 ? [['e', ROOT_ID]] : [['p', OTHER_AUTHOR]];
    expect(listEventTemplate(list, '')).toEqual({
      kind, content: '', tags: [...(kind >= 30000 ? [['d', 'friends']] : []), ...list.publicItems],
    });
  });

  it('51-PUBLIC: reads public items from tags and preserves unknown metadata on rewrite', () => {
    const incoming = event({ kind: 30003, tags: [
      ['d', 'reading'], ['title', 'Reading'], ['e', ROOT_ID, 'wss://relay.example.com'],
      ['a', `30023:${OTHER_AUTHOR}:article`], ['future-extension', 'keep me'],
    ] });
    const parsed = parseList(incoming, { tags: [], status: 'none', legacyEncryption: false });
    expect(parsed.publicItems).toEqual(incoming.tags.slice(2, 4));
    expect(listEventTemplate(parsed, '')).toEqual({ kind: 30003, content: '', tags: [
      ['d', 'reading'], ['title', 'Reading'], ['future-extension', 'keep me'],
      ['e', ROOT_ID, 'wss://relay.example.com'], ['a', `30023:${OTHER_AUTHOR}:article`],
    ] });
  });

  it('51-ENCRYPT: encrypts private tag-array JSON to the author through NIP-44', async () => {
    const encrypt = vi.fn(async () => 'test-ciphertext-write');
    const signer = { nip44: { encrypt, decrypt: vi.fn(async () => '') } };
    const privateTags = [['p', OTHER_AUTHOR], ['word', 'spoiler']];
    const content = await encryptPrivateItems(signer, AUTHOR, privateTags);
    expect(encrypt).toHaveBeenCalledExactlyOnceWith(AUTHOR, JSON.stringify(privateTags));
    const list = emptyList(10000, AUTHOR);
    list.privateItems = privateTags;
    expect(listEventTemplate(list, content)).toEqual({ kind: 10000, tags: [], content });
  });

  it('51-DECRYPT: reads independently supplied NIP-44 plaintext, including unknown tags', async () => {
    const decrypt = vi.fn(async () => JSON.stringify([['p', OTHER_AUTHOR], ['future', 'keep']]));
    const result = await decryptPrivateItems({ nip44: { decrypt, encrypt: vi.fn(async () => '') } }, AUTHOR, 'test-ciphertext-read');
    expect(decrypt).toHaveBeenCalledExactlyOnceWith(AUTHOR, 'test-ciphertext-read');
    expect(result).toEqual({ tags: [['p', OTHER_AUTHOR], ['future', 'keep']], status: 'ok', legacyEncryption: false });
  });

  it('51-LEGACY: selects NIP-04 for legacy ciphertext instead of NIP-44', async () => {
    const decrypt = vi.fn(async () => '[["word","legacy"]]');
    const modernDecrypt = vi.fn(async () => '[]');
    const result = await decryptPrivateItems({
      nip04: { decrypt, encrypt: vi.fn(async () => '') },
      nip44: { decrypt: modernDecrypt, encrypt: vi.fn(async () => '') },
    }, AUTHOR, 'test-ciphertext?iv=test');
    expect(result).toEqual({ tags: [['word', 'legacy']], status: 'ok', legacyEncryption: true });
    expect(decrypt).toHaveBeenCalledExactlyOnceWith(AUTHOR, 'test-ciphertext?iv=test');
    expect(modernDecrypt).not.toHaveBeenCalled();
  });

  it.each(['not JSON', '{}'])('51-INVALID: marks malformed decrypted data %j as locked (app policy)', async (plaintext) => {
    const result = await decryptPrivateItems({ nip44: {
      decrypt: async () => plaintext, encrypt: async () => '',
    } }, AUTHOR, `invalid-${plaintext}`);
    expect(result.status).toBe('locked');
    expect(result.tags).toEqual([]);
  });

  it('51-LOCKED: cannot treat unavailable decryption as an empty private section', async () => {
    expect(await decryptPrivateItems({}, AUTHOR, 'unavailable-ciphertext')).toEqual({
      tags: [], status: 'locked', legacyEncryption: false,
    });
    await expect(encryptPrivateItems({}, AUTHOR, [['p', OTHER_AUTHOR]])).rejects.toThrow('NIP-44');
    expect(await encryptPrivateItems({}, AUTHOR, [])).toBe('');
  });

  it('19-ADDRESS: shares kind, author, identifier and relay hints in an naddr', () => {
    const list = emptyList(30003, AUTHOR, 'reading:2026');
    expect(listAddress(list)).toBe(`30003:${AUTHOR}:reading:2026`);
    expect(nip19.decode(listNaddr(list, ['wss://relay.example.com']))).toEqual({
      type: 'naddr', data: { kind: 30003, pubkey: AUTHOR, identifier: 'reading:2026', relays: ['wss://relay.example.com'] },
    });
  });
});
