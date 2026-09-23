import { useEffect, useMemo, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Globe, List, Loader2, Users } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { NoteCard } from '@/components/nostr/NoteCard';
import { Composer } from './Composer';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMyFollowSets } from '@/hooks/useFollowSets';
import { useMyFollows } from '@/hooks/useFollows';
import { useMutedPubkeys } from '@/hooks/useMuteList';
import { useWindowManager } from '@/os/useWindowManager';
import { isReply } from '@/lib/nostrUtils';
import type { AppProps } from '@/os/types';

/** `list:<d-tag>` selects one of the user's NIP-51 follow sets. */
type Scope = 'following' | 'global' | `list:${string}`;

const LIST_PREFIX = 'list:';

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

function useFeed(scope: Scope, authors: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'feed', scope, scope === 'global' ? 0 : (authors ?? []).length],
    enabled: scope === 'global' || Boolean(authors),
    queryFn: async ({ signal }) => {
      const filter =
        scope === 'global'
          ? { kinds: [1], limit: PAGE_SIZE }
          : { kinds: [1], authors: authors!.slice(0, 500), limit: PAGE_SIZE };

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
  const followSets = useMyFollowSets();
  const [requestedScope, setScope] = useState<Scope>('following');

  // Signing out mid-session (or deleting the selected list elsewhere) must not
  // strand the user on an empty feed, so the effective scope is derived rather
  // than corrected after render. While lists are still loading, a list scope is
  // kept so the feed simply shows its skeleton.
  const selectedList = requestedScope.startsWith(LIST_PREFIX)
    ? followSets.data?.find((set) => set.identifier === requestedScope.slice(LIST_PREFIX.length))
    : undefined;
  const scope: Scope = !user
    ? 'global'
    : requestedScope.startsWith(LIST_PREFIX) && followSets.data && !selectedList
      ? 'following'
      : requestedScope;
  const isList = scope.startsWith(LIST_PREFIX);

  useEffect(() => {
    const label = scope === 'following' ? 'Following' : scope === 'global' ? 'Global' : selectedList?.title ?? 'List';
    setTitle(`Feed — ${label}`);
  }, [scope, selectedList, setTitle]);

  const authors = useMemo(
    () => (isList ? selectedList?.pubkeys : follows ?? []),
    [isList, selectedList, follows],
  );
  const query = useFeed(scope, user ? authors : undefined);
  const mutedPubkeys = useMutedPubkeys();
  const visibleNotes = useMemo(
    () => (query.data ?? []).filter((event) => !mutedPubkeys.includes(event.pubkey)),
    [query.data, mutedPubkeys],
  );

  const hasNoFollows = scope === 'following' && (authors ?? []).length === 0 && !query.isLoading;
  const allMuted = (query.data?.length ?? 0) > 0 && visibleNotes.length === 0;

  return (
    <AppLayout>
      <AppToolbar className="gap-1">
        <Select value={scope} onValueChange={(value) => setScope(value as Scope)}>
          <SelectTrigger size="sm" className="h-7 max-w-56 gap-1.5 px-2.5 text-[13px] font-medium" aria-label="Feed source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="max-w-72">
            <SelectItem value="following" disabled={!user}>
              <Users className="size-3.5" aria-hidden />
              Following
            </SelectItem>
            <SelectItem value="global">
              <Globe className="size-3.5" aria-hidden />
              Global
            </SelectItem>
            {user && (followSets.data?.length ?? 0) > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Your lists</SelectLabel>
                  {followSets.data!.map((set) => (
                    <SelectItem key={set.identifier} value={`${LIST_PREFIX}${set.identifier}`}>
                      <List className="size-3.5" aria-hidden />
                      <span className="truncate">{set.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums in-data-[slot=select-value]:hidden">{set.pubkeys.length}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
            {/* Keeps the trigger labelled while a previously chosen list is still loading. */}
            {isList && !selectedList && (
              <SelectItem value={scope} disabled>
                <List className="size-3.5" aria-hidden />
                Loading list…
              </SelectItem>
            )}
          </SelectContent>
        </Select>
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
