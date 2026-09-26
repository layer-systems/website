import { useEffect, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { FeedScopeSelect } from '@/components/nostr/FeedScopeSelect';
import { NoteCard } from '@/components/nostr/NoteCard';
import { Composer } from './Composer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type FeedScopeState, useFeedScope } from '@/hooks/useFeedScope';
import { useMutedPubkeys } from '@/hooks/useMuteList';
import { useWindowManager } from '@/os/useWindowManager';
import { isReply } from '@/lib/nostrUtils';
import type { AppProps } from '@/os/types';

const PAGE_SIZE = 50;

/**
 * A kind 1 event is only worth rendering if it has something to render. Relays
 * happily return blanks and oddities, so the feed validates before it draws.
 * Replies (NIP-10 `e` tags) are excluded too: without their parent for
 * context they read as indistinguishable, orphaned root posts — open the
 * thread from the Note app instead.
 */
function isRenderableNote(event: NostrEvent): boolean {
  return (
    event.kind === 1 &&
    typeof event.content === 'string' &&
    event.content.trim().length > 0 &&
    !isReply(event)
  );
}

function useFeed({ authors, queryKey }: FeedScopeState) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'feed', ...queryKey],
    // Unresolved or empty author lists have nothing to ask relays for.
    enabled: authors === null || (authors?.length ?? 0) > 0,
    queryFn: async ({ signal }) => {
      const filter = authors
        ? { kinds: [1], authors, limit: PAGE_SIZE }
        : { kinds: [1], limit: PAGE_SIZE };

      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });

      return events
        .filter(isRenderableNote)
        .sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });
}

export default function FeedApp({ setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const { openApp } = useWindowManager();
  const feedScope = useFeedScope('feed:scope');
  const { scope, setScope, authors, label } = feedScope;

  useEffect(() => {
    setTitle(`Feed — ${label}`);
  }, [label, setTitle]);

  const query = useFeed(feedScope);
  const mutedPubkeys = useMutedPubkeys();
  const visibleNotes = useMemo(
    () => (query.data ?? []).filter((event) => !mutedPubkeys.includes(event.pubkey)),
    [query.data, mutedPubkeys],
  );

  // A disabled query (authors still resolving) is pending, not loading.
  const isLoading = query.isPending;
  const hasNoFollows = scope === 'following' && authors?.length === 0;
  const allMuted = (query.data?.length ?? 0) > 0 && visibleNotes.length === 0;

  return (
    <AppLayout>
      <AppToolbar className="gap-1">
        <FeedScopeSelect state={feedScope} />
        <div className="ml-auto flex items-center gap-2">
          {query.isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => openApp('notes')}
          >
            <FileText className="size-3.5" aria-hidden />
            New note
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            Refresh
          </Button>
        </div>
      </AppToolbar>

      <AppBody>
        {user && <Composer onPublished={() => query.refetch()} />}

        {hasNoFollows ? (
          <EmptyState
            title="You are not following anyone yet"
            hint="Switch to Global to find people, then follow them from their profile."
            action={
              <Button size="sm" onClick={() => setScope('global')}>
                Browse Global
              </Button>
            }
          />
        ) : isLoading ? (
          <FeedSkeleton />
        ) : allMuted ? (
          <EmptyState
            title="Nothing to show"
            hint="Every note on this page is from an account you muted or blocked."
          />
        ) : visibleNotes.length > 0 ? (
          visibleNotes.map((event) => <NoteCard key={event.id} event={event} />)
        ) : (
          <EmptyState
            title="Nothing came back"
            hint="Your relays returned no notes. Check the Relays app or try again."
            action={
              <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        )}
      </AppBody>
    </AppLayout>
  );
}

function FeedSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex gap-3 px-4 py-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
