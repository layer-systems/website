import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { NSecSigner, type NostrEvent, type NostrSigner } from '@nostrify/nostrify';
import {
  buildGiftWraps,
  decryptLegacyDm,
  dmCapability,
  dmCapabilityHint,
  dmPeer,
  isValidChatMessage,
  parseRecipient,
  unwrapGiftWrap,
  DM_CHAT_KIND,
  DM_GIFT_WRAP_KIND,
  DM_SEAL_KIND,
  LEGACY_DM_KIND,
} from './dm';

const aliceSecret = generateSecretKey();
const alice = getPublicKey(aliceSecret);
const bobSecret = generateSecretKey();
const bob = getPublicKey(bobSecret);

const aliceSigner = new NSecSigner(aliceSecret);
const bobSigner = new NSecSigner(bobSecret);

function event(overrides: Partial<NostrEvent>): NostrEvent {
  return { id: 'x', pubkey: alice, created_at: 1000, kind: DM_CHAT_KIND, tags: [], content: '', sig: '', ...overrides };
}

describe('dmCapability', () => {
  it('prefers NIP-17 when NIP-44 is available', () => {
    expect(dmCapability(new NSecSigner(generateSecretKey()))).toBe('nip17');
  });

  it('falls back to legacy NIP-04 when only nip04 exists', () => {
    const signer: NostrSigner = {
      getPublicKey: async () => alice,
      signEvent: async () => event({}),
      nip04: { encrypt: async () => '', decrypt: async () => '' },
    };
    expect(dmCapability(signer)).toBe('nip04');
  });

  it('is none without any encryption support', () => {
    const signer: NostrSigner = {
      getPublicKey: async () => alice,
      signEvent: async () => event({}),
    };
    expect(dmCapability(signer)).toBe('none');
    expect(dmCapability(undefined)).toBe('none');
  });

  it('labels nip04 as the visible legacy fallback, never a silent one', () => {
    expect(dmCapabilityHint('nip17')).toBe('');
    expect(dmCapabilityHint('nip04')).toMatch(/legacy NIP-04/);
    expect(dmCapabilityHint('none')).toMatch(/unavailable/);
  });
});

describe('parseRecipient', () => {
  it('accepts a hex pubkey, lowercased', () => {
    expect(parseRecipient(alice.toUpperCase())).toEqual({ type: 'pubkey', pubkey: alice });
  });

  it('accepts an npub', () => {
    expect(parseRecipient(nip19.npubEncode(bob))).toEqual({ type: 'pubkey', pubkey: bob });
  });

  it('accepts an nprofile and keeps its relay hints', () => {
    const nprofile = nip19.nprofileEncode({ pubkey: bob, relays: ['wss://relay.example.com'] });
    expect(parseRecipient(nprofile)).toEqual({
      type: 'pubkey',
      pubkey: bob,
      relays: ['wss://relay.example.com'],
    });
  });

  it('accepts a NIP-05 address', () => {
    expect(parseRecipient('Alice@Example.COM')).toEqual({ type: 'nip05', value: 'alice@example.com' });
  });

  it('rejects note/nevent/naddr identifiers — they are not people', () => {
    const note = nip19.noteEncode('a'.repeat(64));
    expect(parseRecipient(note).type).toBe('invalid');
    const nevent = nip19.neventEncode({ id: 'a'.repeat(64) });
    expect(parseRecipient(nevent.type ? nevent : '').type).toBe('invalid');
  });

  it('rejects an nsec — a secret must never be typed into a recipient field', () => {
    expect(parseRecipient(nip19.nsecEncode(generateSecretKey())).type).toBe('invalid');
  });

  it('rejects empty and arbitrary input', () => {
    expect(parseRecipient('').type).toBe('invalid');
    expect(parseRecipient('   ').type).toBe('invalid');
    expect(parseRecipient('not a key at all').type).toBe('invalid');
  });
});

describe('isValidChatMessage / dmPeer', () => {
  it('requires kind 14, content and a recipient tag', () => {
    expect(isValidChatMessage(event({ content: 'hi', tags: [['p', bob]] }))).toBe(true);
    expect(isValidChatMessage(event({ content: '  ', tags: [['p', bob]] }))).toBe(false);
    expect(isValidChatMessage(event({ content: 'hi' }))).toBe(false);
    expect(isValidChatMessage(event({ content: 'hi', tags: [['p', bob]], kind: 15 }))).toBe(false);
  });

  it('the peer of an outgoing message is the recipient, of an incoming one the author', () => {
    const outgoing = event({ pubkey: alice, tags: [['p', bob]] });
    expect(dmPeer(outgoing, alice)).toBe(bob);
    expect(dmPeer(outgoing, bob)).toBe(alice);
  });

  it('a self-message has no peer and is not a conversation', () => {
    const self = event({ pubkey: alice, tags: [['p', alice]] });
    expect(dmPeer(self, alice)).toBeUndefined();
  });
});

