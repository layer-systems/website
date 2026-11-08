import { describe, expect, it } from 'vitest';
import { finalizeEvent } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { keypair, makeBolt11, makeZapReceipt, sha256Hex, bech32Encode, bytesToWords } from '@/test/zapFixtures';
import { decodeBolt11 } from './bolt11';
import { lnurlPayUrl } from './lnurl';
import { eventAddress, validateZapReceipt, validateZapReceipts } from './zapReceipts';

const zapper = keypair();
const recipient = keypair();
const sender = keypair();
const eventId = 'a'.repeat(64);

const expectation = { zapperPubkey: zapper.pubkey, recipientPubkey: recipient.pubkey, eventId };

function fixture(overrides: Partial<Parameters<typeof makeZapReceipt>[0]> = {}) {
  return makeZapReceipt({ zapper: zapper.secretKey, recipient: recipient.pubkey, sender: sender.secretKey, eventId, ...overrides });
}

describe('decodeBolt11', () => {
  it('decodes the amount and description hash of a real-shaped invoice', () => {
    const invoice = makeBolt11({ amountMsats: 21_000, description: 'hello' });
    const decoded = decodeBolt11(invoice);
    expect(decoded?.amountMsats).toBe(21_000n);
    expect(decoded?.descriptionHash).toBe(sha256Hex('hello'));
  });

  it('rejects invoices with a broken checksum or non-lightning prefix', () => {
    const invoice = makeBolt11({ amountMsats: 21_000, description: 'hello' });
    const flipped = invoice.slice(0, -1) + (invoice.endsWith('q') ? 'p' : 'q');
    expect(decodeBolt11(flipped)).toBeNull();
    expect(decodeBolt11(`lnbc210n1${'p'.repeat(45)}`)).toBeNull();
    expect(decodeBolt11(bech32Encode('npub', new Array(120).fill(0)))).toBeNull();
  });

  it('decodes the NIP-57 example receipt invoice (10u = 1000 sats)', () => {
    const invoice = 'lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0';
    const decoded = decodeBolt11(invoice);
    expect(decoded?.amountMsats).toBe(1_000_000n);
    expect(decoded?.descriptionHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('lnurlPayUrl', () => {
  it('builds an https well-known URL from a lightning address', () => {
    expect(lnurlPayUrl({ lud16: 'alice@Wallet.Example.com' })).toBe('https://wallet.example.com/.well-known/lnurlp/alice');
  });

  it('rejects malformed addresses that could steer the request elsewhere', () => {
    expect(lnurlPayUrl({ lud16: 'alice@evil.com/path' })).toBeNull();
    expect(lnurlPayUrl({ lud16: 'a/../b@example.com' })).toBeNull();
    expect(lnurlPayUrl({ lud16: 'alice' })).toBeNull();
    expect(lnurlPayUrl({})).toBeNull();
  });

  it('decodes an https lud06 and rejects plain http', () => {
    const encode = (url: string) => bech32Encode('lnurl', bytesToWords(new TextEncoder().encode(url)));
    expect(lnurlPayUrl({ lud06: encode('https://example.com/lnurlp/alice') })).toBe('https://example.com/lnurlp/alice');
    expect(lnurlPayUrl({ lud06: encode('http://example.com/lnurlp/alice') })).toBeNull();
  });
});

describe('validateZapReceipt', () => {
  it('accepts a receipt that satisfies NIP-57 Appendix F and credits the request signer', async () => {
    const { receipt } = fixture({ comment: 'great note' });
    const valid = await validateZapReceipt(receipt, expectation);
    expect(valid).not.toBeNull();
    expect(valid?.sender).toBe(sender.pubkey);
    expect(valid?.sender).not.toBe(receipt.pubkey);
    expect(valid?.amountSats).toBe(21);
    expect(valid?.comment).toBe('great note');
  });

  it('rejects a self-signed forgery: receipt not signed by the recipient LNURL nostrPubkey', async () => {
    // The issue's attack: anyone signs a receipt embedding their own valid request.
    const attacker = keypair();
    const { receipt } = makeZapReceipt({ zapper: attacker.secretKey, recipient: recipient.pubkey, sender: attacker.secretKey, eventId, amountMsats: 100_000_000 });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('rejects a request zapping someone else', async () => {
    const other = keypair();
    const { receipt } = fixture({
      requestTags: (tags) => tags.map((tag) => (tag[0] === 'p' ? ['p', other.pubkey] : tag)),
    });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('rejects a request with more than one p tag', async () => {
    const other = keypair();
    const { receipt } = fixture({ requestTags: (tags) => [...tags, ['p', other.pubkey]] });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('rejects a receipt whose p tag does not mirror the request', async () => {
    const other = keypair();
    const { receipt } = fixture({ receiptTags: (tags) => tags.map((tag) => (tag[0] === 'p' ? ['p', other.pubkey] : tag)) });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('rejects a request for a different note re-tagged onto this one', async () => {
    const { receipt } = fixture({
      requestTags: (tags) => tags.map((tag) => (tag[0] === 'e' ? ['e', 'b'.repeat(64)] : tag)),
    });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('rejects a profile zap counted toward a note', async () => {
    const { receipt } = fixture({ eventId: undefined, receiptTags: (tags) => [...tags, ['e', eventId]] });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('rejects an a-tag pointing at a different address than the target', async () => {
    const { receipt } = fixture({
      requestTags: (tags) => [...tags, ['a', `30023:${recipient.pubkey}:other`]],
      receiptTags: (tags) => [...tags, ['a', `30023:${recipient.pubkey}:other`]],
    });
    expect(await validateZapReceipt(receipt, { ...expectation, address: `30023:${recipient.pubkey}:mine` })).toBeNull();
    expect(await validateZapReceipt(receipt, { ...expectation, address: `30023:${recipient.pubkey}:other` })).not.toBeNull();
  });

  it('rejects an invoice amount that differs from the request amount', async () => {
    const { receipt } = fixture({ amountMsats: 21_000, invoiceMsats: 2_100_000 });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('uses the invoice amount when the request has no amount tag', async () => {
    const { receipt } = fixture({ omitAmountTag: true, invoiceMsats: 50_000 });
    expect((await validateZapReceipt(receipt, expectation))?.amountSats).toBe(50);
  });

  it('rejects a description hash that does not commit to the embedded request', async () => {
    const { receipt } = fixture({ descriptionHash: sha256Hex('something else') });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('rejects a P tag that names someone other than the request signer', async () => {
    const impostor = keypair();
    const { receipt } = fixture({ receiptTags: (tags) => tags.map((tag) => (tag[0] === 'P' ? ['P', impostor.pubkey] : tag)) });
    expect(await validateZapReceipt(receipt, expectation)).toBeNull();
  });

  it('rejects a malformed description, a non-9734 request, or an undecodable bolt11', async () => {
    const malformed = fixture({ receiptTags: (tags) => tags.map((tag) => (tag[0] === 'description' ? ['description', 'not json'] : tag)) });
    expect(await validateZapReceipt(malformed.receipt, expectation)).toBeNull();

    const note = finalizeEvent({ kind: 1, created_at: 0, content: '', tags: [['p', recipient.pubkey], ['relays', 'wss://r'], ['e', eventId]] }, sender.secretKey);
    const wrongKind = fixture({ receiptTags: (tags) => tags.map((tag) => (tag[0] === 'description' ? ['description', JSON.stringify(note)] : tag)) });
    expect(await validateZapReceipt(wrongKind.receipt, expectation)).toBeNull();

    const badInvoice = fixture({ receiptTags: (tags) => tags.map((tag) => (tag[0] === 'bolt11' ? ['bolt11', `lnbc210n1${'p'.repeat(45)}`] : tag)) });
    expect(await validateZapReceipt(badInvoice.receipt, expectation)).toBeNull();
  });

  it('validates profile zaps for notifications without a target note', async () => {
    const { receipt } = fixture({ eventId: undefined });
    const valid = await validateZapReceipt(receipt, { zapperPubkey: zapper.pubkey, recipientPubkey: recipient.pubkey });
    expect(valid?.sender).toBe(sender.pubkey);
  });
});

describe('validateZapReceipts', () => {
  it('drops forgeries and de-duplicates by receipt id and invoice', async () => {
    const real = fixture().receipt;
    const forged = makeZapReceipt({ zapper: keypair().secretKey, recipient: recipient.pubkey, eventId }).receipt;
    // Same invoice re-published under a new receipt id.
    const republished = finalizeEvent({ kind: 9735, created_at: real.created_at + 5, content: '', tags: real.tags }, zapper.secretKey) as NostrEvent;

    const valid = await validateZapReceipts([real, real, forged, republished], expectation);
    expect(valid).toHaveLength(1);
    expect(valid[0].receipt.id).toBe(real.id);
  });
});

describe('eventAddress', () => {
  it('returns coordinates only for replaceable and addressable kinds', () => {
    expect(eventAddress({ kind: 1, pubkey: 'p', tags: [] })).toBeUndefined();
    expect(eventAddress({ kind: 30023, pubkey: 'p', tags: [['d', 'slug']] })).toBe('30023:p:slug');
    expect(eventAddress({ kind: 10002, pubkey: 'p', tags: [] })).toBe('10002:p:');
  });
});
