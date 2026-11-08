import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { decodeBolt11 } from './bolt11';
import {
  checkZapAgainstLnurlLimits,
  parseLnurlPayParams,
  preimageMatchesPaymentHash,
  resolveLnurlPayUrl,
  verifyZapInvoice,
  type LnurlPayParams,
} from './zapInvoice';
import { buildTestInvoice } from '@/test/bolt11Fixtures';

// The zap receipt example from NIP-57 Appendix E: a real description-hash
// invoice and its payment preimage. (The example's `description` tag is not
// the exact JSON its invoice committed to — NIP-57 only says SHOULD for
// receipts — so it doubles as a mismatching zap request below.)
const NIP57_BOLT11 =
  'lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0';
const NIP57_DESCRIPTION =
  '{"pubkey":"97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322","content":"","id":"d9cc14d50fcb8c27539aacf776882942c1a11ea4472f8cdec1dea82fab66279d","created_at":1674164539,"sig":"77127f636577e9029276be060332ea565deaf89ff215a494ccff16ae3f757065e2bc59b2e8c113dd407917a010b3abd36c8d7ad84c0e3ab7dab3a0b0caa9835d","kind":9734,"tags":[["e","3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8"],["p","32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245"],["relays","wss://relay.damus.io","wss://nostr-relay.wlvs.space","wss://nostr.fmt.wiz.biz","wss://relay.nostr.bg","wss://nostr.oxtr.dev","wss://nostr.v0l.io","wss://brb.io","wss://nostr.bitcoiner.social","ws://monad.jb55.com:8080","wss://relay.snort.social"]]}';
const NIP57_PREIMAGE = '5d006d2cf1e73c7148e7519a4c68adc81642ce0e25a432b2434c99f97344c15f';

const ZAP_REQUEST = '{"kind":9734,"content":"","tags":[["amount","21000"]]}';

describe('decodeBolt11', () => {
  it('decodes the NIP-57 example invoice', () => {
    const decoded = decodeBolt11(NIP57_BOLT11);
    expect(decoded.amountMsats).toBe(1_000_000n); // 10u = 1,000 sats
    expect(decoded.paymentHash).toBe('96c772a829fb7c780410f1d85cf12a89e8b3c78c0bac5fb47f62758bf961ec30');
    expect(decoded.descriptionHash).toBe('132c3de7685de2be270c4ff629092c92dea8cfa2fdff212a65bf56b95527900e');
    // The published preimage proves the payment hash was decoded correctly.
    expect(preimageMatchesPaymentHash(NIP57_PREIMAGE, decoded.paymentHash)).toBe(true);
  });

  it('accepts an all-uppercase invoice', () => {
    expect(decodeBolt11(NIP57_BOLT11.toUpperCase()).amountMsats).toBe(1_000_000n);
  });

  it.each([
    ['lnbc210n', 21_000n],
    ['lnbc1m', 100_000_000n],
    ['lnbc2500u', 250_000_000n],
    ['lnbc10p', 1n],
    ['lntb1', 100_000_000_000n],
  ])('reads the amount of %s', (hrp, msats) => {
    expect(decodeBolt11(buildTestInvoice({ hrp })).amountMsats).toBe(msats);
  });

  it('reports an amountless invoice as null', () => {
    expect(decodeBolt11(buildTestInvoice({ hrp: 'lnbc' })).amountMsats).toBeNull();
  });

  it('rejects sub-millisat pico amounts, a broken checksum and non-invoices', () => {
    expect(() => decodeBolt11(buildTestInvoice({ hrp: 'lnbc15p' }))).toThrow();
    expect(() => decodeBolt11(NIP57_BOLT11.slice(0, -1) + 'q')).toThrow();
    expect(() => decodeBolt11('lnurl1dp68gurn8ghj7')).toThrow();
    expect(() => decodeBolt11('')).toThrow();
  });
});

describe('verifyZapInvoice', () => {
  it('rejects a real invoice whose description hash is not the zap request that was sent', () => {
    expect(bytesToHex(sha256(utf8ToBytes(NIP57_DESCRIPTION)))).not.toBe(decodeBolt11(NIP57_BOLT11).descriptionHash);
    expect(() => verifyZapInvoice(NIP57_BOLT11, 1_000_000, NIP57_DESCRIPTION)).toThrow(/does not match this zap/);
  });

  it('rejects an invoice for more than the requested amount', () => {
    // The issue: a malicious LNURL server answering a 21-sat request with a
    // 21,000-sat invoice must never reach the wallet.
    const invoice = buildTestInvoice({ hrp: 'lnbc210u', description: ZAP_REQUEST });
    expect(() => verifyZapInvoice(invoice, 21_000, ZAP_REQUEST)).toThrow(/different amount/);
  });

  it('rejects an invoice for less than the requested amount', () => {
    const invoice = buildTestInvoice({ hrp: 'lnbc200n', description: ZAP_REQUEST });
    expect(() => verifyZapInvoice(invoice, 21_000, ZAP_REQUEST)).toThrow(/different amount/);
  });

  it('rejects an amountless invoice, which the wallet could be asked to pay any amount on', () => {
    const invoice = buildTestInvoice({ hrp: 'lnbc', description: ZAP_REQUEST });
    expect(() => verifyZapInvoice(invoice, 21_000, ZAP_REQUEST)).toThrow(/different amount/);
  });

  it('rejects an invoice without a description hash', () => {
    const invoice = buildTestInvoice({ hrp: 'lnbc210n', description: null });
    expect(() => verifyZapInvoice(invoice, 21_000, ZAP_REQUEST)).toThrow(/does not match this zap/);
  });

  it('rejects an invoice committing to a different zap request', () => {
    const invoice = buildTestInvoice({ hrp: 'lnbc210n', description: ZAP_REQUEST.replace('21000', '21001') });
    expect(() => verifyZapInvoice(invoice, 21_000, ZAP_REQUEST)).toThrow(/does not match this zap/);
  });

  it('accepts a matching invoice', () => {
    const invoice = buildTestInvoice({ hrp: 'lnbc210n', description: ZAP_REQUEST, paymentHash: 'ab'.repeat(32) });
    expect(verifyZapInvoice(invoice, 21_000, ZAP_REQUEST)).toBe('ab'.repeat(32));
  });

  it('rejects garbage', () => {
    expect(() => verifyZapInvoice('not an invoice', 21_000, ZAP_REQUEST)).toThrow(/invalid invoice/);
  });
});

