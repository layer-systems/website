import { useQuery } from '@tanstack/react-query';
import { nip05 } from 'nostr-tools';

const HEX_PUBKEY = /^[0-9a-f]{64}$/;
const LOOKUP_TIMEOUT_MS = 6000;

/**
 * Ask the identifier's domain which public key it maps to. Unlike nostr-tools'
 * `queryProfile`, this can be cancelled and gives up after a timeout, so an
 * unresponsive domain does not leave a request open indefinitely.
 */
async function resolveNip05(identifier: string, signal: AbortSignal): Promise<string | null> {
  const match = identifier.match(nip05.NIP05_REGEX);
  if (!match) return null;
  const [, name = '_', domain] = match;

  const response = await fetch(
    `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
    // NIP-05: fetchers must ignore redirects.
    { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(LOOKUP_TIMEOUT_MS)]) },
  );
  if (response.status !== 200) return null;

  const json: unknown = await response.json();
  if (typeof json !== 'object' || json === null) return null;
  const names = (json as { names?: unknown }).names;
  if (typeof names !== 'object' || names === null || !Object.hasOwn(names, name)) return null;
  const pubkey = (names as Record<string, unknown>)[name];
  return typeof pubkey === 'string' ? pubkey.toLowerCase() : null;
}

/** Only expose an identifier after its domain confirms the author's public key. */
export function useNip05(pubkey: string | undefined, identifier: string | undefined) {
  // NIP-05 local parts are case-insensitive; domains publish them in lowercase.
  const normalized = typeof identifier === 'string' ? identifier.trim().toLowerCase() : undefined;
  const validInput = normalized !== undefined && nip05.isNip05(normalized)
    && typeof pubkey === 'string' && HEX_PUBKEY.test(pubkey);

  return useQuery({
    queryKey: ['nostr', 'nip05', pubkey, normalized],
    enabled: validInput,
    queryFn: async ({ signal }) => {
      if (!validInput) return null;
      try {
        if (await resolveNip05(normalized, signal) !== pubkey) return null;
        return normalized.replace(/^_@/, '');
      } catch {
        return null;
      }
    },
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: false,
  });
}
