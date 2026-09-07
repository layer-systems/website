import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip57 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { summarizeZapReceipts, formatSats } from './useZaps';

const targetId = 'a'.repeat(64);
// A syntactically valid-enough bolt11 for getSatoshisAmountFromBolt11: "lnbc"
// + amount "210" + unit "n" (nano-BTC, i.e. 21 sats) + the "1" data separator,
// padded past the function's 50-character minimum with characters that don't
// contain another "1" (which would shift where it splits the human-readable
// part from the data part).
const FAKE_BOLT11 = `lnbc210n1${'p'.repeat(45)}`;

function signedZapRequest(amountMsats: number): { json: string; pubkey: string } {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const template = nip57.makeZapRequest({
    event: { id: targetId, pubkey: 'b'.repeat(64), kind: 1, content: '', tags: [], created_at: 0, sig: '' },
    amount: amountMsats,
    comment: '',
    relays: ['wss://relay.example.com'],
  });
  const signed = finalizeEvent(template, secretKey);
  return { json: JSON.stringify(signed), pubkey };
}

function receipt(overrides: Partial<NostrEvent> = {}, description = signedZapRequest(21_000).json): NostrEvent {
  return {
    id: overrides.id ?? Math.random().toString(36),
    pubkey: 'zapper-service',
    created_at: 0,
    kind: 9735,
    content: '',
    sig: '',
    tags: [
      ['e', targetId],
      ['bolt11', FAKE_BOLT11],
      ['description', description],
    ],
    ...overrides,
  };
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

describe('summarizeZapReceipts', () => {
  it('returns zero for no receipts', () => {
    expect(summarizeZapReceipts(undefined)).toEqual({ totalSats: 0, count: 0 });
  });

  it('sums valid receipts by their bolt11 amount', () => {
    // FAKE_BOLT11 encodes 210n, which getSatoshisAmountFromBolt11 reads as 21 sats.
    const events = [receipt({ id: '1' }), receipt({ id: '2' })];
    const summary = summarizeZapReceipts(events);
    expect(summary.count).toBe(2);
    expect(summary.totalSats).toBe(42);
  });

  it('drops receipts with a malformed description', () => {
    const events = [receipt({ id: '1' }, 'not json'), receipt({ id: '2' }, JSON.stringify({ not: 'an event' }))];
    expect(summarizeZapReceipts(events)).toEqual({ totalSats: 0, count: 0 });
  });

  it('drops receipts missing bolt11 or description', () => {
    const missingBolt11: NostrEvent = {
      ...receipt({ id: '1' }),
      tags: [['e', targetId], ['description', signedZapRequest(1000).json]],
    };
    expect(summarizeZapReceipts([missingBolt11]).count).toBe(0);
  });

  it('deduplicates by receipt id', () => {
    const single = receipt({ id: 'dup' });
    const summary = summarizeZapReceipts([single, single]);
    expect(summary.count).toBe(1);
  });
});
