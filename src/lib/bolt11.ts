/**
 * Minimal, dependency-free decoders for the two Lightning encodings NIP-57
 * needs: bech32 (used by bolt11 invoices and LUD-06 `lnurl` strings) and the
 * parts of a BOLT-11 invoice that zap receipt validation relies on — the
 * amount and the `description_hash`.
 *
 * This does not verify the invoice's node signature. There is no trust anchor
 * for the node key in NIP-57; the zap receipt's author (the recipient's LNURL
 * server) is what vouches for the invoice.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GENERATOR[i];
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/**
 * Decodes a bech32 string with a verified checksum and no length limit
 * (bolt11 invoices routinely exceed BIP-173's 90 characters). Returns the
 * lowercased human-readable part and the 5-bit data words, checksum removed.
 */
export function bech32Decode(input: string): { hrp: string; words: number[] } | null {
  if (input !== input.toLowerCase() && input !== input.toUpperCase()) return null;
  const str = input.toLowerCase();
  const separator = str.lastIndexOf('1');
  if (separator < 1 || separator + 7 > str.length) return null;

  const hrp = str.slice(0, separator);
  for (let i = 0; i < hrp.length; i++) {
    const code = hrp.charCodeAt(i);
    if (code < 33 || code > 126) return null;
  }

  const words: number[] = [];
  for (const char of str.slice(separator + 1)) {
    const value = CHARSET.indexOf(char);
    if (value === -1) return null;
    words.push(value);
  }

  if (polymod([...hrpExpand(hrp), ...words]) !== 1) return null;
  return { hrp, words: words.slice(0, -6) };
}

/** Regroups 5-bit words into bytes, dropping incomplete trailing padding bits. */
export function wordsToBytes(words: number[]): Uint8Array {
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const word of words) {
    acc = (acc << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 0xff);
    }
    acc &= (1 << bits) - 1;
  }
  return new Uint8Array(bytes);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface DecodedBolt11 {
  /** Invoice amount in millisatoshis, or undefined for an "any amount" invoice. */
  amountMsats?: bigint;
  /** Hex SHA-256 the invoice commits to as its description (`h` field). */
  descriptionHash?: string;
  /** Hex payment hash (`p` field). */
  paymentHash?: string;
}

/** Millisatoshis per one unit of each BOLT-11 amount multiplier. 1 BTC = 10^11 msat. */
const MULTIPLIER_MSATS: Record<string, bigint> = {
  m: 100_000_000n,
  u: 100_000n,
  n: 100n,
};

const TIMESTAMP_WORDS = 7;
const SIGNATURE_WORDS = 104;
const FIELD_PAYMENT_HASH = 1;
const FIELD_DESCRIPTION_HASH = 23;

/**
 * Decodes a BOLT-11 invoice's amount and hash fields. Returns null for any
 * string that isn't a well-formed, checksum-valid Lightning invoice.
 */
export function decodeBolt11(invoice: string): DecodedBolt11 | null {
  const decoded = bech32Decode(invoice.trim());
  if (!decoded) return null;

  const match = /^ln(?:bcrt|bc|tbs|tb|sb)(\d+)?([munp])?$/.exec(decoded.hrp);
  if (!match) return null;
  const [, digits, multiplier] = match;

  let amountMsats: bigint | undefined;
  if (digits !== undefined) {
    if (digits.length > 1 && digits.startsWith('0')) return null;
    const value = BigInt(digits);
    if (multiplier === 'p') {
      // Pico-BTC is a tenth of a millisatoshi; BOLT-11 requires it to be whole msats.
      if (value % 10n !== 0n) return null;
      amountMsats = value / 10n;
    } else if (multiplier) {
      amountMsats = value * MULTIPLIER_MSATS[multiplier];
    } else {
      amountMsats = value * 100_000_000_000n;
    }
  } else if (multiplier) {
    return null;
  }

  const { words } = decoded;
  if (words.length < TIMESTAMP_WORDS + SIGNATURE_WORDS) return null;
  const fields = words.slice(TIMESTAMP_WORDS, words.length - SIGNATURE_WORDS);

  const result: DecodedBolt11 = { amountMsats };
  let index = 0;
  while (index < fields.length) {
    if (index + 3 > fields.length) return null;
    const type = fields[index];
    const length = fields[index + 1] * 32 + fields[index + 2];
    const data = fields.slice(index + 3, index + 3 + length);
    if (data.length !== length) return null;
    index += 3 + length;

    // A hash field must be exactly 52 words (256 bits + 4 padding bits);
    // readers skip other lengths, per BOLT-11.
    if (length !== 52) continue;
    if (type === FIELD_DESCRIPTION_HASH && result.descriptionHash === undefined) {
      result.descriptionHash = toHex(wordsToBytes(data));
    } else if (type === FIELD_PAYMENT_HASH && result.paymentHash === undefined) {
      result.paymentHash = toHex(wordsToBytes(data));
    }
  }

  return result;
}
