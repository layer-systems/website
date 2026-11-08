import { createHash } from 'node:crypto';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Test-only builders for NIP-57 fixtures: real, checksum-valid bolt11
 * invoices (with a dummy node signature) and properly signed zap requests and
 * receipts, so validation is exercised against the same shapes real LNURL
 * servers publish.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GENERATOR[i];
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  return [...[...hrp].map((c) => c.charCodeAt(0) >>> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
}

export function bech32Encode(hrp: string, words: number[]): string {
  const mod = polymod([...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...checksum].map((w) => CHARSET[w]).join('')}`;
}

export function bytesToWords(bytes: Uint8Array): number[] {
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >>> bits) & 31);
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  return words;
}

function hashField(type: number, hex: string): number[] {
  const words = bytesToWords(Buffer.from(hex, 'hex'));
  return [type, words.length >> 5, words.length & 31, ...words];
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** A bolt11 invoice for `amountMsats` (must be a whole number of nano-BTC, i.e. a multiple of 100 msat). */
export function makeBolt11(opts: { amountMsats: number; description?: string; descriptionHash?: string; paymentHash?: string }): string {
  const timestamp = Array.from({ length: 7 }, (_, i) => (1_700_000_000 >>> (5 * (6 - i))) & 31);
  const fields = [
    ...hashField(1, opts.paymentHash ?? sha256Hex(`payment-${Math.random()}`)),
    ...(opts.descriptionHash ?? opts.description
      ? hashField(23, opts.descriptionHash ?? sha256Hex(opts.description!))
      : []),
  ];
  const signature = new Array(104).fill(0);
  return bech32Encode(`lnbc${opts.amountMsats / 100}n`, [...timestamp, ...fields, ...signature]);
}

export function keypair() {
  const secretKey = generateSecretKey();
  return { secretKey, pubkey: getPublicKey(secretKey) };
}

export interface ZapFixtureOptions {
  zapper: Uint8Array;
  recipient: string;
  sender?: Uint8Array;
  eventId?: string;
  amountMsats?: number;
  /** Override the invoice amount (defaults to the request amount). */
  invoiceMsats?: number;
  /** Omit the request's `amount` tag. */
  omitAmountTag?: boolean;
  comment?: string;
  /** Override the bolt11 description hash (defaults to sha256(description)). */
  descriptionHash?: string;
  /** Extra/replacement tags on the receipt (applied after defaults). */
  receiptTags?: (defaults: string[][]) => string[][];
  /** Extra/replacement tags on the request. */
  requestTags?: (defaults: string[][]) => string[][];
  createdAt?: number;
}

/** A signed zap request plus a receipt signed by `zapper`, following NIP-57 Appendix E. */
export function makeZapReceipt(opts: ZapFixtureOptions): { receipt: NostrEvent; request: NostrEvent; bolt11: string } {
  const amountMsats = opts.amountMsats ?? 21_000;
  const sender = opts.sender ?? generateSecretKey();

  const defaultRequestTags: string[][] = [
    ['p', opts.recipient],
    ...(opts.omitAmountTag ? [] : [['amount', String(amountMsats)]]),
    ['relays', 'wss://relay.example.com'],
    ...(opts.eventId ? [['e', opts.eventId]] : []),
  ];
  const request = finalizeEvent({
    kind: 9734,
    created_at: opts.createdAt ?? 1_700_000_000,
    content: opts.comment ?? '',
    tags: opts.requestTags ? opts.requestTags(defaultRequestTags) : defaultRequestTags,
  }, sender) as NostrEvent;
  const description = JSON.stringify(request);
  const bolt11 = makeBolt11({ amountMsats: opts.invoiceMsats ?? amountMsats, description, descriptionHash: opts.descriptionHash });

  const defaultReceiptTags: string[][] = [
    ['p', opts.recipient],
    ['P', request.pubkey],
    ...(opts.eventId ? [['e', opts.eventId]] : []),
    ['bolt11', bolt11],
    ['description', description],
  ];
  const receipt = finalizeEvent({
    kind: 9735,
    created_at: opts.createdAt ?? 1_700_000_001,
    content: '',
    tags: opts.receiptTags ? opts.receiptTags(defaultReceiptTags) : defaultReceiptTags,
  }, opts.zapper) as NostrEvent;

  return { receipt, request, bolt11 };
}
