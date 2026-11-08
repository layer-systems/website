import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';

import { TestApp } from '@/test/TestApp';
import { keypair, makeZapReceipt } from '@/test/zapFixtures';
import { useLoginActions } from './useLoginActions';
import { useNotificationParents, useNotifications } from './useNotifications';

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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Renders the notifications hook and logs in a fresh user while `nostr.query`
 * is mocked. The mock must be installed before login, because logging in
 * immediately triggers the notification query. `events` receives the new
 * user's pubkey so tests can build events that tag them.
 */
async function renderLoggedInNotifications(
  events: (pubkey: string) => NostrEvent[],
  parentEvents: NostrEvent[] = [],
  opts: { lud16?: string; lnurlBody?: Record<string, unknown> } = {},
) {
  const secretKey = generateSecretKey();
  const nsec = nip19.nsecEncode(secretKey);
  const pubkey = getPublicKey(secretKey);
  const profile = opts.lud16
    ? [finalizeEvent({ kind: 0, created_at: 1, content: JSON.stringify({ lud16: opts.lud16 }), tags: [] }, secretKey) as NostrEvent]
    : [];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(opts.lnurlBody ?? {}))));

  const { result } = renderHook(
    () => {
      const notifications = useNotifications();
      return {
        actions: useLoginActions(),
        nostr: useNostr(),
        notifications,
        parents: useNotificationParents(notifications.data ?? []),
      };
    },
    { wrapper: TestApp },
  );

  // NostrLoginProvider renders null while it reads logins from storage.
  await waitFor(() => expect(result.current).not.toBeNull());

  // `ids` filters are the batched parent lookup, kind 0 is the user's own
  // profile (for their zap LNURL); everything else is the feed.
  const query = vi.spyOn(result.current.nostr.nostr, 'query').mockImplementation(async (filters) => {
    if (filters.some((filter) => filter.ids)) return parentEvents;
    if (filters.some((filter) => filter.kinds?.includes(0))) return profile;
    return events(pubkey);
  });

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
    const zapper = keypair();
    const sender = keypair();
    let zapId = '';
    const { result } = await renderLoggedInNotifications((pubkey) => {
      const zap = makeZapReceipt({ zapper: zapper.secretKey, recipient: pubkey, sender: sender.secretKey, createdAt: 700 }).receipt;
      zapId = zap.id;
      return [
      { id: 'mention', pubkey: alice, created_at: 300, kind: 1, tags: [['p', pubkey]], content: 'hi', sig: '' },
      { id: 'reply', pubkey: alice, created_at: 400, kind: 1, tags: [['e', 'root-id', '', 'root'], ['p', pubkey]], content: 're', sig: '' },
      { id: 'reaction', pubkey: carol, created_at: 500, kind: 7, tags: [['p', pubkey], ['e', 'note-id']], content: '+', sig: '' },
      { id: 'repost', pubkey: carol, created_at: 600, kind: 6, tags: [['p', pubkey], ['e', 'note-id']], content: '', sig: '' },
        zap,
      ];
    }, [], { lud16: 'me@wallet.example.com', lnurlBody: { allowsNostr: true, nostrPubkey: zapper.pubkey } });

    const byId = new Map((result.current.notifications.data ?? []).map((n) => [n.event.id, n.kind]));
    const zap = result.current.notifications.data?.find((n) => n.kind === 'zap');
    expect(byId.get('mention')).toBe('mention');
    expect(byId.get('reply')).toBe('reply');
    expect(byId.get('reaction')).toBe('reaction');
    expect(byId.get('repost')).toBe('repost');
    expect(byId.get(zapId)).toBe('zap');
    expect(zap?.actor).toBe(sender.pubkey);
    expect(zap?.zap?.amountSats).toBe(21);
  });

  it('drops forged zap receipts and credits real ones to the zap request sender (issue #121)', async () => {
    const zapper = keypair();
    const sender = keypair();
    const attacker = keypair();
    let realId = '';
    const { result } = await renderLoggedInNotifications((pubkey) => {
      const real = makeZapReceipt({ zapper: zapper.secretKey, recipient: pubkey, sender: sender.secretKey, comment: 'thanks!' }).receipt;
      realId = real.id;
      return [
        real,
        // Signed by an arbitrary key with a self-signed request — the reported forgery.
        makeZapReceipt({ zapper: attacker.secretKey, recipient: pubkey, sender: attacker.secretKey, amountMsats: 100_000_000 }).receipt,
        // The old fixture shape: a bare 9735 with no description or invoice.
        { id: 'bare-zap', pubkey: carol, created_at: 700, kind: 9735, tags: [['p', pubkey]], content: '', sig: '' },
      ];
    }, [], { lud16: 'me@wallet.example.com', lnurlBody: { allowsNostr: true, nostrPubkey: zapper.pubkey } });

    const notifications = result.current.notifications.data ?? [];
    expect(notifications.map((n) => n.event.id)).toEqual([realId]);
    expect(notifications[0].actor).toBe(sender.pubkey);
    expect(notifications[0].actor).not.toBe(zapper.pubkey);
    expect(notifications[0].zap).toEqual({ amountSats: 21, comment: 'thanks!' });
  });

  it('drops all zap notifications when the user has no zap-capable lightning address', async () => {
    const zapper = keypair();
    const { result } = await renderLoggedInNotifications((pubkey) => [
      makeZapReceipt({ zapper: zapper.secretKey, recipient: pubkey }).receipt,
      { id: 'mention', pubkey: alice, created_at: 300, kind: 1, tags: [['p', pubkey]], content: 'hi', sig: '' },
    ]);

    expect((result.current.notifications.data ?? []).map((n) => n.kind)).toEqual(['mention']);
  });

  it('fetches reply parents in a single batched ids query', async () => {
    const parentA: NostrEvent = { id: 'parent-a', pubkey: alice, created_at: 100, kind: 1, tags: [], content: 'parent a', sig: '' };
    const unrelated: NostrEvent = { id: 'unrelated', pubkey: alice, created_at: 100, kind: 1, tags: [], content: 'nope', sig: '' };

    const { result, query } = await renderLoggedInNotifications((pubkey) => [
      { id: 'reply-a', pubkey: alice, created_at: 400, kind: 1, tags: [['e', 'root-id', '', 'root'], ['e', 'parent-a', '', 'reply'], ['p', pubkey]], content: 'a', sig: '' },
      { id: 'reply-b', pubkey: carol, created_at: 500, kind: 1, tags: [['e', 'parent-b', '', 'root'], ['p', pubkey]], content: 'b', sig: '' },
      { id: 'reply-c', pubkey: carol, created_at: 600, kind: 1, tags: [['e', 'parent-a', '', 'root'], ['p', pubkey]], content: 'c', sig: '' },
      { id: 'mention', pubkey: alice, created_at: 700, kind: 1, tags: [['p', pubkey]], content: 'hi', sig: '' },
    ], [parentA, unrelated]);

    await waitFor(() => expect(result.current.parents.isSuccess).toBe(true));

    const parentQueries = query.mock.calls.filter(([filters]) => filters.some((filter) => filter.ids));
    expect(parentQueries).toHaveLength(1);
    const [filters] = parentQueries[0];
    expect(filters).toHaveLength(1);
    expect(filters[0].ids).toEqual(['parent-a', 'parent-b']);

    const found = result.current.parents.data;
    expect(found?.get('parent-a')).toEqual(parentA);
    expect(found?.has('parent-b')).toBe(false);
    expect(found?.has('unrelated')).toBe(false);
  });

  it('skips the parent query when there are no replies', async () => {
    const { result, query } = await renderLoggedInNotifications((pubkey) => [
      { id: 'mention', pubkey: alice, created_at: 300, kind: 1, tags: [['p', pubkey]], content: 'hi', sig: '' },
    ]);

    expect(result.current.parents.fetchStatus).toBe('idle');
    expect(query.mock.calls.some(([filters]) => filters.some((filter) => filter.ids))).toBe(false);
  });
});
