import { useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthor } from '@/hooks/useAuthor';
import {
  useBannedEvents,
  useEventsNeedingModeration,
  useNip86Mutation,
  type AuditEntry,
  type Nip86Session,
} from '@/hooks/useNip86';
import { useToast } from '@/hooks/useToast';
import { parseEventIdInput, relayWsUrl, type ModeratedEventRef } from '@/lib/nip86';
import { displayName, relativeTime } from '@/lib/nostrUtils';
import { BanEventDialog, ConfirmAction, type PendingConfirm } from './dialogs';
import { useFilter } from './useFilter';
import {
  IdText,
  ListEmpty,
  ListError,
  ListSkeleton,
  RowAction,
  Section,
  SectionToolbar,
} from './shared';

type AuditFn = (entry: Omit<AuditEntry, 'id' | 'at'>) => void;

/**
 * Fetch the full event behind a moderation row straight from the managed
 * relay, so the operator reviews the actual content before deciding. The
 * event may be gone (already deleted, or never stored) — that is shown
 * honestly instead of hiding the row.
 */
function useModeratedEvent(session: Nip86Session, id: string) {
  const { nostr } = useNostr();
  const relay = relayWsUrl(session.url);

  return useQuery<NostrEvent | null>({
    queryKey: ['nip86', session.url, 'moderated-event', id],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query([{ ids: [id] }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        relays: [relay],
      });
      return event ?? null;
    },
  });
}

type Decision = 'allowevent' | 'banevent';

const DECISION_CONFIRM: Record<Decision, (id: string, canReverse: boolean) => Omit<PendingConfirm, 'run'>> = {
  allowevent: (id) => ({
    title: 'Allow this event?',
    target: id,
    effect: 'The relay will keep and serve this event. It leaves the moderation queue.',
    reversible: 'Reversible: you can ban the event later.',
    actionLabel: 'Allow event',
  }),
  banevent: (id, canReverse) => ({
    title: 'Ban this event?',
    target: id,
    effect:
      'The relay will stop serving this event and may delete its stored copy. The event can still exist on other relays.',
    reversible: canReverse ? 'Reversible: you can allow the event again.' : undefined,
    actionLabel: 'Ban event',
  }),
};

function ModerationRow({
  session,
  entry,
  canAllow,
  canBan,
  pending,
  onDecide,
}: {
  session: Nip86Session;
  entry: ModeratedEventRef;
  canAllow: boolean;
  canBan: boolean;
  pending: boolean;
  onDecide: (decision: Decision, id: string) => void;
}) {
  const event = useModeratedEvent(session, entry.id);
  const author = useAuthor(event.data?.pubkey);

  return (
    <li className="space-y-2 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <IdText value={entry.id} />
          {entry.reason && (
            <p className="truncate text-xs text-muted-foreground" title={entry.reason}>
              Flagged: {entry.reason}
            </p>
          )}
        </div>
        {(canAllow || canBan) && (
          <div className="flex shrink-0 gap-1.5">
            {canAllow && (
              <RowAction label="Allow" pending={pending} onClick={() => onDecide('allowevent', entry.id)} />
            )}
            {canBan && (
              <RowAction
                label="Ban"
                destructive
                pending={pending}
                onClick={() => onDecide('banevent', entry.id)}
              />
            )}
          </div>
        )}
      </div>

      {/* Review context: the event itself, straight from the managed relay. */}
      {event.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading the event for review…</p>
      ) : event.data ? (
        <blockquote className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
          <p className="text-xs text-muted-foreground">
            {displayName(event.data.pubkey, author.data?.metadata)} · kind {event.data.kind} ·{' '}
            {relativeTime(event.data.created_at)}
          </p>
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-sm">
            {event.data.content}
          </p>
        </blockquote>
      ) : (
        <p className="text-xs text-muted-foreground">
          The event itself is not available from this relay — it may already be deleted. You can
          still ban the ID to keep it out.
        </p>
      )}
    </li>
  );
}

