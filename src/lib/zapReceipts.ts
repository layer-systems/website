import type { NostrEvent } from '@nostrify/nostrify';
import { nip57 } from 'nostr-tools';
import { decodeBolt11, type DecodedBolt11 } from './bolt11';

export const ZAP_RECEIPT_KIND = 9735;
const ZAP_REQUEST_KIND = 9734;

/** What a zap receipt must match to be trusted (NIP-57 Appendix F). */
export interface ZapReceiptExpectation {
  /** The recipient's LNURL server `nostrPubkey` — the only key allowed to sign their receipts. */
  zapperPubkey: string;
  /** The person being zapped. */
  recipientPubkey: string;
  /** When validating zaps on a specific note: its id. */
  eventId?: string;
  /** When that note is (parameterized) replaceable: its `kind:pubkey:d` coordinate. */
  address?: string;
}

export interface ValidZapReceipt {
  receipt: NostrEvent;
  /** The signature-verified zap request embedded in the receipt. */
  request: NostrEvent;
  /** Who paid — the zap request's signer, never the receipt's (server) pubkey. */
  sender: string;
  bolt11: string;
  amountMsats: number;
  amountSats: number;
  /** The sender's zap comment (the zap request's content). */
  comment: string;
}

function values(event: NostrEvent, name: string): string[] {
  return event.tags.filter(([tag]) => tag === name).map(([, value]) => value ?? '');
}

/** Every `name` tag on the receipt must equal the request's single one, or be absent from both. */
function mirrors(receipt: NostrEvent, request: NostrEvent, name: string): boolean {
  const ours = values(receipt, name);
  const theirs = values(request, name);
  if (theirs.length > 1) return false;
  if (theirs.length === 0) return ours.length === 0;
  return ours.length > 0 && ours.every((value) => value === theirs[0]);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The `kind:pubkey:d` coordinate for a replaceable or addressable event, if it is one. */
export function eventAddress(event: Pick<NostrEvent, 'kind' | 'pubkey' | 'tags'>): string | undefined {
  const replaceable = event.kind === 0 || event.kind === 3 || (event.kind >= 10000 && event.kind < 20000);
  const addressable = event.kind >= 30000 && event.kind < 40000;
  if (replaceable) return `${event.kind}:${event.pubkey}:`;
  if (addressable) {
    const d = event.tags.find(([tag]) => tag === 'd')?.[1] ?? '';
    return `${event.kind}:${event.pubkey}:${d}`;
  }
  return undefined;
}

/**
 * Validates a NIP-57 zap receipt against who it claims to pay and what for.
 * A receipt counts only if:
 *
 * - it is signed by the recipient's LNURL server `nostrPubkey`;
 * - its `description` is a signature-valid kind 9734 zap request with exactly
 *   one `p` tag naming the recipient, and the receipt's own `p`/`e`/`a` tags
 *   mirror the request's;
 * - when a target note is given, the request's `e` (and `a`, if any) point at it;
 * - its `P` tag, if present, names the request's signer;
 * - its `bolt11` decodes to a positive amount equal to the request's `amount`
 *   tag (when present), and the invoice's `description_hash` (when present)
 *   equals `sha256(description)`.
 *
 * Even a valid receipt is not proof of payment — NIP-57 inherently trusts the
 * recipient's LNURL server — but it can no longer be forged by anyone else.
 */
export async function validateZapReceipt(
  receipt: NostrEvent,
  expected: ZapReceiptExpectation,
): Promise<ValidZapReceipt | null> {
  if (receipt.kind !== ZAP_RECEIPT_KIND || receipt.pubkey !== expected.zapperPubkey) return null;

  const bolt11 = values(receipt, 'bolt11')[0];
  const description = values(receipt, 'description')[0];
  if (!bolt11 || !description) return null;
  if (nip57.validateZapRequest(description) !== null) return null;

  const request = JSON.parse(description) as NostrEvent;
  if (request.kind !== ZAP_REQUEST_KIND) return null;

  // Recipient: exactly one `p` on the request, mirrored by the receipt.
  const requestRecipients = values(request, 'p');
  if (requestRecipients.length !== 1 || requestRecipients[0] !== expected.recipientPubkey) return null;
  if (!mirrors(receipt, request, 'p')) return null;

  // Target: the receipt must carry the request's `e`/`a`, and both must be the expected note.
  if (!mirrors(receipt, request, 'e') || !mirrors(receipt, request, 'a')) return null;
  const requestEvent = values(request, 'e')[0];
  const requestAddress = values(request, 'a')[0];
  if (expected.eventId !== undefined) {
    if (requestEvent !== expected.eventId) return null;
    if (requestAddress !== undefined && requestAddress !== expected.address) return null;
  }

  // Sender: an optional `P` must agree with the request's signer.
  const senders = values(receipt, 'P');
  if (senders.length > 1 || (senders.length === 1 && senders[0] !== request.pubkey)) return null;

  // Amount: the invoice must be for exactly what the sender asked to pay.
  let invoice: DecodedBolt11;
  try {
    invoice = decodeBolt11(bolt11);
  } catch {
    return null;
  }
  if (invoice.amountMsats === null || invoice.amountMsats <= 0n) return null;
  const requestedAmounts = values(request, 'amount');
  if (requestedAmounts.length > 1) return null;
  if (requestedAmounts.length === 1) {
    if (!/^\d+$/.test(requestedAmounts[0]) || BigInt(requestedAmounts[0]) !== invoice.amountMsats) return null;
  }
  if (invoice.amountMsats > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  if (invoice.descriptionHash !== null && invoice.descriptionHash !== await sha256Hex(description)) {
    return null;
  }

  const amountMsats = Number(invoice.amountMsats);
  return {
    receipt,
    request,
    sender: request.pubkey,
    bolt11,
    amountMsats,
    amountSats: Math.floor(amountMsats / 1000),
    comment: request.content,
  };
}

/**
 * Validates many receipts, dropping invalid ones and duplicates — by receipt
 * id, and by invoice, so a server re-publishing a receipt for the same
 * payment doesn't count it twice.
 */
export async function validateZapReceipts(
  receipts: NostrEvent[],
  expected: ZapReceiptExpectation,
): Promise<ValidZapReceipt[]> {
  const results = await Promise.all(receipts.map((receipt) => validateZapReceipt(receipt, expected).catch(() => null)));
  const seenIds = new Set<string>();
  const seenInvoices = new Set<string>();
  const valid: ValidZapReceipt[] = [];
  for (const result of results) {
    if (!result) continue;
    const invoice = result.bolt11.toLowerCase();
    if (seenIds.has(result.receipt.id) || seenInvoices.has(invoice)) continue;
    seenIds.add(result.receipt.id);
    seenInvoices.add(invoice);
    valid.push(result);
  }
  return valid;
}
