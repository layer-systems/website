import { nip04, nip47, utils } from 'nostr-tools';
import type { NostrEvent, NPool } from '@nostrify/nostrify';

const HEX_64 = /^[0-9a-f]{64}$/i;
const NWC_WALLET_RESPONSE_KIND = 23195;

/**
 * A parsed Nostr Wallet Connect link. The `secret` is a private key that
 * authorizes payments from the user's wallet — treat it exactly like any
 * other private key: never log it, render it, publish it, or send it
 * anywhere but the wallet's own relay.
 */
export interface NwcConnection {
  pubkey: string;
  relay: string;
  secret: string;
}

/**
 * Parses a `nostr+walletconnect://` (or legacy `nostrwalletconnect://`) URI.
 * Throws a message safe to show the user rather than leaking parser
 * internals; never includes the secret in that message.
 */
export function parseNwcUri(uri: string): NwcConnection {
  const trimmed = uri.trim();
  if (!/^nostr\+?walletconnect:\/\//i.test(trimmed)) {
    throw new Error('That doesn\'t look like a Nostr Wallet Connect link.');
  }

  let parsed: { pubkey: string; relay: string; secret: string };
  try {
    parsed = nip47.parseConnectionString(trimmed);
  } catch {
    throw new Error('Could not read that Wallet Connect link.');
  }

  if (!HEX_64.test(parsed.pubkey) || !HEX_64.test(parsed.secret)) {
    throw new Error('That Wallet Connect link is missing a valid key.');
  }
  if (!parsed.relay.startsWith('wss://') && !parsed.relay.startsWith('ws://')) {
    throw new Error('That Wallet Connect link has an invalid relay.');
  }

  return { pubkey: parsed.pubkey.toLowerCase(), relay: parsed.relay, secret: parsed.secret.toLowerCase() };
}

interface NwcPayResult {
  result_type?: string;
  error?: { code?: string; message?: string };
  result?: { preimage?: string };
}

/**
 * Pays a bolt11 invoice through a NIP-47 wallet: signs and publishes an
 * encrypted `pay_invoice` request to the wallet's own relay, then waits for
 * its encrypted response. Resolves with the payment preimage — proof of
 * payment — and never resolves on anything less; a `result_type` mismatch or
 * missing preimage is treated as a failure, not a success.
 */
export async function payInvoiceViaNwc(
  nostr: NPool,
  connection: NwcConnection,
  invoice: string,
  opts?: { timeoutMs?: number },
): Promise<string> {
  const secretKey = utils.hexToBytes(connection.secret);
  const requestEvent = await nip47.makeNwcRequestEvent(connection.pubkey, secretKey, invoice);
  const signal = AbortSignal.timeout(opts?.timeoutMs ?? 60_000);

  const waitForResponse = (async (): Promise<NostrEvent | undefined> => {
    try {
      for await (const msg of nostr.req(
        [{ kinds: [NWC_WALLET_RESPONSE_KIND], authors: [connection.pubkey], '#e': [requestEvent.id], limit: 1 }],
        { relays: [connection.relay], signal },
      )) {
        if (msg[0] === 'EVENT') return msg[2];
      }
    } catch {
      // Aborted or the relay dropped — fall through to the timeout error below.
    }
    return undefined;
  })();

  await nostr.event(requestEvent, { relays: [connection.relay], signal });
  const response = await waitForResponse;

  if (!response) {
    throw new Error('Your wallet did not respond in time.');
  }

  let payload: NwcPayResult;
  try {
    const decrypted = nip04.decrypt(secretKey, connection.pubkey, response.content);
    payload = JSON.parse(decrypted);
  } catch {
    throw new Error('Could not read your wallet\'s response.');
  }

  if (payload.error) {
    throw new Error(payload.error.message || 'Your wallet declined the payment.');
  }
  if (payload.result_type !== 'pay_invoice' || !payload.result?.preimage) {
    throw new Error('Your wallet did not confirm the payment.');
  }

  return payload.result.preimage;
}
