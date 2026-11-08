import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { NLogin, NostrLoginProvider, useNostrLogin } from '@nostrify/react/login';
import { AppProvider } from '@/components/AppProvider';
import type { AppConfig, RelayMetadata } from '@/contexts/AppContext';
import { useAppContext } from '@/hooks/useAppContext';

const STORAGE_KEY = 'test-scoped-config';
const LOGIN_KEY = 'test-scoped-login';

const defaultConfig: AppConfig = {
  theme: 'light',
  relayMetadata: { relays: [{ url: 'wss://default.example/', read: true, write: true }], updatedAt: 0 },
  blossomServerMetadata: { servers: ['https://blossom.default.example/'], updatedAt: 0 },
  useAppBlossomServers: true,
};

const aliceRelays: RelayMetadata = {
  relays: [{ url: 'wss://alice.example/', read: true, write: true }],
  updatedAt: 1_700_000_000,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NostrLoginProvider storageKey={LOGIN_KEY}>
      <AppProvider storageKey={STORAGE_KEY} defaultConfig={defaultConfig}>
        {children}
      </AppProvider>
    </NostrLoginProvider>
  );
}

async function setup() {
  const hook = renderHook(() => ({ app: useAppContext(), login: useNostrLogin() }), { wrapper });
  // NostrLoginProvider renders nothing until it has read its storage.
  await waitFor(() => expect(hook.result.current).not.toBeNull());
  return hook;
}

function newLogin() {
  const sk = generateSecretKey();
  return { login: NLogin.fromNsec(nip19.nsecEncode(sk)), pubkey: getPublicKey(sk) };
}

describe('AppProvider account scoping', () => {
  beforeEach(() => localStorage.clear());

  it('does not carry relay or Blossom lists across account switch and logout', async () => {
    const alice = newLogin();
    const bob = newLogin();
    const { result } = await setup();

    act(() => result.current.login.addLogin(alice.login));
    act(() => result.current.app.updateConfig((current) => ({
      ...current,
      theme: 'dark',
      relayMetadata: aliceRelays,
      blossomServerMetadata: { servers: ['https://blossom.alice.example/'], updatedAt: aliceRelays.updatedAt },
    })));
    expect(result.current.app.config.relayMetadata).toEqual(aliceRelays);

    // Switching to Bob: Bob starts from the defaults, never Alice's lists.
    act(() => {
      result.current.login.addLogin(bob.login);
      result.current.login.setLogin(bob.login.id);
    });
    expect(result.current.login.logins[0].pubkey).toBe(bob.pubkey);
    expect(result.current.app.config.relayMetadata).toEqual(defaultConfig.relayMetadata);
    expect(result.current.app.config.blossomServerMetadata).toEqual(defaultConfig.blossomServerMetadata);
    // Device preferences stay shared.
    expect(result.current.app.config.theme).toBe('dark');

    // Bob's edits stay Bob's.
    const bobRelays: RelayMetadata = { relays: [{ url: 'wss://bob.example/', read: true, write: true }], updatedAt: 5 };
    act(() => result.current.app.updateConfig((current) => ({ ...current, relayMetadata: bobRelays })));
    expect(result.current.app.config.relayMetadata).toEqual(bobRelays);

    // Switching back restores Alice's own lists.
    act(() => result.current.login.setLogin(alice.login.id));
    expect(result.current.app.config.relayMetadata).toEqual(aliceRelays);

    // Logging everyone out falls back to the defaults for anonymous browsing.
    act(() => {
      result.current.login.removeLogin(alice.login.id);
      result.current.login.removeLogin(bob.login.id);
    });
    expect(result.current.login.logins).toHaveLength(0);
    expect(result.current.app.config.relayMetadata).toEqual(defaultConfig.relayMetadata);
    expect(result.current.app.config.blossomServerMetadata).toEqual(defaultConfig.blossomServerMetadata);
  });

  it('keeps a write started before an account switch in the original account', async () => {
    const alice = newLogin();
    const bob = newLogin();
    const { result } = await setup();

    act(() => result.current.login.addLogin(alice.login));
    const aliceUpdateConfig = result.current.app.updateConfig;

    act(() => {
      result.current.login.addLogin(bob.login);
      result.current.login.setLogin(bob.login.id);
    });

    // e.g. a relay list sync for Alice that completes after the switch.
    act(() => aliceUpdateConfig((current) => ({ ...current, relayMetadata: aliceRelays })));

    expect(result.current.app.config.relayMetadata).toEqual(defaultConfig.relayMetadata);
    act(() => result.current.login.setLogin(alice.login.id));
    expect(result.current.app.config.relayMetadata).toEqual(aliceRelays);
  });

  it('ignores unscoped relay and Blossom lists stored by earlier versions', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: 'dark',
      relayMetadata: aliceRelays,
      blossomServerMetadata: { servers: ['https://blossom.alice.example/'], updatedAt: 1 },
    }));
    const { result } = await setup();

    expect(result.current.app.config.theme).toBe('dark');
    expect(result.current.app.config.relayMetadata).toEqual(defaultConfig.relayMetadata);
    expect(result.current.app.config.blossomServerMetadata).toEqual(defaultConfig.blossomServerMetadata);
  });
});
