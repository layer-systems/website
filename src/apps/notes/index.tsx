import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { NoteContent } from '@/components/nostr/NoteContent';
import { NoteCard } from '@/components/nostr/NoteCard';
import { Composer } from '@/apps/feed/Composer';
import { DraftNote } from './Draft';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { absoluteTime, decodeRelayHints, displayName } from '@/lib/nostrUtils';
import type { AppProps } from '@/os/types';

function useNote(id: string | undefined, relays: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'note', id ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query([{ ids: [id!] }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        relays,
      });
      return event ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useReplies(id: string | undefined, relays: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'replies', id ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [1], '#e': [id!], limit: 100 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        relays,
      });
      return events
        .filter((event) => event.content.trim().length > 0)
        .sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 30_000,
  });
}

export default function NotesApp({ params, setTitle, setParams }: AppProps) {
  const { user } = useCurrentUser();
  const id = params.id;
  const relays = decodeRelayHints(params.relays);
  const note = useNote(id, relays);
  const replies = useReplies(id, relays);
  const author = useAuthor(note.data?.pubkey);

  const name = note.data ? displayName(note.data.pubkey, author.data?.metadata) : undefined;

  useEffect(() => {
    setTitle(id ? (name ? `Note by ${name}` : 'Note') : 'New Note');
  }, [id, name, setTitle]);

  if (!id) {
    return <DraftNote onPublished={(publishedId) => setParams({ id: publishedId })} />;
  }

  if (note.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (!note.data) {
    return (
      <EmptyState
        title="Note not found"
        hint="None of your relays returned this note. It may live elsewhere."
        action={
          <Button size="sm" variant="outline" onClick={() => note.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const event = note.data;
  // NIP-10: mark the note we are replying to as the root and carry its author.
  const replyTags = [
    ['e', event.id, '', 'root'],
    ['p', event.pubkey],
  ];

  return (
    <AppLayout>
      <AppToolbar>
        <span className="truncate text-[13px] font-medium">Thread</span>
        <div className="ml-auto flex items-center gap-2">
          {replies.isFetching && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          )}
          <span className="text-xs text-muted-foreground">
            {replies.data?.length ?? 0} {replies.data?.length === 1 ? 'reply' : 'replies'}
          </span>
        </div>
      </AppToolbar>

      <AppBody>
        <div className="border-b border-border px-4 py-4">
          <AuthorLine pubkey={event.pubkey} />
          <div className="mt-3">
            <NoteContent content={event.content} className="text-base" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{absoluteTime(event.created_at)}</p>
        </div>

        {user && (
          <Composer
            replyTags={replyTags}
            placeholder="Write a reply…"
            onPublished={() => replies.refetch()}
          />
        )}

        {replies.data && replies.data.length > 0 ? (
          replies.data.map((reply) => <NoteCard key={reply.id} event={reply} />)
        ) : (
          <EmptyState title="No replies yet" hint={user ? 'Be the first to answer.' : undefined} />
        )}
      </AppBody>
    </AppLayout>
  );
}
