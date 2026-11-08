import type { NostrMetadata } from '@nostrify/nostrify';
import { bech32Decode, wordsToBytes } from './bolt11';

const HEX_PUBKEY = /^[0-9a-f]{64}$/;
const LUD16_NAME = /^[a-z0-9._+-]+$/i;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i;

/**
 * The LNURL-pay endpoint for a profile: its `lud16` lightning address, or
 * failing that its bech32 `lud06`. Only `https:` URLs are returned — the
 * response decides which key may sign this person's zap receipts, so it must
 * not come over a channel an on-path attacker could rewrite.
 */
export function lnurlPayUrl(metadata: Pick<NostrMetadata, 'lud06' | 'lud16'> | undefined): string | null {
  const lud16 = metadata?.lud16?.trim();
  if (lud16) {
    const at = lud16.lastIndexOf('@');
    const name = lud16.slice(0, at);
    const domain = lud16.slice(at + 1);
    if (at < 1 || !LUD16_NAME.test(name) || !HOSTNAME.test(domain)) return null;
    return `https://${domain.toLowerCase()}/.well-known/lnurlp/${encodeURIComponent(name)}`;
  }

  const lud06 = metadata?.lud06?.trim();
  if (lud06) {
    const decoded = bech32Decode(lud06);
    if (!decoded || decoded.hrp !== 'lnurl') return null;
    try {
      const url = new URL(new TextDecoder().decode(wordsToBytes(decoded.words)));
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * The key a recipient's LNURL server signs NIP-57 zap receipts with, read
 * from its LNURL-pay response (NIP-57 Appendix C). Null when the server
 * doesn't support zaps (`allowsNostr` isn't `true`) or `nostrPubkey` isn't a
 * valid hex pubkey — in which case no zap receipt can be trusted for them.
 */
export async function fetchLnurlNostrPubkey(url: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== 'object') return null;

  const { allowsNostr, nostrPubkey } = body as { allowsNostr?: unknown; nostrPubkey?: unknown };
  if (allowsNostr !== true || typeof nostrPubkey !== 'string') return null;
  return HEX_PUBKEY.test(nostrPubkey) ? nostrPubkey : null;
}
