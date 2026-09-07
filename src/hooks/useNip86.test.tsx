import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { TestApp } from '@/test/TestApp';
import { useLoginActions } from './useLoginActions';
import { useBannedPubkeys, useNip86Connection, useNip86Mutation, usePolicyMode } from './useNip86';

/**
 * Integration tests for the NIP-86 session hook: discovery against a mocked
 * relay endpoint, capability-gated lists, mutations, and the audit log. The
 * network is stubbed at `fetch`; signing is real (nsec login + NSecSigner).
 */

const PUBKEY_A = 'a'.repeat(64);

function rpcResponse(result: unknown): Response {
  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A minimal in-memory NIP-86 relay: only supports a pubkey ban list. */
function installMockRelay() {
  const state = { banned: [{ pubkey: PUBKEY_A, reason: 'spam' }] };

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = typeof input === 'object' && 'method' in input ? input.method : (init?.method ?? 'GET');

    if (method === 'GET' || url.endsWith('/') && !init?.body) {
      return new Response(
        JSON.stringify({ name: 'Test Relay', description: 'mock', software: 'mock', version: '1' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    if (!auth.startsWith('Nostr ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    }

    const { method: rpc, params = [] } = JSON.parse(String(init?.body));
    switch (rpc) {
      case 'supportedmethods':
        return rpcResponse(['supportedmethods', 'banpubkey', 'unbanpubkey', 'listbannedpubkeys']);
      case 'listbannedpubkeys':
        return rpcResponse(state.banned);
      case 'banpubkey':
        state.banned = [...state.banned, { pubkey: String(params[0]), reason: params[1] }];
        return rpcResponse(true);
      case 'unbanpubkey':
        state.banned = state.banned.filter((entry) => entry.pubkey !== params[0]);
        return rpcResponse(true);
      default:
        return new Response(JSON.stringify({ error: `unknown method: ${rpc}` }), { status: 200 });
    }
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, state };
}

async function renderLoggedIn() {
  const nsec = nip19.nsecEncode(generateSecretKey());
  const rendered = renderHook(
    () => ({
      actions: useLoginActions(),
      connection: useNip86Connection(),
    }),
    { wrapper: TestApp },
  );
  // NostrLoginProvider renders null while it reads logins from storage.
  await waitFor(() => expect(rendered.result.current).not.toBeNull());
  act(() => rendered.result.current.actions.nsec(nsec));
  // useCurrentUser derives the signer in an effect-driven chain; wait until
  // the connection hook reports authorization is possible.
  await waitFor(() => expect(rendered.result.current.connection.canAuthorize).toBe(true));
  return rendered;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useNip86Connection', () => {
  it('requires sign-in before connecting', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useNip86Connection(), { wrapper: TestApp });
    // NostrLoginProvider renders null while it reads logins from storage.
    await waitFor(() => expect(result.current).not.toBeNull());
    await act(async () => {
      await result.current.connect('wss://relay.example.com');
    });

    expect(result.current.session).toBeUndefined();
    expect(result.current.error?.code).toBe('not-logged-in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed relay URLs without touching the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = await renderLoggedIn();
    await act(async () => {
      await result.current.connection.connect('ftp://nope');
    });

    expect(result.current.connection.error?.code).toBe('invalid-url');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discovers capabilities, then serves capability-gated lists and mutations', async () => {
    installMockRelay();
    const { result } = await renderLoggedIn();

    await act(async () => {
      await result.current.connection.connect('mock.relay.test');
    });

    const session = result.current.connection.session;
    expect(session).toBeTruthy();
    expect(session?.url).toBe('https://mock.relay.test/');
    expect(session?.info?.name).toBe('Test Relay');
    expect(session?.methods).toContain('listbannedpubkeys');
    expect(result.current.connection.error).toBeUndefined();

    // The discovery itself is audited.
    expect(result.current.connection.audit.some((entry) => entry.method === 'supportedmethods' && entry.status === 'ok')).toBe(true);

    // List hook reads through the same connection.
    const list = renderHook(
      () => ({
        list: useBannedPubkeys(result.current.connection.session, { onResult: result.current.connection.record }),
        mutation: useNip86Mutation(result.current.connection.session, { onResult: result.current.connection.record }),
      }),
      { wrapper: TestApp },
    );

    await waitFor(() => expect(list.result.current.list.isSuccess).toBe(true));
    expect(list.result.current.list.data).toHaveLength(1);

    // A mutation refreshes the list and writes an audit entry.
    await act(async () => {
      await list.result.current.mutation.mutateAsync({
        method: 'banpubkey',
        params: ['f'.repeat(64), 'test ban'],
        refresh: ['listbannedpubkeys'],
      });
    });

    await waitFor(() => expect(list.result.current.list.data).toHaveLength(2));
    expect(
      result.current.connection.audit.some((entry) => entry.method === 'banpubkey' && entry.status === 'ok'),
    ).toBe(true);
    // The audit log must never contain an authorization header or key material.
    for (const entry of result.current.connection.audit) {
      expect(JSON.stringify(entry)).not.toContain('Nostr ');
    }

    // Unadvertised methods are refused locally, without a request.
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => {
      await expect(
        list.result.current.mutation.mutateAsync({ method: 'blockip', params: ['203.0.113.1'] }),
      ).rejects.toMatchObject({ code: 'unsupported' });
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('surfaces a 401 as an authorization failure with a safe message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 401 })),
    );

    const { result } = await renderLoggedIn();
    await act(async () => {
      await result.current.connection.connect('wss://relay.example.com');
    });

    expect(result.current.connection.session).toBeUndefined();
    expect(result.current.connection.error?.code).toBe('unauthorized');
    expect(result.current.connection.error?.message).not.toContain('Nostr ');
    expect(result.current.connection.audit.some((entry) => entry.status === 'failed')).toBe(true);
  });
});

describe('usePolicyMode', () => {
  it('derives the mode from advertised lists, never from the endpoint name', () => {
    const { result, rerender } = renderHook(({ methods }) => usePolicyMode(methods), {
      initialProps: { methods: ['listbannedpubkeys', 'listblockedips'] },
    });
    expect(result.current).toBe('blocklist');

    rerender({ methods: ['listallowedpubkeys', 'listallowedkinds'] });
    expect(result.current).toBe('allowlist');

    rerender({ methods: ['listbannedpubkeys', 'listallowedpubkeys'] });
    expect(result.current).toBe('unknown');

    rerender({ methods: ['supportedmethods'] });
    expect(result.current).toBe('unknown');
  });
});
