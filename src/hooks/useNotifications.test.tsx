import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';

import { TestApp } from '@/test/TestApp';
import { useLoginActions } from './useLoginActions';
import { useNotifications } from './useNotifications';

const alice = getPublicKey(generateSecretKey());
const carol = getPublicKey(generateSecretKey());

function contactListEvent(author: string, follows: string[], createdAt: number, id: string): NostrEvent {
  return {
    id,
    pubkey: author,
    created_at: createdAt,
    kind: 3,
    tags: follows.map((pubkey) => ['p', pubkey]),
    content: '',
    sig: '',
  };
}

beforeEach(() => {
  // NostrLoginProvider persists logins to localStorage; start each test logged out.
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Renders the notifications hook and logs in a fresh user while `nostr.query`
 * is mocked. The mock must be installed before login, because logging in
 * immediately triggers the notification query. `events` receives the new
 * user's pubkey so tests can build events that tag them.
 */
async function renderLoggedInNotifications(events: (pubkey: string) => NostrEvent[]) {
  const nsec = nip19.nsecEncode(generateSecretKey());
  const pubkey = getPublicKey(nip19.decode(nsec).data as Uint8Array);

  const { result } = renderHook(
    () => ({ actions: useLoginActions(), nostr: useNostr(), notifications: useNotifications() }),
    { wrapper: TestApp },
  );

  // NostrLoginProvider renders null while it reads logins from storage.
  await waitFor(() => expect(result.current).not.toBeNull());

  const query = vi.spyOn(result.current.nostr.nostr, 'query').mockImplementation(async () => events(pubkey));

  act(() => result.current.actions.nsec(nsec));
  await waitFor(() => expect(result.current.notifications.isSuccess).toBe(true));

  return { result, query, pubkey };
}

describe('useNotifications', () => {
  it('does not show a follow notification when a replacement contact list keeps the recipient', async () => {
    // The exact issue reproduction: the user's pubkey stays in Alice's list
    // across a replacement that only changes an unrelated contact.
    const { result, query } = await renderLoggedInNotifications((pubkey) => [
      contactListEvent(alice, [pubkey], 100, 'list-1'),
      contactListEvent(alice, [pubkey, carol], 200, 'list-2'),
    ]);

    const filters = query.mock.calls.flatMap(([f]) => f);
    expect(filters.length).toBeGreaterThan(0);
    for (const filter of filters) {
      expect(filter.kinds).not.toContain(3);
    }
    expect(result.current.notifications.data).toEqual([]);
  });

  it('keeps mention, reply, reaction, repost and zap notifications', async () => {
    const { result } = await renderLoggedInNotifications((pubkey) => [
      { id: 'mention', pubkey: alice, created_at: 300, kind: 1, tags: [['p', pubkey]], content: 'hi', sig: '' },
      { id: 'reply', pubkey: alice, created_at: 400, kind: 1, tags: [['e', 'root-id', '', 'root'], ['p', pubkey]], content: 're', sig: '' },
      { id: 'reaction', pubkey: carol, created_at: 500, kind: 7, tags: [['p', pubkey], ['e', 'note-id']], content: '+', sig: '' },
      { id: 'repost', pubkey: carol, created_at: 600, kind: 6, tags: [['p', pubkey], ['e', 'note-id']], content: '', sig: '' },
      { id: 'zap', pubkey: carol, created_at: 700, kind: 9735, tags: [['p', pubkey]], content: '', sig: '' },
    ]);

    const byId = new Map((result.current.notifications.data ?? []).map((n) => [n.event.id, n.kind]));
    expect(byId.get('mention')).toBe('mention');
    expect(byId.get('reply')).toBe('reply');
    expect(byId.get('reaction')).toBe('reaction');
    expect(byId.get('repost')).toBe('repost');
    expect(byId.get('zap')).toBe('zap');
  });
});
