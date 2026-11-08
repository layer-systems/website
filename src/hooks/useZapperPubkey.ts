import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchLnurlNostrPubkey, lnurlPayUrl } from '@/lib/lnurl';
import { authorQueryOptions, type AuthorData } from './useAuthor';

type NostrClient = ReturnType<typeof useNostr>['nostr'];

const LNURL_STALE_TIME = 60 * 60 * 1000;

export function zapperPubkeyQueryKey(pubkey: string) {
  return ['nostr', 'zapper-pubkey', pubkey] as const;
}

/**
 * Resolves the key a person's LNURL server signs their zap receipts with
 * (NIP-57 protocol flow step 1): their kind-0 `lud16`/`lud06` → the LNURL-pay
 * JSON → `nostrPubkey`. The LNURL response is cached per URL, and callers
 * cache the result per recipient (`useZapperPubkey`), so every note by the
 * same author shares one lookup.
 *
 * Resolves to null when the person has no zap-capable lightning address or
 * it can't be reached; callers must then treat every receipt as untrusted.
 */
export async function fetchZapperPubkey(
  nostr: NostrClient,
  queryClient: QueryClient,
  pubkey: string,
): Promise<string | null> {
  try {
    // Reuse a profile already in the cache, but don't join an in-flight
    // `useAuthor` fetch: its retries (with backoff) would stall callers like
    // the notification feed for seconds when someone has no kind 0 at all.
    const authorOptions = authorQueryOptions(nostr, pubkey);
    const author = queryClient.getQueryData<AuthorData>(authorOptions.queryKey) ?? await authorOptions.queryFn();
    const url = lnurlPayUrl(author.metadata);
    if (!url) return null;

    return await queryClient.fetchQuery({
      queryKey: ['lnurl-pay', 'nostr-pubkey', url] as const,
      // Shared by every caller, so bounded by a timeout rather than any one
      // caller's abort signal.
      queryFn: () => fetchLnurlNostrPubkey(url, AbortSignal.timeout(6000)),
      staleTime: LNURL_STALE_TIME,
    });
  } catch {
    return null;
  }
}

/** `fetchZapperPubkey` as a query, cached per recipient. */
export function useZapperPubkey(pubkey: string | undefined, opts?: { enabled?: boolean }) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<string | null>({
    queryKey: zapperPubkeyQueryKey(pubkey ?? ''),
    enabled: Boolean(pubkey) && (opts?.enabled ?? true),
    queryFn: () => fetchZapperPubkey(nostr, queryClient, pubkey!),
    // A null may just be a profile or LNURL server that didn't answer in
    // time, so retry it soon instead of hiding someone's zaps for an hour.
    staleTime: (query) => (query.state.data ? LNURL_STALE_TIME : 60_000),
  });
}
