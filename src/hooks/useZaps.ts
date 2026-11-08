import { useNostr } from '@nostrify/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip57 } from 'nostr-tools';
import { tagValue } from '@/lib/nostrUtils';
import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import {
  checkZapAgainstLnurlLimits,
  parseLnurlPayParams,
  resolveLnurlPayUrl,
  verifyZapInvoice,
  type LnurlPayParams,
} from '@/lib/zapInvoice';

const ZAP_RECEIPT_KIND = 9735;

function zapReceiptsQueryKey(eventId: string) {
  return ['nostr', 'zap-receipts', eventId] as const;
}

/**
 * NIP-57 zap receipts (kind 9735) referencing `eventId`. Pass `enabled: false`
 * until the caller actually needs the total — a note list mounts one of these
 * per row, and firing all of them unconditionally turns a page of notes into
 * a page of relay queries (an N+1 pattern) before anyone's looked at any of
 * them.
 */
export function useZapReceipts(eventId: string | undefined, opts?: { refetchInterval?: number | false; enabled?: boolean }) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: zapReceiptsQueryKey(eventId ?? ''),
    enabled: Boolean(eventId) && (opts?.enabled ?? true),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [ZAP_RECEIPT_KIND], '#e': [eventId!], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events;
    },
    staleTime: 30_000,
    refetchInterval: opts?.refetchInterval,
  });
}

export interface ZapSummary {
  totalSats: number;
  count: number;
}

/**
 * Sums zap receipts defensively: a receipt only counts if it carries a
 * `bolt11` invoice and a `description` whose embedded zap request is a
 * well-formed, signature-valid Nostr event. That rules out garbage a relay
 * happens to serve back — malformed data, or a request signature that
 * doesn't check out — but it is not proof any payment actually happened.
 * NIP-57 receipts are published by the recipient's own LNURL server, so
 * trusting that a receipt means "paid" is inherent to the protocol; this
 * validation only keeps structurally-invalid noise out of the total.
 */
export function summarizeZapReceipts(events: NostrEvent[] | undefined): ZapSummary {
  const seen = new Set<string>();
  let totalSats = 0;
  let count = 0;

  for (const receipt of events ?? []) {
    if (seen.has(receipt.id)) continue;
    seen.add(receipt.id);

    const bolt11 = tagValue(receipt, 'bolt11');
    const description = tagValue(receipt, 'description');
    if (!bolt11 || !description) continue;
    if (nip57.validateZapRequest(description) !== null) continue;

    const sats = nip57.getSatoshisAmountFromBolt11(bolt11);
    if (sats <= 0) continue;

    totalSats += sats;
    count++;
  }

  return { totalSats, count };
}

/**
 * True if any signature-valid receipt among `events` pays exactly `invoice`.
 * Used to confirm a specific manual payment — checking whether the note's
 * receipt *count* went up is not enough, since anyone else zapping the same
 * note while the payer is waiting would also bump the count and falsely
 * confirm a still-unpaid invoice.
 */
export function hasValidReceiptForInvoice(events: NostrEvent[] | undefined, invoice: string): boolean {
  return (events ?? []).some((receipt) => {
    const bolt11 = tagValue(receipt, 'bolt11');
    const description = tagValue(receipt, 'description');
    return bolt11 === invoice && Boolean(description) && nip57.validateZapRequest(description!) === null;
  });
}

/** "1.2K" for 1234 — compact, locale-aware, and never wraps a note's action row. */
export function formatSats(sats: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(sats);
}

export interface CreateZapInvoiceInput {
  /** The note or reply being zapped. */
  target: NostrEvent;
  /** The recipient's kind-0 metadata event — needed to resolve their LNURL/lud16 zap endpoint. */
  recipientMetadata: NostrEvent;
  amountSats: number;
  comment?: string;
}

export interface ZapInvoice {
  invoice: string;
  amountSats: number;
  /** Hex payment hash of `invoice`, for checking a wallet's preimage after paying. */
  paymentHash: string;
}

/**
 * Builds and signs a NIP-57 zap request, then asks the recipient's LNURL
 * callback for an invoice. This never touches a wallet — it only produces a
 * bolt11 for the caller to pay, manually or via NWC.
 *
 * The recipient's LNURL server is untrusted: before the invoice is returned
 * (and possibly auto-paid over NWC) its amount must equal the requested
 * millisats and its description hash must commit to the exact zap request
 * JSON that was sent. The LNURL `minSendable`/`maxSendable` and
 * `commentAllowed` limits are checked before anything is signed.
 */
export function useCreateZapInvoice() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation<ZapInvoice, Error, CreateZapInvoiceInput>({
    mutationFn: async ({ target, recipientMetadata, amountSats, comment }) => {
      if (!user) throw new Error('Sign in to zap');
      if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
        throw new Error('Enter a whole number of sats greater than zero.');
      }

      const payUrl = resolveLnurlPayUrl(recipientMetadata.content);
      if (!payUrl) {
        throw new Error('This person has not set up zaps on their Nostr profile.');
      }

      let params: LnurlPayParams | null = null;
      try {
        const response = await fetch(payUrl, { signal: AbortSignal.timeout(10_000) });
        if (response.ok) params = parseLnurlPayParams(await response.json());
      } catch {
        params = null;
      }
      if (!params) {
        throw new Error('This person\'s Lightning wallet does not support zaps.');
      }

      const amountMsats = amountSats * 1000;
      const zapComment = comment ?? '';
      const limitError = checkZapAgainstLnurlLimits(params, amountMsats, zapComment);
      if (limitError) throw new Error(limitError);

      const relays = config.relayMetadata.relays.filter((relay) => relay.read).map((relay) => relay.url);

      const template = nip57.makeZapRequest({
        event: target,
        amount: amountMsats,
        comment: zapComment,
        relays: relays.length > 0 ? relays : config.relayMetadata.relays.map((relay) => relay.url),
      });
      const signed = await user.signer.signEvent(template);
      // The exact string sent is what the invoice's description hash must commit to.
      const zapRequestJson = JSON.stringify(signed);

      const url = new URL(params.callback);
      url.searchParams.set('amount', String(amountMsats));
      url.searchParams.set('nostr', zapRequestJson);

      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
      const body: { status?: string; reason?: string; pr?: string } = await response.json().catch(() => ({}));

      if (!response.ok || body.status === 'ERROR' || typeof body.pr !== 'string' || !body.pr) {
        throw new Error(body.reason || 'The recipient\'s Lightning wallet declined the request.');
      }

      const paymentHash = verifyZapInvoice(body.pr, amountMsats, zapRequestJson);

      return { invoice: body.pr, amountSats, paymentHash };
    },
  });
}
