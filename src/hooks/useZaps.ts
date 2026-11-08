import { useNostr } from '@nostrify/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip57 } from 'nostr-tools';
import { eventAddress, validateZapReceipts, ZAP_RECEIPT_KIND, type ValidZapReceipt } from '@/lib/zapReceipts';
import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { useZapperPubkey } from './useZapperPubkey';

function zapReceiptsQueryKey(eventId: string, zapperPubkey: string | null | undefined) {
  return ['nostr', 'zap-receipts', eventId, zapperPubkey ?? ''] as const;
}

/**
 * Validated NIP-57 zap receipts for `target`. Pass `enabled: false` until the
 * caller actually needs the total — a note list mounts one of these per row,
 * and firing all of them unconditionally turns a page of notes into a page of
 * relay queries (an N+1 pattern) before anyone's looked at any of them.
 *
 * Receipts are only trusted from the target author's LNURL server
 * `nostrPubkey` (resolved and cached per author by `useZapperPubkey`), so the
 * relay query is constrained with `authors`, and every result is then checked
 * by `validateZapReceipts` (recipient, target, amount, description hash).
 * When the author has no zap-capable lightning address, nothing is trusted
 * and this resolves to an empty list.
 */
export function useZapReceipts(
  target: NostrEvent | undefined,
  opts?: { refetchInterval?: number | false; enabled?: boolean },
) {
  const { nostr } = useNostr();
  const enabled = Boolean(target) && (opts?.enabled ?? true);
  const zapper = useZapperPubkey(target?.pubkey, { enabled });
  const zapperPubkey = zapper.data;

  return useQuery<ValidZapReceipt[]>({
    queryKey: zapReceiptsQueryKey(target?.id ?? '', zapperPubkey),
    enabled: enabled && zapper.isSuccess,
    queryFn: async ({ signal }) => {
      if (!target || !zapperPubkey) return [];
      const events = await nostr.query(
        [{ kinds: [ZAP_RECEIPT_KIND], authors: [zapperPubkey], '#e': [target.id], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return validateZapReceipts(events, {
        zapperPubkey,
        recipientPubkey: target.pubkey,
        eventId: target.id,
        address: eventAddress(target),
      });
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
 * Totals receipts that already passed `validateZapReceipts` (which also
 * de-duplicates them). Raw relay events must never be summed: anyone can sign
 * a kind 9735 event.
 */
export function summarizeZapReceipts(receipts: ValidZapReceipt[] | undefined): ZapSummary {
  let totalSats = 0;
  let count = 0;
  for (const receipt of receipts ?? []) {
    if (receipt.amountSats <= 0) continue;
    totalSats += receipt.amountSats;
    count++;
  }
  return { totalSats, count };
}

/**
 * True if any validated receipt pays exactly `invoice`. Used to confirm a
 * specific manual payment — checking whether the note's receipt *count* went
 * up is not enough, since anyone else zapping the same note while the payer
 * is waiting would also bump the count and falsely confirm a still-unpaid
 * invoice.
 */
export function hasValidReceiptForInvoice(receipts: ValidZapReceipt[] | undefined, invoice: string): boolean {
  const wanted = invoice.trim().toLowerCase();
  return (receipts ?? []).some((receipt) => receipt.bolt11.trim().toLowerCase() === wanted);
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
}

/**
 * Builds and signs a NIP-57 zap request, then asks the recipient's LNURL
 * callback for an invoice. This never touches a wallet — it only produces a
 * bolt11 for the caller to pay, manually or via NWC.
 */
export function useCreateZapInvoice() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation<ZapInvoice, Error, CreateZapInvoiceInput>({
    mutationFn: async ({ target, recipientMetadata, amountSats, comment }) => {
      if (!user) throw new Error('Sign in to zap');
      if (!Number.isFinite(amountSats) || amountSats <= 0) {
        throw new Error('Enter an amount greater than zero.');
      }

      const endpoint = await nip57.getZapEndpoint(recipientMetadata);
      if (!endpoint) {
        throw new Error('This person has not set up zaps on their Nostr profile.');
      }
      if (!endpoint.startsWith('https://')) {
        throw new Error('This person\'s zap endpoint is not secure.');
      }

      const relays = config.relayMetadata.relays.filter((relay) => relay.read).map((relay) => relay.url);
      const amountMsats = Math.round(amountSats * 1000);

      const template = nip57.makeZapRequest({
        event: target,
        amount: amountMsats,
        comment: comment ?? '',
        relays: relays.length > 0 ? relays : config.relayMetadata.relays.map((relay) => relay.url),
      });
      const signed = await user.signer.signEvent(template);

      const url = new URL(endpoint);
      url.searchParams.set('amount', String(amountMsats));
      url.searchParams.set('nostr', JSON.stringify(signed));

      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
      const body: { status?: string; reason?: string; pr?: string } = await response.json().catch(() => ({}));

      if (!response.ok || body.status === 'ERROR' || !body.pr) {
        throw new Error(body.reason || 'The recipient\'s Lightning wallet declined the request.');
      }

      return { invoice: body.pr, amountSats };
    },
  });
}
