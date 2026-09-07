import { useEffect, useMemo, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Globe, Loader2, Users } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { NoteCard } from '@/components/nostr/NoteCard';
import { Composer } from './Composer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMyFollows } from '@/hooks/useFollows';
import { useMutedPubkeys } from '@/hooks/useMuteList';
import { cn } from '@/lib/utils';
import { useWindowManager } from '@/os/useWindowManager';
import { isReply } from '@/lib/nostrUtils';
import { GENERIC_REPOST_KIND, REPOST_KIND } from '@/hooks/useReposts';
import type { AppProps } from '@/os/types';

type Scope = 'following' | 'global';

const PAGE_SIZE = 50;

/**
 * A kind 1 event is only worth rendering if it has something to render. Relays
 * happily return blanks and oddities, so the feed validates before it draws.
 * Replies (NIP-10 `e` tags) are excluded too: without their parent for
 * context they read as indistinguishable, orphaned root posts — open the
 * thread from the Note app instead. Reposts (kind 6/16) only need a valid
 * `e` tag to point at what they're reposting; their `content` is optional
 * per NIP-18, so it isn't part of this check.
 */
function isRenderableNote(event: NostrEvent): boolean {
  if (event.kind === REPOST_KIND || event.kind === GENERIC_REPOST_KIND) {
    return event.tags.some(([name, value]) => name === 'e' && Boolean(value));
  }
  return (
    event.kind === 1 &&
    typeof event.content === 'string' &&
    event.content.trim().length > 0 &&
    !isReply(event)
  );
}

function useFeed(scope: Scope, authors: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'feed', scope, scope === 'following' ? (authors ?? []).length : 0],
    enabled: scope === 'global' || Boolean(authors),
    queryFn: async ({ signal }) => {
      const kinds = [1, REPOST_KIND, GENERIC_REPOST_KIND];
      const filter =
        scope === 'following'
          ? { kinds, authors: authors!.slice(0, 500), limit: PAGE_SIZE }
          : { kinds, limit: PAGE_SIZE };

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
  const { data: follows } = useMyFollows();
  const [requestedScope, setScope] = useState<Scope>('following');

  // Signing out mid-session must not strand the user on an empty "Following"
  // tab, so the effective scope is derived rather than corrected after render.
  const scope: Scope = user ? requestedScope : 'global';

  useEffect(() => {
    setTitle(scope === 'following' ? 'Feed — Following' : 'Feed — Global');
  }, [scope, setTitle]);

  const authors = useMemo(() => follows ?? [], [follows]);
  const query = useFeed(scope, user ? authors : undefined);
  const mutedPubkeys = useMutedPubkeys();
  const visibleNotes = useMemo(
    () => (query.data ?? []).filter((event) => !mutedPubkeys.includes(event.pubkey)),
    [query.data, mutedPubkeys],
  );

  const hasNoFollows = scope === 'following' && authors.length === 0 && !query.isLoading;
  const allMuted = (query.data?.length ?? 0) > 0 && visibleNotes.length === 0;

  return (
    <AppLayout>
      <AppToolbar className="gap-1">
        <ScopeTab
          active={scope === 'following'}
          disabled={!user}
          onClick={() => setScope('following')}
          icon={<Users className="size-3.5" aria-hidden />}
          label="Following"
        />
        <ScopeTab
          active={scope === 'global'}
          onClick={() => setScope('global')}
          icon={<Globe className="size-3.5" aria-hidden />}
          label="Global"
        />
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

        {query.isLoading ? (
          <FeedSkeleton />
        ) : hasNoFollows ? (
          <EmptyState
            title="You are not following anyone yet"
            hint="Switch to Global to find people, then follow them from their profile."
            action={
              <Button size="sm" onClick={() => setScope('global')}>
                Browse Global
              </Button>
            }
          />
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

function ScopeTab({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      {label}
    </button>
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