export function EventModerationSection({
  session,
  onResult,
}: {
  session: Nip86Session;
  onResult: AuditFn;
}) {
  const queue = useEventsNeedingModeration(session, { onResult });
  const banned = useBannedEvents(session, { onResult });
  const { toast } = useToast();
  const mutation = useNip86Mutation(session, { onResult });

  const [banOpen, setBanOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | undefined>(undefined);
  const queueFilter = useFilter(queue.data, (entry) => [entry.id, entry.reason]);
  const bannedFilter = useFilter(banned.data, (entry) => [entry.id, entry.reason]);

  const hasQueue = session.methods.includes('listeventsneedingmoderation');
  const hasBanned = session.methods.includes('listbannedevents');
  const canAllow = session.methods.includes('allowevent');
  const canBan = session.methods.includes('banevent');

  const run = async (method: Decision, id: string, success: string) => {
    try {
      await mutation.mutateAsync({
        method,
        params: [id],
        refresh: ['listeventsneedingmoderation', 'listbannedevents'],
      });
      toast({ title: success });
    } catch (error) {
      toast({
        title: 'The relay refused the operation',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const decide = (decision: Decision, id: string) =>
    setConfirm({
      ...DECISION_CONFIRM[decision](id, canAllow),
      run: () => run(decision, id, decision === 'banevent' ? 'Event banned' : 'Event allowed'),
    });

  return (
    <Section
      title="Event moderation"
      description="Events the relay flagged for review, and events it already bans. Review the content from the managed relay before deciding."
      actions={
        canBan ? (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setBanOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            Ban by ID
          </Button>
        ) : undefined
      }
    >
      {hasQueue && (
        <>
          <SectionToolbar
            search={queueFilter.search}
            onSearch={queueFilter.setSearch}
            searchLabel="Filter the queue"
            count={queueFilter.filtered?.length}
            onRefresh={() => queue.refetch()}
            refreshing={queue.isFetching}
          />
          {queue.isLoading ? (
            <ListSkeleton />
          ) : queue.isError ? (
            <ListError error={queue.error} onRetry={() => queue.refetch()} />
          ) : !queueFilter.filtered || queueFilter.filtered.length === 0 ? (
            <ListEmpty
              title={queueFilter.search ? 'No matches' : 'Nothing needs moderation'}
              hint={
                queueFilter.search
                  ? 'Nothing in the queue matches the filter.'
                  : 'The relay’s moderation queue is empty.'
              }
            />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {queueFilter.filtered.map((entry) => (
                <ModerationRow
                  key={entry.id}
                  session={session}
                  entry={entry}
                  canAllow={canAllow}
                  canBan={canBan}
                  pending={mutation.isPending}
                  onDecide={decide}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {hasBanned && (
        <div className={hasQueue ? 'mt-3' : undefined}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Banned events
          </p>
          <SectionToolbar
            search={bannedFilter.search}
            onSearch={bannedFilter.setSearch}
            searchLabel="Filter banned events"
            count={bannedFilter.filtered?.length}
            onRefresh={() => banned.refetch()}
            refreshing={banned.isFetching}
          />
          {banned.isLoading ? (
            <ListSkeleton rows={2} />
          ) : banned.isError ? (
            <ListError error={banned.error} onRetry={() => banned.refetch()} />
          ) : !bannedFilter.filtered || bannedFilter.filtered.length === 0 ? (
            <ListEmpty
              title={bannedFilter.search ? 'No matches' : 'No banned events'}
              hint={
                bannedFilter.search
                  ? 'Nothing on the ban list matches the filter.'
                  : 'The relay reports no banned events.'
              }
            />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {bannedFilter.filtered.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <IdText value={entry.id} />
                    {entry.reason && (
                      <p className="truncate text-xs text-muted-foreground" title={entry.reason}>
                        Reason: {entry.reason}
                      </p>
                    )}
                  </div>
                  {canAllow ? (
                    <RowAction
                      label="Unban"
                      pending={mutation.isPending}
                      onClick={() =>
                        setConfirm({
                          title: 'Unban this event?',
                          target: entry.id,
                          effect: 'The relay will serve this event again if it still has a copy.',
                          reversible: 'Reversible: you can ban the event again.',
                          actionLabel: 'Unban',
                          run: () => run('allowevent', entry.id, 'Event unbanned'),
                        })
                      }
                    />
                  ) : (
                    <Badge variant="outline" className="text-[10px]">read-only</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <BanEventDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        pending={mutation.isPending}
        onSubmit={async (value, reason) => {
          const parsed = parseEventIdInput(value);
          if (typeof parsed !== 'string') {
            throw new Error(parsed.error);
          }
          try {
            await mutation.mutateAsync({
              method: 'banevent',
              params: reason.trim() ? [parsed, reason.trim()] : [parsed],
              refresh: ['listeventsneedingmoderation', 'listbannedevents'],
            });
            toast({ title: 'Event banned' });
          } catch (error) {
            toast({
              title: 'The relay refused the operation',
              description: error instanceof Error ? error.message : undefined,
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />
      <ConfirmAction pending={confirm} onClose={() => setConfirm(undefined)} />
    </Section>
  );
}
