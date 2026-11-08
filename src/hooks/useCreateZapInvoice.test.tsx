import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { TestApp } from '@/test/TestApp';
import { buildTestInvoice } from '@/test/bolt11Fixtures';
import { useLoginActions } from './useLoginActions';
import { useCreateZapInvoice } from './useZaps';

const recipient = getPublicKey(generateSecretKey());

const target: NostrEvent = {
  id: 'a'.repeat(64),
  pubkey: recipient,
  created_at: 0,
  kind: 1,
  tags: [],
  content: 'zap me',
  sig: '',
};

const recipientMetadata: NostrEvent = {
  id: 'b'.repeat(64),
  pubkey: recipient,
  created_at: 0,
  kind: 0,
  tags: [],
  content: JSON.stringify({ lud16: 'alice@wallet.example' }),
  sig: '',
};

const PAY_PARAMS = {
  tag: 'payRequest',
  callback: 'https://wallet.example/lnurlp/alice/callback',
  minSendable: 1_000,
  maxSendable: 100_000_000,
  commentAllowed: 32,
  allowsNostr: true,
  nostrPubkey: 'c'.repeat(64),
  metadata: '[]',
};

/**
 * Mocks the recipient's LNURL server. `invoiceFor` receives the requested
 * millisats and the exact `nostr` query parameter, and returns the `pr` the
 * server answers with — honestly or not.
 */
function mockLnurlServer(invoiceFor: (amountMsats: number, zapRequestJson: string) => string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === '/.well-known/lnurlp/alice') {
      return Response.json(PAY_PARAMS);
    }
    if (url.href.startsWith(PAY_PARAMS.callback)) {
      const amount = Number(url.searchParams.get('amount'));
      const nostr = url.searchParams.get('nostr') ?? '';
      return Response.json({ pr: invoiceFor(amount, nostr), routes: [] });
    }
    return new Response('not found', { status: 404 });
  });
}

async function renderLoggedIn() {
  const { result } = renderHook(
    () => ({ actions: useLoginActions(), zap: useCreateZapInvoice() }),
    { wrapper: TestApp },
  );
  await waitFor(() => expect(result.current).not.toBeNull());
  act(() => result.current.actions.nsec(nip19.nsecEncode(generateSecretKey())));
  return result;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCreateZapInvoice', () => {
  it('returns an invoice whose amount and description hash match the request', async () => {
    mockLnurlServer((msats, zapRequestJson) =>
      buildTestInvoice({ hrp: `lnbc${msats / 100}n`, description: zapRequestJson, paymentHash: 'ab'.repeat(32) }),
    );
    const result = await renderLoggedIn();

    let zap: Awaited<ReturnType<typeof result.current.zap.mutateAsync>> | undefined;
    await act(async () => {
      zap = await result.current.zap.mutateAsync({ target, recipientMetadata, amountSats: 21 });
    });

    expect(zap?.amountSats).toBe(21);
    expect(zap?.paymentHash).toBe('ab'.repeat(32));
  });

  it('refuses an invoice for a larger amount than requested (issue #122)', async () => {
    // A malicious LNURL server answers a 21-sat zap with a 21,000-sat invoice.
    mockLnurlServer((_msats, zapRequestJson) => buildTestInvoice({ hrp: 'lnbc210u', description: zapRequestJson }));
    const result = await renderLoggedIn();

    await act(async () => {
      await expect(
        result.current.zap.mutateAsync({ target, recipientMetadata, amountSats: 21 }),
      ).rejects.toThrow(/different amount/);
    });
  });

  it('refuses an invoice that does not commit to the signed zap request', async () => {
    mockLnurlServer((msats) => buildTestInvoice({ hrp: `lnbc${msats / 100}n`, description: '{"kind":9734}' }));
    const result = await renderLoggedIn();

    await act(async () => {
      await expect(
        result.current.zap.mutateAsync({ target, recipientMetadata, amountSats: 21 }),
      ).rejects.toThrow(/does not match this zap/);
    });
  });

  it('checks LNURL bounds and comment limits before requesting an invoice', async () => {
    const fetchMock = mockLnurlServer(() => {
      throw new Error('callback must not be called');
    });
    const result = await renderLoggedIn();

    await act(async () => {
      await expect(
        result.current.zap.mutateAsync({ target, recipientMetadata, amountSats: 200_000 }),
      ).rejects.toThrow(/between 1 and 100,000 sats/);
      await expect(
        result.current.zap.mutateAsync({ target, recipientMetadata, amountSats: 21, comment: 'x'.repeat(33) }),
      ).rejects.toThrow(/up to 32 characters/);
    });

    const calledCallback = fetchMock.mock.calls.some(([input]) => String(input).startsWith(PAY_PARAMS.callback));
    expect(calledCallback).toBe(false);
  });
});
