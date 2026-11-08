import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { NostrEvent, NostrRelayEVENT, NostrRelayEOSE } from '@nostrify/nostrify';
import { beforeEach, expect, it, vi } from 'vitest';
import { useBlockPubkey } from './useMuteList';
const mocks = vi.hoisted(() => ({ req: vi.fn(), publish: vi.fn(), mute: vi.fn() }));
vi.mock('@nostrify/react', () => ({ useNostr: () => ({ nostr: { req: mocks.req } }) }));
vi.mock('./useCurrentUser', () => ({ useCurrentUser: () => ({ user: { pubkey: 'owner', signer: {} } }) }));
vi.mock('./useNostrPublish', () => ({ useNostrPublish: () => ({ mutateAsync: mocks.publish }) }));
vi.mock('./useNip51Lists', () => ({ useNip51ListMutation: () => ({ mutateAsync: mocks.mute }) }));
const old: NostrEvent = { id: 'old', kind: 3, pubkey: 'owner', created_at: 10, tags: [['p', 'blocked']], content: 'metadata', sig: '' };
function setup(events: NostrEvent[]) {
  mocks.req.mockImplementation(async function* (): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE> {
    for (const event of events) yield ['EVENT', 'sub', event];
    yield ['EOSE', 'sub'];
  });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useBlockPubkey(), { wrapper }) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.publish.mockImplementation(async (template) => ({ ...template, id: 'published', pubkey: 'owner' }));
});
it('blocks using the newer cached follow event without losing other follows or metadata', async () => {
  const { client, result } = setup([old]);
  client.setQueryData(['nostr', 'follow-event', 'owner'], { ...old, created_at: 4_000_000_000, tags: [...old.tags, ['p', 'new-follow'], ['t', 'metadata']] });
  await act(async () => { await result.current.mutateAsync('blocked'); });
  expect(mocks.publish).toHaveBeenCalledWith({ kind: 3, content: 'metadata', created_at: 4_000_000_001, tags: [['p', 'new-follow'], ['t', 'metadata']] });
});
it('refuses an empty fetch when a cached follow list exists', async () => {
  const { client, result } = setup([]);
  client.setQueryData(['nostr', 'follows', 'owner'], ['blocked', 'new-follow']);
  await act(async () => { await expect(result.current.mutateAsync('blocked')).rejects.toThrow('could not be loaded'); });
  expect(mocks.publish).not.toHaveBeenCalled();
});