describe('preimageMatchesPaymentHash', () => {
  it('rejects a preimage for a different invoice and malformed input', () => {
    const paymentHash = decodeBolt11(NIP57_BOLT11).paymentHash;
    expect(preimageMatchesPaymentHash('00'.repeat(32), paymentHash)).toBe(false);
    expect(preimageMatchesPaymentHash('xyz', paymentHash)).toBe(false);
  });
});

describe('resolveLnurlPayUrl', () => {
  it('builds the well-known URL from lud16', () => {
    expect(resolveLnurlPayUrl(JSON.stringify({ lud16: 'alice@example.com' })))
      .toBe('https://example.com/.well-known/lnurlp/alice');
  });

  it('rejects lud16 values that smuggle a different host or path', () => {
    for (const lud16 of ['alice@evil.com/x', 'alice@evil.com?x=1', 'a@b@c.com', 'al/ice@example.com', 'alice@']) {
      expect(resolveLnurlPayUrl(JSON.stringify({ lud16 }))).toBeNull();
    }
  });

  it('returns null without a lightning address', () => {
    expect(resolveLnurlPayUrl(JSON.stringify({ name: 'x' }))).toBeNull();
    expect(resolveLnurlPayUrl('not json')).toBeNull();
  });
});

describe('parseLnurlPayParams', () => {
  const valid = {
    tag: 'payRequest',
    callback: 'https://example.com/cb',
    minSendable: 1_000,
    maxSendable: 10_000_000,
    commentAllowed: 140,
    allowsNostr: true,
    nostrPubkey: 'c'.repeat(64),
  };

  it('parses a zap-capable pay request', () => {
    expect(parseLnurlPayParams(valid)).toEqual({
      callback: valid.callback,
      minSendable: 1_000,
      maxSendable: 10_000_000,
      commentAllowed: 140,
      nostrPubkey: valid.nostrPubkey,
    });
  });

  it('rejects servers that do not support zaps or return bad bounds', () => {
    expect(parseLnurlPayParams({ ...valid, allowsNostr: false })).toBeNull();
    expect(parseLnurlPayParams({ ...valid, nostrPubkey: 'nope' })).toBeNull();
    expect(parseLnurlPayParams({ ...valid, callback: 'http://example.com/cb' })).toBeNull();
    expect(parseLnurlPayParams({ ...valid, minSendable: 5_000, maxSendable: 1_000 })).toBeNull();
    expect(parseLnurlPayParams({ ...valid, maxSendable: '10000' })).toBeNull();
    expect(parseLnurlPayParams({ ...valid, tag: 'withdrawRequest' })).toBeNull();
  });
});

describe('checkZapAgainstLnurlLimits', () => {
  const params: LnurlPayParams = {
    callback: 'https://example.com/cb',
    minSendable: 10_000,
    maxSendable: 1_000_000,
    commentAllowed: 5,
    nostrPubkey: 'c'.repeat(64),
  };

  it('enforces minSendable and maxSendable', () => {
    expect(checkZapAgainstLnurlLimits(params, 9_000, '')).toMatch(/between 10 and 1,000 sats/);
    expect(checkZapAgainstLnurlLimits(params, 1_001_000, '')).toMatch(/between/);
    expect(checkZapAgainstLnurlLimits(params, 10_000, '')).toBeNull();
    expect(checkZapAgainstLnurlLimits(params, 1_000_000, '')).toBeNull();
  });

  it('enforces commentAllowed', () => {
    expect(checkZapAgainstLnurlLimits(params, 21_000, 'hello')).toBeNull();
    expect(checkZapAgainstLnurlLimits(params, 21_000, 'hello!')).toMatch(/up to 5 characters/);
    expect(checkZapAgainstLnurlLimits({ ...params, commentAllowed: 0 }, 21_000, 'hi')).toMatch(/does not accept zap comments/);
    expect(checkZapAgainstLnurlLimits({ ...params, commentAllowed: null }, 21_000, 'x'.repeat(500))).toBeNull();
  });
});