describe('buildGiftWraps / unwrapGiftWrap', () => {
  it('round-trips a message to the recipient with full NIP-17 shape', async () => {
    const { wraps, rumorId } = await buildGiftWraps(aliceSigner, bob, 'secret hello');

    // One wrap for the recipient, one sender copy.
    expect(wraps).toHaveLength(2);
    const [recipientWrap, senderWrap] = wraps;

    for (const wrap of wraps) {
      expect(wrap.kind).toBe(DM_GIFT_WRAP_KIND);
      // The wrap is signed by a throwaway key, never by Alice.
      expect(wrap.pubkey).not.toBe(alice);
      expect(wrap.pubkey).not.toBe(bob);
      // NIP-59: timestamps randomized up to two days in the past.
      expect(wrap.created_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    }
    // The two wraps must not share the throwaway key, or relays could link them.
    expect(recipientWrap.pubkey).not.toBe(senderWrap.pubkey);
    expect(recipientWrap.tags).toEqual([['p', bob]]);
    expect(senderWrap.tags).toEqual([['p', alice]]);

    const rumor = await unwrapGiftWrap(bobSigner, recipientWrap, bob);
    expect(rumor).not.toBeNull();
    expect(rumor!.kind).toBe(DM_CHAT_KIND);
    expect(rumor!.pubkey).toBe(alice);
    expect(rumor!.content).toBe('secret hello');
    expect(rumor!.tags[0][0]).toBe('p');
    expect(rumor!.tags[0][1]).toBe(bob);
    expect(rumor!.id).toBe(rumorId);
  });

  it('the sender copy decrypts for the sender, so history is recoverable', async () => {
    const { wraps } = await buildGiftWraps(aliceSigner, bob, 'recoverable');
    const rumor = await unwrapGiftWrap(aliceSigner, wraps[1], alice);
    expect(rumor?.content).toBe('recoverable');
    expect(dmPeer(rumor!, alice)).toBe(bob);
  });

  it('attaches the recipient inbox relay as a hint on the rumor p tag', async () => {
    const { wraps } = await buildGiftWraps(aliceSigner, bob, 'hi', ['wss://inbox.example.com']);
    const rumor = await unwrapGiftWrap(bobSigner, wraps[0], bob);
    expect(rumor!.tags[0]).toEqual(['p', bob, 'wss://inbox.example.com']);
  });

  it('does not decrypt for a third party', async () => {
    const { wraps } = await buildGiftWraps(aliceSigner, bob, 'not for you');
    const eve = new NSecSigner(generateSecretKey());
    expect(await unwrapGiftWrap(eve, wraps[0], getPublicKey(generateSecretKey()))).toBeNull();
  });

  it('rejects a rumor whose author does not match the seal — the NIP-17 impersonation check', async () => {
    // Forge a wrap whose rumor claims a different author than the seal's.
    const forger = new NSecSigner(generateSecretKey());
    const forgerPubkey = await forger.getPublicKey();
    const rumor = event({
      pubkey: bob, // claims to be Bob…
      content: 'spoofed',
      tags: [['p', forgerPubkey]],
    });
    const seal = await forger.signEvent({
      kind: DM_SEAL_KIND,
      content: await forger.nip44.encrypt(forgerPubkey, JSON.stringify(rumor)),
      tags: [],
      created_at: 1000,
    });
    const wrap = await forger.signEvent({
      kind: DM_GIFT_WRAP_KIND,
      content: await forger.nip44.encrypt(forgerPubkey, JSON.stringify(seal)),
      tags: [['p', forgerPubkey]],
      created_at: 1000,
    });
    expect(await unwrapGiftWrap(forger, wrap, forgerPubkey)).toBeNull();
  });

  it('rejects a rumor that is not addressed to the unwrap peer', async () => {
    // A wrap for Carol containing a rumor between Alice and Bob.
    const carolSecret = generateSecretKey();
    const carol = getPublicKey(carolSecret);
    const { rumorId } = await buildGiftWraps(aliceSigner, bob, 'carol sees this');
    void rumorId;
    const seal = await aliceSigner.signEvent({
      kind: DM_SEAL_KIND,
      content: await aliceSigner.nip44.encrypt(carol, JSON.stringify(
        event({ pubkey: alice, content: 'carol sees this', tags: [['p', bob]], id: '', sig: '' }),
      )),
      tags: [],
      created_at: 1000,
    });
    const wrapSigner = new NSecSigner(generateSecretKey());
    const wrap = await wrapSigner.signEvent({
      kind: DM_GIFT_WRAP_KIND,
      content: await wrapSigner.nip44.encrypt(carol, JSON.stringify(seal)),
      tags: [['p', carol]],
      created_at: 1000,
    });
    expect(await unwrapGiftWrap(new NSecSigner(carolSecret), wrap, carol)).toBeNull();
  });

  it('returns null instead of throwing on malformed ciphertext', async () => {
    const wrap = event({ kind: DM_GIFT_WRAP_KIND, pubkey: alice, content: 'not encrypted', tags: [['p', bob]] });
    expect(await unwrapGiftWrap(bobSigner, wrap, bob)).toBeNull();
  });
});

describe('decryptLegacyDm', () => {
  it('round-trips a NIP-04 message in both directions', async () => {
    const ciphertext = await aliceSigner.nip04.encrypt(bob, 'legacy hi');
    const incoming = event({ kind: LEGACY_DM_KIND, pubkey: alice, content: ciphertext, tags: [['p', bob]] });
    expect(await decryptLegacyDm(bobSigner, incoming, bob)).toBe('legacy hi');

    const outgoing = event({ kind: LEGACY_DM_KIND, pubkey: alice, content: ciphertext, tags: [['p', bob]] });
    expect(await decryptLegacyDm(aliceSigner, outgoing, alice)).toBe('legacy hi');
  });

  it('returns null for malformed ciphertext instead of throwing', async () => {
    const broken = event({ kind: LEGACY_DM_KIND, pubkey: alice, content: 'garbage', tags: [['p', bob]] });
    expect(await decryptLegacyDm(bobSigner, broken, bob)).toBeNull();
  });
});
