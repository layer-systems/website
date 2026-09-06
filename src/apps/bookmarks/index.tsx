import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppSectionTitle, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { NoteCard } from '@/components/nostr/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useBookmarkedNoteIds, useMyBookmarkedArticles } from '@/hooks/useBookmarks';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWindowManager } from '@/os/useWindowManager';
import { displayName, relativeTime, tagValue } from '@/lib/nostrUtils';
import type { AppProps } from '@/os/types';

function useBookmarkedNotes(ids: string[]) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'bookmarked-notes', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ ids, limit: ids.length }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      const order = new Map(ids.map((id, index) => [id, index]));
      return [...events].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
    staleTime: 60_000,
  });
}

export default function BookmarksApp({ setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const { openApp } = useWindowManager();

  useEffect(() => setTitle('Bookmarks'), [setTitle]);

  const noteIds = useBookmarkedNoteIds();
  const notes = useBookmarkedNotes(noteIds);
  const articles = useMyBookmarkedArticles();

  if (!user) {
    return <LoginRequired action="see your bookmarks" />;
  }

  const isLoading = (noteIds.length > 0 && notes.isLoading) || articles.isLoading;
  const isEmpty = !isLoading && (notes.data?.length ?? 0) === 0 && (articles.data?.length ?? 0) === 0;

  return (
    <AppLayout>
      <AppToolbar>
        <span className="text-[13px] font-medium">Bookmarks</span>
      </AppToolbar>

      <AppBody>
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            title="No bookmarks yet"
            hint="Bookmark a note or an article and it will show up here."
          />
        ) : (
          <>
            {notes.data && notes.data.length > 0 && (
              <>
                <AppSectionTitle>Notes</AppSectionTitle>
                {notes.data.map((event) => (
                  <NoteCard key={event.id} event={event} />
                ))}
              </>
            )}
            {articles.data && articles.data.length > 0 && (
              <>
                <AppSectionTitle>Articles</AppSectionTitle>
                {articles.data.map((event) => (
                  <ArticleRow
                    key={event.id}
                    event={event}
                    onOpen={() =>
                      openApp('articles', {
                        pubkey: event.pubkey,
                        identifier: tagValue(event, 'd') ?? '',
                        kind: String(event.kind),
                      })
                    }
                  />
                ))}
              </>
            )}
          </>
        )}
      </AppBody>
    </AppLayout>
  );
}

function ArticleRow({ event, onOpen }: { event: NostrEvent; onOpen: () => void }) {
  const author = useAuthor(event.pubkey);
  const title = tagValue(event, 'title') ?? tagValue(event, 'd') ?? 'Untitled';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
    >
      <span className="block truncate text-[14px] font-medium">{title}</span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
        {displayName(event.pubkey, author.data?.metadata)} · {relativeTime(event.created_at)}
      </span>
    </button>
  );
}
