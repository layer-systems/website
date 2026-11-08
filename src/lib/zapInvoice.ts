import { bech32 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { decodeBolt11 } from './bolt11';

/**
 * The LNURL-pay (LUD-06) parameters a zap needs, as returned by the
 * recipient's pay endpoint and checked per NIP-57 step 1.
 */
export interface LnurlPayParams {
  callback: string;
  minSendable: number;
  maxSendable: number;
  /** LUD-12: maximum comment length in characters, or `null` if the server didn't say. */
  commentAllowed: number | null;
  nostrPubkey: string;
}

const HEX_PUBKEY = /^[0-9a-f]{64}$/;
const LUD16_NAME = /^[a-z0-9._+-]+$/i;

/**
 * Resolves the recipient's LNURL-pay URL from their kind-0 `lud16` (preferred)
 * or `lud06` field. Only `https://` URLs are accepted, so the pay parameters
 * can't be served (or tampered with) over plaintext HTTP.
 */
export function resolveLnurlPayUrl(metadataContent: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataContent);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { lud16, lud06 } = parsed as { lud16?: unknown; lud06?: unknown };

  if (typeof lud16 === 'string' && lud16.trim()) {
    const parts = lud16.trim().split('@');
    if (parts.length !== 2) return null;
    const [name, domain] = parts;
    if (!LUD16_NAME.test(name) || !domain) return null;
    let base: URL;
    try {
      base = new URL(`https://${domain}`);
    } catch {
      return null;
    }
    // Reject anything that smuggles a path, credentials or query into the domain part.
    if (base.host !== domain.toLowerCase() || base.pathname !== '/' || base.search || base.username) return null;
    return new URL(`/.well-known/lnurlp/${encodeURIComponent(name)}`, base).toString();
  }

  if (typeof lud06 === 'string' && lud06.trim()) {
    try {
      const { words } = bech32.decode(lud06.trim().toLowerCase(), false);
      const url = new TextDecoder().decode(bech32.fromWords(words));
      return url.startsWith('https://') ? url : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Validates an LNURL-pay response body. Returns `null` for anything that is
 * not a zap-capable (`allowsNostr` + valid `nostrPubkey`) pay request with
 * sane, https-only, positive millisat bounds.
 */
export function parseLnurlPayParams(body: unknown): LnurlPayParams | null {
  if (!body || typeof body !== 'object') return null;
  const {
    tag, callback, minSendable, maxSendable, commentAllowed, allowsNostr, nostrPubkey,
  } = body as Record<string, unknown>;

  if (tag !== undefined && tag !== 'payRequest') return null;
  if (allowsNostr !== true) return null;
  if (typeof nostrPubkey !== 'string' || !HEX_PUBKEY.test(nostrPubkey)) return null;
  if (typeof callback !== 'string' || !callback.startsWith('https://')) return null;
  try {
    new URL(callback);
  } catch {
    return null;
  }

  if (!isPositiveInteger(minSendable) || !isPositiveInteger(maxSendable) || minSendable > maxSendable) return null;

  return {
    callback,
    minSendable,
    maxSendable,
    commentAllowed:
      typeof commentAllowed === 'number' && Number.isInteger(commentAllowed) && commentAllowed >= 0
        ? commentAllowed
        : null,
    nostrPubkey,
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Checks a requested zap against the recipient's LNURL limits before anything
 * is signed or sent. Returns a user-facing error message, or `null` if fine.
 */
export function checkZapAgainstLnurlLimits(
  params: LnurlPayParams,
  amountMsats: number,
  comment: string,
): string | null {
  if (amountMsats < params.minSendable || amountMsats > params.maxSendable) {
    const min = Math.ceil(params.minSendable / 1000);
    const max = Math.floor(params.maxSendable / 1000);
    return min > max
      ? 'This person\'s wallet does not accept whole-sat zaps.'
      : `This person's wallet accepts zaps between ${min.toLocaleString()} and ${max.toLocaleString()} sats.`;
  }

  // LUD-12. NIP-57 carries the comment inside the zap request, but a server
  // that publishes a limit has told us what it will accept — honour it.
  const length = Array.from(comment).length;
  if (params.commentAllowed !== null && length > params.commentAllowed) {
    return params.commentAllowed === 0
      ? 'This person\'s wallet does not accept zap comments. Remove the comment and try again.'
      : `This person's wallet accepts comments up to ${params.commentAllowed} characters.`;
  }

  return null;
}

/**
 * Verifies an invoice returned by a zap callback before it is shown or paid:
 * its amount must equal exactly the millisats we asked for, and its
 * description hash must commit to the exact signed zap request JSON we sent
 * (NIP-57 step 6). Throws a user-facing error otherwise.
 *
 * Returns the invoice's payment hash, so a wallet's preimage can be checked
 * against it after paying.
 */
export function verifyZapInvoice(invoice: string, expectedAmountMsats: number, zapRequestJson: string): string {
  let decoded;
  try {
    decoded = decodeBolt11(invoice);
  } catch {
    throw new Error('The recipient\'s wallet returned an invalid invoice.');
  }

  if (decoded.amountMsats === null || decoded.amountMsats !== BigInt(expectedAmountMsats)) {
    throw new Error('The recipient\'s wallet returned an invoice for a different amount. It was not paid.');
  }

  const expectedHash = bytesToHex(sha256(utf8ToBytes(zapRequestJson)));
  if (decoded.descriptionHash !== expectedHash) {
    throw new Error('The recipient\'s wallet returned an invoice that does not match this zap. It was not paid.');
  }

  return decoded.paymentHash;
}

/** True if `preimage` (hex) hashes to `paymentHash` (hex) — the wallet's proof that this invoice was paid. */
export function preimageMatchesPaymentHash(preimage: string, paymentHash: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(preimage)) return false;
  return bytesToHex(sha256(hexToBytes(preimage.toLowerCase()))) === paymentHash.toLowerCase();
}
