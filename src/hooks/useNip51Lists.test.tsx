import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { NostrEvent, NostrRelayEVENT, NostrRelayEOSE } from '@nostrify/nostrify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyList, parseList } from '@/lib/nip51';
import { nip51ListKey, nip51OverviewKey, useNip51ListMutation } from './useNip51Lists';

const mocks = vi.hoisted(() => ({ req: vi.fn(), publish: vi.fn() }));
vi.mock('@nostrify/react', () => ({ useNostr: () => ({ nostr: { req: mocks.req } }) }));
vi.mock('./useCurrentUser', () => ({ useCurrentUser: () => ({ user: { pubkey: 'owner', signer: {} } }) }));
vi.mock('./useNostrPublish', () => ({ useNostrPublish: () => ({ mutateAsync: mocks.publish }) }));
const event: NostrEvent = { id: 'old', kind: 10000, pubkey: 'owner', created_at: 10, tags: [['p', 'first']], content: '', sig: '' };
function stream(events: NostrEvent[], complete = true) {
  return async function* (): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE> {
    for (const entry of events) yield ['EVENT', 'sub', entry];
    if (complete) yield ['EOSE', 'sub'];
  };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useNip51ListMutation(), { wrapper });
  return { client, ...hook };
}
const edit = { kind: 10000, ops: [{ type: 'add' as const, tag: ['p', 'a'.repeat(64)], private: false }] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.publish.mockImplementation(async (template) => ({ ...template, id: 'published' }));
});
describe('safe NIP-51 writes', () => {
  it('refuses empty relay results when the overview knows the list exists', async () => {
    mocks.req.mockImplementation(stream([]));
    const { client, result } = setup();
    client.setQueryData(nip51OverviewKey('owner', true), [parseList(event, { tags: [], status: 'none', legacyEncryption: false })]);
    await act(async () => { await expect(result.current.mutateAsync(edit)).rejects.toThrow('could not be loaded'); });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('preserves newer cached public and private items instead of stale relay data', async () => {
    mocks.req.mockImplementation(stream([event]));
    const { client, result } = setup();
    const cached = { ...parseList({ ...event, created_at: 4_000_000_000, content: 'ciphertext' }, { tags: [['p', 'private']], status: 'ok', legacyEncryption: false }), publicItems: [['p', 'first'], ['p', 'newer']] };
    client.setQueryData(nip51ListKey('owner', 10000, undefined, true), cached);
    await act(async () => { await result.current.mutateAsync(edit); });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ content: 'ciphertext', created_at: 4_000_000_001, tags: expect.arrayContaining([['p', 'first'], ['p', 'newer'], ['p', 'a'.repeat(64)]]) }));
    expect(client.getQueryData(nip51ListKey('owner', 10000, undefined, true))).toMatchObject({ privateItems: [['p', 'private']] });
  });
  it('never publishes partial events without EOSE', async () => {
    mocks.req.mockImplementation(stream([event], false));
    const { result } = setup();
    await act(async () => { await expect(result.current.mutateAsync(edit)).rejects.toThrow('complete list'); });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('recreates a deleted set when relays no longer return it', async () => {
    mocks.req.mockImplementation(stream([]));
    const { client, result } = setup();
    client.setQueryData(nip51ListKey('owner', 30000, 'friends', true), { ...emptyList(30000, 'owner', 'friends'), createdAt: 4_000_000_000 });
    await act(async () => { await result.current.mutateAsync({ kind: 30000, identifier: 'friends', ops: [], create: true }); });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 30000, created_at: 4_000_000_001 }));
  });
  it('allows a first list only after a complete empty read', async () => {
    mocks.req.mockImplementation(stream([]));
    const { client, result } = setup();
    client.setQueryData(nip51ListKey('owner', 10000, undefined, true), emptyList(10000, 'owner'));
    await act(async () => { await result.current.mutateAsync(edit); });
    expect(mocks.req).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eoseTimeout: 0 }));
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
});
