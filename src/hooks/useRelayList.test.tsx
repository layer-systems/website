import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AppConfig, RelayMetadata } from '@/contexts/AppContext';
import { APP_RELAYS } from '@/lib/appRelays';
import type { RelayListSyncResult } from '@/lib/relayListSync';
import { useRelayList } from './useRelayList';

type Sync = { data?: RelayListSyncResult; isError: boolean };

const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
  send: vi.fn(),
  toast: vi.fn(),
  sync: { isError: false } as { data?: unknown; isError: boolean },
  config: null as unknown,
}));

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { relay: () => ({ event: mocks.send }) } }),
}));
vi.mock('./useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'owner', signer: { signEvent: mocks.sign } } }),
}));
vi.mock('./useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('./useRelayListSync', () => ({
  relayListSyncKey: (pubkey: string) => ['relay-list-sync', pubkey],
  useRelayListSync: () => mocks.sync,
}));
vi.mock('./useAppContext', () => ({ useAppContext: () => mocks.config }));

const published: NostrEvent = {
  id: 'published',
  kind: 10002,
  pubkey: 'owner',
  created_at: 1_000,
  tags: [['r', 'wss://mine.example/']],
  content: '',
  sig: '',
};

function setup(initial: RelayMetadata, sync: Sync) {
  mocks.sync = sync;
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => {
    const [config, setConfig] = useState<Partial<AppConfig>>({ relayMetadata: initial });
    mocks.config = {
      config,
      updateConfig: (updater: (current: Partial<AppConfig>) => Partial<AppConfig>) => setConfig(updater),
    };
    return { relayList: useRelayList(), config };
  }, { wrapper });
}

function found(event: NostrEvent | null): Sync {
  return { isError: false, data: { event, foundOn: [], outdated: [], checked: [], queried: [] } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sign.mockImplementation(async (template) => ({ ...template, id: 'signed', pubkey: 'owner', sig: '' }));
  mocks.send.mockResolvedValue(undefined);
});

it('does not publish the app defaults while the published list is still being looked up (#114)', () => {
  const { result } = setup(APP_RELAYS, { isError: false });
  expect(result.current.relayList.blocked).not.toBeNull();
  act(() => {
    expect(result.current.relayList.add('wss://new.example')).toMatchObject({ ok: false });
  });
  expect(mocks.sign).not.toHaveBeenCalled();
  expect(result.current.config.relayMetadata).toBe(APP_RELAYS);
});

it('does not publish when the lookup failed', () => {
  const { result } = setup(APP_RELAYS, { isError: true });
  act(() => {
    expect(result.current.relayList.remove('wss://nos.lol/')).toMatchObject({ ok: false });
  });
  expect(mocks.sign).not.toHaveBeenCalled();
});

it('applies an edit to the published list instead of the stale defaults', async () => {
  const { result } = setup(APP_RELAYS, found(published));
  await act(async () => {
    expect(result.current.relayList.add('wss://new.example')).toEqual({ ok: true });
  });
  expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({
    kind: 10002,
    tags: [['r', 'wss://mine.example/'], ['r', 'wss://new.example/']],
  }));
  expect(mocks.sign.mock.calls[0][0].created_at).toBeGreaterThan(published.created_at);
});

it('keeps default-derived edits on this device until the user publishes them', async () => {
  const { result } = setup(APP_RELAYS, found(null));
  await act(async () => {
    expect(result.current.relayList.add('wss://new.example')).toEqual({ ok: true });
  });
  expect(mocks.sign).not.toHaveBeenCalled();
  expect(result.current.config.relayMetadata?.relays.map((r) => r.url)).toContain('wss://new.example/');

  await act(async () => {
    expect(result.current.relayList.publishCurrent()).toEqual({ ok: true });
  });
  expect(mocks.sign).toHaveBeenCalledTimes(1);

  // Later edits descend from the explicit publish, so they are published too.
  await act(async () => {
    result.current.relayList.add('wss://other.example');
  });
  expect(mocks.sign).toHaveBeenCalledTimes(2);
});

it('publishes an explicit reset to defaults even before the lookup finishes', async () => {
  const { result } = setup({ relays: [{ url: 'wss://mine.example/', read: true, write: true }], updatedAt: 1_000 }, { isError: false });
  await act(async () => {
    expect(result.current.relayList.resetToDefaults()).toEqual({ ok: true });
  });
  expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ kind: 10002 }));
  expect(result.current.config.relayMetadata?.relays).toEqual(APP_RELAYS.relays);
});
