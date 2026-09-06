import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from './useNostrPublish';

/** NIP-84 "Highlights": a highlighted excerpt of a nostr event or other content. */
export const HIGHLIGHT_KIND = 9802;

function queryKey(address: string) {
  return ['nostr', 'highlights', address] as const;
}

/** Highlights tagged to an addressable event, e.g. a NIP-23 article's `kind:pubkey:d`. */
export function useHighlights(address: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: queryKey(address ?? ''),
    enabled: Boolean(address),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [HIGHLIGHT_KIND], '#a': [address!], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events
        .filter((event) => event.content.trim().length > 0)
        .sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });
}

export interface CreateHighlightInput {
  /** The highlighted excerpt itself. */
  text: string;
  /** `kind:pubkey:d-identifier` of the article being highlighted. */
  address: string;
  /** The article's author, tagged per NIP-84 so the highlight credits them. */
  authorPubkey: string;
}

export function useCreateHighlight() {
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ text, address, authorPubkey }: CreateHighlightInput) => {
      return publish.mutateAsync({
        kind: HIGHLIGHT_KIND,
        content: text,
        tags: [
          ['a', address],
          ['p', authorPubkey, '', 'author'],
        ],
      });
    },
    onSuccess: (_data, { address }) => {
      queryClient.invalidateQueries({ queryKey: queryKey(address) });
    },
  });
}
