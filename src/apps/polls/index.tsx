import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, Link2, Loader2, Plus, RotateCw } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useQueryClient } from '@tanstack/react-query';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { PollCard } from '@/components/nostr/PollCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMutedPubkeys } from '@/hooks/useMuteList';
import { useNow } from '@/hooks/useNow';
import { usePoll, usePollList, pollQueryKey, type PollScope } from '@/hooks/usePolls';
import { useRelayHints } from '@/hooks/useRelayHints';
import { useToast } from '@/hooks/useToast';
import { decodeRelayHints } from '@/lib/nostrUtils';
import { isPollClosed, parsePoll, POLL_KIND, type Poll } from '@/lib/polls';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';
import { CreatePollDialog } from './CreatePollDialog';
import { PollDetail } from './PollDetail';

const SCOPES: { value: PollScope; label: string }[] = [
  { value: 'all', label: 'Recent' },
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
];

/**
 * NIP-88 polls. `params.id` selects a poll (and `params.relays` carries the
 * hints of the identifier it was opened from); without it the app lists
 * recent polls. One pane at a time, so it reads the same in a narrow window
 * and on a phone.
 */
export default function PollsApp({ params, setParams, setTitle }: AppProps) {
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const id = params.id && /^[0-9a-f]{64}$/.test(params.id) ? params.id : undefined;

  useEffect(() => {
    if (!params.id) setTitle('Polls');
  }, [params.id, setTitle]);

  return (
    <>
      {params.id ? (
        <PollView
          id={id}
          relays={decodeRelayHints(params.relays)}
          setTitle={setTitle}
          onBack={() => setParams({})}
        />
      ) : (
        <PollList
          onOpen={(poll) => {
            // Already loaded: show it without a second round trip.
            queryClient.setQueryData(pollQueryKey(poll.event.id, undefined), poll.event);
            setParams({ id: poll.event.id });
          }}
          onCreate={() => setCreating(true)}
        />
      )}
      <CreatePollDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(event) => {
          setCreating(false);
          setParams({ id: event.id });
        }}
      />
    </>
  );
}

function PollList({ onOpen, onCreate }: { onOpen: (poll: Poll) => void; onCreate: () => void }) {
  const { user } = useCurrentUser();
  const [scope, setScope] = useState<PollScope>('all');
  const effective: PollScope = scope === 'mine' && !user ? 'all' : scope;
  const query = usePollList(effective, user?.pubkey);
  const muted = useMutedPubkeys();
  const now = useNow(30_000);

  const polls = useMemo(() => {
    return (query.data ?? []).filter(
      (poll) => !muted.includes(poll.event.pubkey) && (effective !== 'open' || !isPollClosed(poll, now)),
    );
  }, [query.data, muted, effective, now]);

  return (
    <AppLayout>
      <AppToolbar>
        <div className="flex min-w-0 items-center gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Which polls">
          {SCOPES.map((item) => {
            const disabled = item.value === 'mine' && !user;
            return (
              <Button
                key={item.value}
                type="button"
                variant="ghost"
                size="sm"
                role="radio"
                aria-checked={effective === item.value}
                disabled={disabled}
                title={disabled ? 'Sign in to see your polls' : undefined}
                className={cn('h-7 px-2.5 text-xs', effective === item.value && 'bg-background shadow-sm')}
                onClick={() => setScope(item.value)}
              >
                {item.label}
              </Button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {query.isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Loading polls" />}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh polls"
          >
            <RotateCw className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onCreate}>
            <Plus className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">New poll</span>
            <span className="sr-only sm:hidden">New poll</span>
          </Button>
        </div>
      </AppToolbar>
      <AppBody>
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <EmptyState
            title="Couldn’t load polls"
            hint="Your relays could not complete this request."
            action={
              <Button size="sm" onClick={() => void query.refetch()}>
                <RotateCw className="size-3.5" aria-hidden /> Try again
              </Button>
            }
          />
        ) : polls.length > 0 ? (
          <div aria-label="Polls" role="feed" aria-busy={query.isFetching}>
            {polls.map((poll) => (
              <PollCard key={poll.event.id} event={poll.event} onOpen={onOpen} now={now} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={effective === 'mine' ? 'You haven’t made a poll yet' : effective === 'open' ? 'No open polls' : 'No polls found'}
            hint={
              effective === 'all'
                ? 'Your relays returned no NIP-88 polls. Try again or add relays that carry them.'
                : effective === 'open'
                  ? 'Every recent poll your relays returned has closed.'
                  : undefined
            }
            action={
              <Button size="sm" onClick={onCreate}>
                <Plus className="size-3.5" aria-hidden /> New poll
              </Button>
            }
          />
        )}
      </AppBody>
    </AppLayout>
  );
}

interface PollViewProps {
  id: string | undefined;
  relays: string[] | undefined;
  setTitle: (title: string) => void;
  onBack: () => void;
}

function PollView({ id, relays, setTitle, onBack }: PollViewProps) {
  const query = usePoll(id, relays);
  const { toast } = useToast();
  const hints = useRelayHints();
  const poll = query.data ? parsePoll(query.data) : null;

  const question = poll?.question;

  useEffect(() => {
    setTitle(question ? `Poll — ${question}` : 'Poll');
  }, [question, setTitle]);

  const copyLink = async () => {
    if (!poll) return;
    try {
      // The poll's own relays are where it is most likely to be found.
      const nevent = nip19.neventEncode({
        id: poll.event.id,
        author: poll.event.pubkey,
        kind: POLL_KIND,
        relays: (poll.relays.length > 0 ? poll.relays : hints).slice(0, 2),
      });
      await navigator.clipboard.writeText(`${window.location.origin}/${nevent}`);
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Could not copy the link', variant: 'destructive' });
    }
  };

  let body: ReactNode;
  if (!id) {
    body = <EmptyState title="Not a poll id" hint="This link does not point at a valid event." />;
  } else if (query.isPending) {
    body = (
      <div className="space-y-3 p-4" aria-label="Loading poll">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-6 w-3/4" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <EmptyState
        title="Couldn’t load this poll"
        hint="Your relays could not complete this request."
        action={
          <Button size="sm" onClick={() => void query.refetch()}>
            <RotateCw className="size-3.5" aria-hidden /> Try again
          </Button>
        }
      />
    );
  } else if (!query.data) {
    body = (
      <EmptyState
        title="Poll not found"
        hint="None of your relays returned this poll. It may live elsewhere."
        action={
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (!poll) {
    body = (
      <EmptyState
        title="This is not a poll you can vote on"
        hint={
          query.data.kind === POLL_KIND
            ? 'The poll has no question or fewer than two valid options.'
            : `This event is kind ${query.data.kind}, not a NIP-88 poll (kind ${POLL_KIND}).`
        }
      />
    );
  } else {
    body = <PollDetail poll={poll} />;
  }

  return (
    <AppLayout>
      <AppToolbar>
        <Button variant="ghost" size="sm" className="-ml-1 h-7 gap-1 px-1.5 text-[13px]" onClick={onBack}>
          <ChevronLeft className="size-4" aria-hidden /> Polls
        </Button>
        {poll && (
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs" onClick={() => void copyLink()}>
            <Link2 className="size-3.5" aria-hidden /> Copy link
          </Button>
        )}
      </AppToolbar>
      <AppBody>{body}</AppBody>
    </AppLayout>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border" aria-label="Loading polls">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <div className="space-y-1.5 sm:pl-11">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
