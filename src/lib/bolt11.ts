import { bech32 } from '@scure/base';

/**
 * The parts of a BOLT11 invoice this app needs in order to decide whether an
 * invoice is safe to pay. This is a deliberately small reader: it decodes the
 * bech32 envelope, the human-readable amount and the `p` (payment hash) and
 * `h` (description hash) tagged fields. It does not verify the node
 * signature — the wallet doing the paying does that — but it is strict about
 * everything it does read, so a malformed invoice is rejected instead of
 * half-parsed.
 */
export interface DecodedBolt11 {
  /** The invoice amount in millisatoshis, or `null` for an "any amount" invoice. */
  amountMsats: bigint | null;
  /** Hex-encoded 32-byte payment hash. */
  paymentHash: string;
  /** Hex-encoded 32-byte description hash, if the invoice commits to one. */
  descriptionHash: string | null;
}

/** Millisatoshis per unit for each BOLT11 amount multiplier, scaled by 10 so `p` (0.1 msat) stays integral. */
const MSAT_TENTHS_PER_UNIT: Record<string, bigint> = {
  '': 1_000_000_000_000n, // 1 BTC = 1e11 msat
  m: 1_000_000_000n,
  u: 1_000_000n,
  n: 1_000n,
  p: 1n,
};

/** Length in 5-bit words of the timestamp field and the trailing recoverable signature. */
const TIMESTAMP_WORDS = 7;
const SIGNATURE_WORDS = 104;
/** A 32-byte hash is 256 bits, packed into 52 five-bit words. */
const HASH_WORDS = 52;

const TAG_PAYMENT_HASH = 1;
const TAG_DESCRIPTION_HASH = 23;

function wordsToHex(words: number[]): string {
  // 52 words carry 260 bits for a 256-bit hash; the trailing 4 bits are padding.
  const bytes = bech32.fromWordsUnsafe(words);
  if (!bytes || bytes.length < 32) throw new Error('Malformed hash in invoice.');
  return Array.from(bytes.subarray(0, 32), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseAmount(hrp: string): bigint | null {
  // "ln" + currency prefix (letters only) + optional amount + optional multiplier.
  const match = /^ln([a-z]+?)(?:(\d+)([munp])?)?$/.exec(hrp);
  if (!match) throw new Error('Not a Lightning invoice.');

  const [, , digits, multiplier = ''] = match;
  if (digits === undefined) return null;
  if (digits.length > 1 && digits.startsWith('0')) throw new Error('Malformed invoice amount.');

  const tenths = BigInt(digits) * MSAT_TENTHS_PER_UNIT[multiplier];
  // A pico-bitcoin amount that is not a whole millisatoshi is invalid per BOLT11.
  if (tenths % 10n !== 0n) throw new Error('Malformed invoice amount.');
  const msats = tenths / 10n;
  if (msats <= 0n) throw new Error('Malformed invoice amount.');
  return msats;
}

/** Decodes the fields of a BOLT11 invoice needed to verify a zap. Throws on anything malformed. */
export function decodeBolt11(invoice: string): DecodedBolt11 {
  if (typeof invoice !== 'string' || invoice.length === 0) throw new Error('Missing invoice.');

  // bech32 forbids mixed case; an all-uppercase invoice (as in QR codes) is valid.
  if (invoice !== invoice.toLowerCase() && invoice !== invoice.toUpperCase()) {
    throw new Error('Malformed invoice.');
  }
  const normalized = invoice.toLowerCase();

  let decoded: { prefix: string; words: number[] };
  try {
    decoded = bech32.decode(normalized, false);
  } catch {
    throw new Error('Malformed invoice.');
  }

  const amountMsats = parseAmount(decoded.prefix);
  const { words } = decoded;
  if (words.length < TIMESTAMP_WORDS + SIGNATURE_WORDS) throw new Error('Malformed invoice.');

  const fields = words.slice(TIMESTAMP_WORDS, words.length - SIGNATURE_WORDS);
  let paymentHash: string | null = null;
  let descriptionHash: string | null = null;
  let paymentHashCount = 0;
  let descriptionHashCount = 0;

  for (let i = 0; i < fields.length; ) {
    if (i + 3 > fields.length) throw new Error('Malformed invoice.');
    const type = fields[i];
    const length = fields[i + 1] * 32 + fields[i + 2];
    const start = i + 3;
    const end = start + length;
    if (end > fields.length) throw new Error('Malformed invoice.');
    const data = fields.slice(start, end);

    // BOLT11: readers MUST skip `p` and `h` fields that are not exactly 52 words.
    if (type === TAG_PAYMENT_HASH && length === HASH_WORDS) {
      paymentHash = wordsToHex(data);
      paymentHashCount++;
    } else if (type === TAG_DESCRIPTION_HASH && length === HASH_WORDS) {
      descriptionHash = wordsToHex(data);
      descriptionHashCount++;
    }

    i = end;
  }

  if (paymentHashCount !== 1 || !paymentHash) throw new Error('Invoice is missing a payment hash.');
  // More than one description hash is ambiguous — refuse rather than pick one.
  if (descriptionHashCount > 1) throw new Error('Invoice has more than one description hash.');

  return { amountMsats, paymentHash, descriptionHash };
}
