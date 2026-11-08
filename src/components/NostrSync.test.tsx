import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { NLogin, NostrLoginProvider, useNostrLogin } from '@nostrify/react/login';
import { AppProvider } from '@/components/AppProvider';
import { NostrSync } from '@/components/NostrSync';
import type { AppConfig } from '@/contexts/AppContext';
import { useAppContext } from '@/hooks/useAppContext';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@nostrify/react', async (importOriginal) => ({
  ...await importOriginal<typeof import('@nostrify/react')>(),
  useNostr: () => ({ nostr: { query: mocks.query } }),
}));
vi.mock('@/hooks/useRelayListSync', () => ({
  useRelayListSync: () => ({ data: undefined, isSuccess: false, isError: false, dataUpdatedAt: 0 }),
}));

const defaultConfig: AppConfig = {
  theme: 'light',
  relayMetadata: { relays: [{ url: 'wss://default.example/', read: true, write: true }], updatedAt: 0 },
  blossomServerMetadata: { servers: ['https://blossom.default.example/'], updatedAt: 0 },
  useAppBlossomServers: true,
};

function newLogin() {
  const sk = generateSecretKey();
  return { login: NLogin.fromNsec(nip19.nsecEncode(sk)), pubkey: getPublicKey(sk) };
}

function serverList(pubkey: string, server: string): NostrEvent {
  return { id: pubkey, kind: 10063, pubkey, created_at: 1_700_000_000, tags: [['server', server]], content: '', sig: '' };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NostrLoginProvider storageKey="test-sync-login">
      <AppProvider storageKey="test-sync-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={client}>
          <NostrSync />
          {children}
        </QueryClientProvider>
      </AppProvider>
    </NostrLoginProvider>
  );
  return renderHook(() => ({ app: useAppContext(), login: useNostrLogin() }), { wrapper });
}

describe('NostrSync Blossom server sync', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.query.mockReset();
  });

  it('discards a lookup that completes after switching accounts', async () => {
    const alice = newLogin();
    const bob = newLogin();
    let resolveAlice: (events: NostrEvent[]) => void = () => {};
    mocks.query.mockImplementation((filters: NostrFilter[]) => {
      const filter = filters[0];
      if (filter.kinds?.includes(10063) && filter.authors?.includes(alice.pubkey)) {
        return new Promise<NostrEvent[]>((resolve) => { resolveAlice = resolve; });
      }
      return Promise.resolve([]);
    });

    const { result } = setup();
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current.login.addLogin(alice.login));
    await waitFor(() => expect(mocks.query).toHaveBeenCalledWith(
      [{ kinds: [10063], authors: [alice.pubkey], limit: 1 }],
      expect.anything(),
    ));

    act(() => {
      result.current.login.addLogin(bob.login);
      result.current.login.setLogin(bob.login.id);
    });

    await act(async () => resolveAlice([serverList(alice.pubkey, 'https://blossom.alice.example/')]));

    expect(result.current.app.config.blossomServerMetadata).toEqual(defaultConfig.blossomServerMetadata);
  });

  it('ignores a server list signed by another pubkey', async () => {
    const alice = newLogin();
    const mallory = newLogin();
    mocks.query.mockImplementation(async (filters: NostrFilter[]) => (
      filters[0].kinds?.includes(10063) ? [serverList(mallory.pubkey, 'https://blossom.mallory.example/')] : []
    ));

    const { result } = setup();
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => result.current.login.addLogin(alice.login));

    await waitFor(() => expect(mocks.query).toHaveBeenCalledWith(
      [{ kinds: [10063], authors: [alice.pubkey], limit: 1 }],
      expect.anything(),
    ));
    await act(async () => {});
    expect(result.current.app.config.blossomServerMetadata).toEqual(defaultConfig.blossomServerMetadata);
  });

  it('adopts the active account\'s newer server list', async () => {
    const alice = newLogin();
    mocks.query.mockImplementation(async (filters: NostrFilter[]) => (
      filters[0].kinds?.includes(10063) ? [serverList(alice.pubkey, 'https://blossom.alice.example/')] : []
    ));

    const { result } = setup();
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => result.current.login.addLogin(alice.login));

    await waitFor(() => expect(result.current.app.config.blossomServerMetadata).toEqual({
      servers: ['https://blossom.alice.example/'],
      updatedAt: 1_700_000_000,
    }));
  });
});
