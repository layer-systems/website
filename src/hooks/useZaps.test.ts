import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { finalizeEvent } from 'nostr-tools';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { keypair, makeZapReceipt } from '@/test/zapFixtures';
import type { ValidZapReceipt } from '@/lib/zapReceipts';
import { summarizeZapReceipts, hasValidReceiptForInvoice, formatSats, useZapReceipts } from './useZaps';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const zapper = keypair();
const recipient = keypair();

const target = finalizeEvent({ kind: 1, created_at: 1, content: 'zap me', tags: [] }, recipient.secretKey) as NostrEvent;
const profile = finalizeEvent(
  { kind: 0, created_at: 1, content: JSON.stringify({ name: 'recipient', lud16: 'recipient@wallet.example.com' }), tags: [] },
  recipient.secretKey,
) as NostrEvent;

function valid(bolt11: string, amountSats: number): ValidZapReceipt {
  const { receipt, request } = makeZapReceipt({ zapper: zapper.secretKey, recipient: recipient.pubkey, eventId: target.id });
  return { receipt, request, sender: request.pubkey, bolt11, amountMsats: amountSats * 1000, amountSats, comment: '' };
}

/**
 * Renders `useZapReceipts` against a fake relay that serves `receipts` for
 * any kind-9735 filter — including ones it should have excluded by `authors`,
 * like a relay that ignores the filter — and a fake LNURL server.
 */
function renderZapReceipts(
  receipts: NostrEvent[],
  lnurlBody: Record<string, unknown> = { callback: 'https://wallet.example.com/callback', allowsNostr: true, nostrPubkey: zapper.pubkey },
) {
  const query = vi.fn(async (filters: NostrFilter[]) => {
    if (filters.some((filter) => filter.kinds?.includes(0))) return [profile];
    if (filters.some((filter) => filter.kinds?.includes(9735))) return receipts;
    return [];
  });
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(lnurlBody)));
  vi.stubGlobal('fetch', fetchMock);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const nostr = { query } as unknown as NonNullable<React.ContextType<typeof NostrContext>>['nostr'];
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, createElement(NostrContext.Provider, { value: { nostr } }, children));

  const hook = renderHook(() => useZapReceipts(target), { wrapper });
  return { ...hook, query, fetchMock };
}

describe('formatSats', () => {
  it('formats small numbers plainly', () => {
    expect(formatSats(21)).toBe('21');
    expect(formatSats(0)).toBe('0');
  });

  it('formats large numbers without throwing', () => {
    // Exact compact-notation output ("1.2K" vs "1200") depends on the ICU
    // data available at runtime, so only the type/no-throw contract is
    // checked here — the notation itself is exercised in a real browser.
    expect(typeof formatSats(1_234_567)).toBe('string');
  });
});

describe('useZapReceipts', () => {
  it('only counts receipts signed by the recipient LNURL nostrPubkey (issue #121)', async () => {
    const real = makeZapReceipt({ zapper: zapper.secretKey, recipient: recipient.pubkey, eventId: target.id, amountMsats: 21_000 });
    // The reported attack: a receipt signed by an arbitrary key, embedding a
    // self-signed, signature-valid zap request for a huge amount.
    const attacker = keypair();
    const forged = makeZapReceipt({ zapper: attacker.secretKey, recipient: recipient.pubkey, sender: attacker.secretKey, eventId: target.id, amountMsats: 100_000_000 });

    const { result, query, fetchMock } = renderZapReceipts([real.receipt, forged.receipt]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('https://wallet.example.com/.well-known/lnurlp/recipient', expect.anything());
    const receiptFilter = query.mock.calls.flatMap(([filters]) => filters).find((filter) => filter.kinds?.includes(9735));
    expect(receiptFilter).toMatchObject({ authors: [zapper.pubkey], '#e': [target.id] });

    expect(summarizeZapReceipts(result.current.data)).toEqual({ totalSats: 21, count: 1 });
  });

  it('trusts no receipts when the recipient LNURL server does not support zaps', async () => {
    const real = makeZapReceipt({ zapper: zapper.secretKey, recipient: recipient.pubkey, eventId: target.id });
    const { result, query } = renderZapReceipts([real.receipt], { allowsNostr: false, nostrPubkey: zapper.pubkey });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    // No key to trust means no receipt query at all.
    expect(query.mock.calls.some(([filters]) => filters.some((filter) => filter.kinds?.includes(9735)))).toBe(false);
  });
});

describe('summarizeZapReceipts', () => {
  it('returns zero for no receipts', () => {
    expect(summarizeZapReceipts(undefined)).toEqual({ totalSats: 0, count: 0 });
  });

  it('sums validated receipts by their invoice amount', () => {
    expect(summarizeZapReceipts([valid('lnbc1', 21), valid('lnbc2', 100)])).toEqual({ totalSats: 121, count: 2 });
  });
});

describe('hasValidReceiptForInvoice', () => {
  const MY_INVOICE = 'lnbc210n1mine';

  it('returns false for no receipts', () => {
    expect(hasValidReceiptForInvoice(undefined, MY_INVOICE)).toBe(false);
  });

  it('matches a validated receipt paying the exact invoice', () => {
    expect(hasValidReceiptForInvoice([valid(MY_INVOICE, 21)], MY_INVOICE)).toBe(true);
  });

  it('ignores a receipt for a different invoice — someone else zapping the same note must not confirm this payment', () => {
    expect(hasValidReceiptForInvoice([valid('lnbc210n1theirs', 21)], MY_INVOICE)).toBe(false);
  });
});
