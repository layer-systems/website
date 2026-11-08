import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Composer } from '@/apps/feed/Composer';
import { AuthorLine } from './AuthorLine';
import { EmptyState } from '@/components/os/AppChrome';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { tagValue } from '@/lib/nostrUtils';

/** NIP-22 scopes addressable events by address so comments survive revisions. */
function eventAddress(event: NostrEvent): string | undefined {
  const identifier = tagValue(event, 'd');
  return event.kind >= 30000 && event.kind < 40000 && identifier !== undefined
    ? `${event.kind}:${event.pubkey}:${identifier}` : undefined;
}

export function EventComments({ event, relays }: { event: NostrEvent; relays?: string[] }) {
  const { nostr } = useNostr();
  const address = eventAddress(event);
  const comments = useQuery({
    queryKey: ['nostr', 'event-comments', event.id, address, relays?.join(',') ?? ''],
    queryFn: async ({ signal }) => {
      const filters: NostrFilter[] = [
        { kinds: [1111], '#E': [event.id], limit: 100 },
        { kinds: [1], '#e': [event.id], limit: 100 },
      ];
      if (address) filters.push(
        { kinds: [1111], '#A': [address], limit: 100 },
        { kinds: [1], '#a': [address], limit: 100 },
      );
      const results = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]), relays,
      });
      return [...new Map(results.filter((comment) => {
        if (!comment.content.trim()) return false;
        const references = (name: string, value: string) => comment.tags.some(([tag, target]) => tag === name && target === value);
        if (comment.kind === 1) return references('e', event.id) || Boolean(address && references('a', address));
        return comment.kind === 1111
          && (references('E', event.id) || Boolean(address && references('A', address)))
          && references('K', String(event.kind)) && references('P', event.pubkey)
          && Boolean(tagValue(comment, 'k')) && Boolean(tagValue(comment, 'p'))
          && comment.tags.some(([name, value]) => ['e', 'a', 'i'].includes(name) && Boolean(value));
      }).map((comment) => [comment.id, comment])).values()]
        .sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 30_000,
  });
  const tags = [
    address ? ['A', address] : ['E', event.id, '', event.pubkey],
    ['K', String(event.kind)], ['P', event.pubkey],
    ...(address ? [['a', address]] : []),
    ['e', event.id, '', event.pubkey], ['k', String(event.kind)], ['p', event.pubkey],
  ];

  return <section aria-label="Comments" className="mt-4 border-t border-border">
    <h2 className="px-4 py-3 text-sm font-medium">Comments</h2>
    <Composer key={event.id} kind={1111} replyTags={tags} placeholder="Write a comment…" onPublished={() => void comments.refetch()} />
    {comments.isPending ? <div className="space-y-3 p-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-full" /></div>
      : comments.isError ? <EmptyState title="Couldn’t load comments" action={<Button size="sm" onClick={() => void comments.refetch()}>Try again</Button>} />
      : comments.data.length ? comments.data.map((comment) => <div key={comment.id} className="border-t border-border px-4 py-3">
        <AuthorLine pubkey={comment.pubkey} createdAt={comment.created_at} />
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
      </div>) : <EmptyState title="No comments yet" hint="Sign in to leave a comment." />}
  </section>;
}
