import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { NSecSigner, type NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';

import { TestApp } from '@/test/TestApp';
import { buildGiftWraps, DM_GIFT_WRAP_KIND, LEGACY_DM_KIND, type DmMessage } from '@/lib/dm';
import { useLoginActions } from './useLoginActions';
import { groupIntoConversations, useDmConversations } from './useDirectMessages';

const aliceSecret = generateSecretKey();
const alice = getPublicKey(aliceSecret);
const aliceSigner = new NSecSigner(aliceSecret);
const bobSecret = generateSecretKey();
const bob = getPublicKey(bobSecret);

beforeEach(() => {
  // NostrLoginProvider persists logins to localStorage; start each test logged out.
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Renders the conversations hook and logs in a fresh user while `nostr.query`
 * is mocked. The mock must be installed before login, because logging in
 * immediately triggers other queries (authors, notifications).
 */
async function renderLoggedInDms(events: (pubkey: string) => NostrEvent[]) {
  const nsec = nip19.nsecEncode(generateSecretKey());
  const pubkey = getPublicKey(nip19.decode(nsec).data as Uint8Array);

  const { result } = renderHook(
    () => ({ actions: useLoginActions(), nostr: useNostr(), dms: useDmConversations() }),
    { wrapper: TestApp },
  );

  // NostrLoginProvider renders null while it reads logins from storage.
  await waitFor(() => expect(result.current).not.toBeNull());

  const query = vi
    .spyOn(result.current.nostr.nostr, 'query')
    .mockImplementation(async () => events(pubkey));

  act(() => result.current.actions.nsec(nsec));
  await waitFor(() => expect(result.current.dms.isSuccess).toBe(true));

  return { result, query, pubkey };
}

function dmEvent(overrides: Partial<NostrEvent>): NostrEvent {
  return { id: 'x', pubkey: alice, created_at: 1000, kind: DM_GIFT_WRAP_KIND, tags: [], content: '', sig: '', ...overrides };
}

function message(overrides: Partial<DmMessage>): DmMessage {
  return {
    id: 'm1',
    pubkey: alice,
    created_at: 1000,
    content: 'hi',
    peer: bob,
    protocol: 'nip17',
    mine: false,
    eventId: 'w1',
    ...overrides,
  };
}

describe('useDmConversations', () => {
  it('queries gift wraps addressed to the user plus both legacy directions', async () => {
    const { query } = await renderLoggedInDms(() => []);

    const filters = query.mock.calls.flatMap(([f]) => f).filter(
      (filter) => filter.kinds?.some((kind) => [DM_GIFT_WRAP_KIND, LEGACY_DM_KIND].includes(kind)),
    );
    expect(filters).toHaveLength(3);
    expect(filters).toContainEqual(
      expect.objectContaining({ kinds: [DM_GIFT_WRAP_KIND], '#p': [expect.any(String)] }),
    );
    expect(filters).toContainEqual(
      expect.objectContaining({ kinds: [LEGACY_DM_KIND], authors: [expect.any(String)] }),
    );
    expect(filters).toContainEqual(
      expect.objectContaining({ kinds: [LEGACY_DM_KIND], '#p': [expect.any(String)] }),
    );
  });

  it('drops gift wraps that do not decrypt instead of showing ghost conversations', async () => {
    const { result } = await renderLoggedInDms((pubkey) => [
      dmEvent({ id: 'bad', pubkey: bob, content: 'not a real ciphertext', tags: [['p', pubkey]] }),
    ]);

    expect(result.current.dms.data).toEqual([]);
  });

  it('decrypts an end-to-end NIP-17 message and collapses duplicate deliveries', async () => {
    // Log in as a user whose key we control: wrap a message from Alice to
    // that key, then log in with the same key.
    const userSecret = generateSecretKey();
    const userPubkey = getPublicKey(userSecret);
    const { wraps } = await buildGiftWraps(aliceSigner, userPubkey, 'hi there');

    const { result } = renderHook(
      () => ({ actions: useLoginActions(), nostr: useNostr(), dms: useDmConversations() }),
      { wrapper: TestApp },
    );
    await waitFor(() => expect(result.current).not.toBeNull());

    // Only the wrap addressed to the user is "on the relay", delivered twice
    // (partial/duplicate relay availability is normal).
    const events = [wraps[0], wraps[0]];
    vi.spyOn(result.current.nostr.nostr, 'query').mockImplementation(async () => events);

    act(() => result.current.actions.nsec(nip19.nsecEncode(userSecret)));
    await waitFor(() => expect(result.current.dms.isSuccess).toBe(true));

    const conversations = result.current.dms.data ?? [];
    expect(conversations).toHaveLength(1);
    expect(conversations[0].peer).toBe(alice);
    expect(conversations[0].messages).toHaveLength(1);
    expect(conversations[0].messages[0].content).toBe('hi there');
    expect(conversations[0].messages[0].protocol).toBe('nip17');
    expect(conversations[0].messages[0].mine).toBe(false);
  });
});

describe('groupIntoConversations', () => {
  it('groups by peer and orders newest first', () => {
    const conversations = groupIntoConversations([
      message({ id: '1', peer: alice, created_at: 100 }),
      message({ id: '2', peer: bob, created_at: 300 }),
      message({ id: '3', peer: alice, created_at: 200 }),
    ]);

    expect(conversations.map((c) => c.peer)).toEqual([bob, alice]);
    expect(conversations[1].messages.map((m) => m.id)).toEqual(['3', '1']);
    expect(conversations[0].lastAt).toBe(300);
  });
});
