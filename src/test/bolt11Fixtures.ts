import { bech32 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Builds a structurally valid BOLT11 invoice for tests. The node signature is
 * zero-filled — the app never checks it (the paying wallet does) — but the
 * bech32 checksum, amount and tagged fields are real.
 */
export function buildTestInvoice(opts: {
  /** Human-readable part, e.g. `lnbc210n` (21 sats). */
  hrp: string;
  paymentHash?: string;
  /** The description the `h` field commits to (hashed here), or `null` for none. */
  description?: string | null;
  /** Raw hex `h` field value, overriding `description`. */
  descriptionHashHex?: string;
}): string {
  const paymentHash = opts.paymentHash ?? '00'.repeat(32);
  const words: number[] = new Array(7).fill(0); // timestamp

  const pushField = (type: number, hex: string) => {
    const data = bech32.toWords(hexBytes(hex));
    words.push(type, data.length >> 5, data.length & 31, ...data);
  };

  pushField(1, paymentHash);
  if (opts.descriptionHashHex) {
    pushField(23, opts.descriptionHashHex);
  } else if (opts.description !== null && opts.description !== undefined) {
    pushField(23, bytesToHex(sha256(utf8ToBytes(opts.description))));
  }

  words.push(...new Array(104).fill(0)); // signature + recovery id
  return bech32.encode(opts.hrp, words, false);
}

function hexBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}
