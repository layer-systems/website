import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, CloudOff, Loader2, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useRelayListSync } from '@/hooks/useRelayListSync';
import { INDEXER_RELAYS } from '@/lib/appRelays';
import { absoluteTime, relativeTime } from '@/lib/nostrUtils';
import { relayLabel } from '@/lib/relayList';
import type { RelayListSyncResult } from '@/lib/relayListSync';
import { cn } from '@/lib/utils';

type RelayOutcome = 'current' | 'outdated' | 'missing' | 'unreachable';

const OUTCOME_LABEL: Record<RelayOutcome, string> = {
  current: 'Up to date',
  outdated: 'Older version',
  missing: 'Not found',
  unreachable: 'No answer',
};

const OUTCOME_TONE: Record<RelayOutcome, string> = {
  current: 'bg-success',
  outdated: 'bg-warning',
  missing: 'bg-muted-foreground/40',
  unreachable: 'bg-destructive',
};

function outcomeOf(result: RelayListSyncResult, url: string): RelayOutcome {
  if (result.foundOn.includes(url)) return 'current';
  if (result.outdated.includes(url)) return 'outdated';
  if (result.checked.includes(url)) return 'missing';
  return 'unreachable';
}

/**
 * Whether the signed-in user's NIP-65 relay list could be found on Nostr, and
 * where. Lets users tell a list that other clients and devices will pick up
 * from one that only exists on this device.
 */
export function SyncStatus({ onPublish }: { onPublish: () => void }) {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const sync = useRelayListSync();
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!user) return null;

  const retry = (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      onClick={() => void sync.refetch()}
      disabled={sync.isFetching}
      aria-label="Check again"
      title="Check again"
    >
      <RefreshCw className={cn('size-3.5', sync.isFetching && 'motion-safe:animate-spin')} aria-hidden />
    </Button>
  );

  const publish = (
    <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={onPublish}>
      <Upload className="size-3.5" aria-hidden />
      Publish
    </Button>
  );

  if (sync.isPending) {
    return (
      <StatusBar icon={<Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" aria-hidden />}>
        <p>Looking for your published relay list…</p>
        <p className="text-muted-foreground">Editing is paused until the lookup finishes.</p>
      </StatusBar>
    );
  }

  if (sync.isError) {
    return (
      <StatusBar icon={<AlertTriangle className="size-4 text-warning" aria-hidden />} actions={retry}>
        <p className="font-medium">Couldn't check your published relay list</p>
        <p className="text-muted-foreground">
          None of the indexer relays answered. Your relays may be out of date, so editing is paused to avoid
          overwriting your published list.
        </p>
      </StatusBar>
    );
  }

  const result = sync.data;
  const { event } = result;
  const details = (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="group mt-1 inline-flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-controls={`${id}-relays`}
      >
        <ChevronRight
          className="size-3 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        {open ? 'Hide' : 'Show'} where we looked
      </CollapsibleTrigger>
      <CollapsibleContent id={`${id}-relays`}>
        <ul className="mt-2 space-y-1">
          {result.queried.map((url) => {
            const outcome = outcomeOf(result, url);
            return (
              <li key={url} className="flex items-center gap-2">
                <span className={cn('size-2 shrink-0 rounded-full', OUTCOME_TONE[outcome])} aria-hidden />
                <span className="min-w-0 truncate font-mono">{relayLabel(url)}</span>
                {INDEXER_RELAYS.includes(url) && (
                  <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">indexer</span>
                )}
                <span className="ml-auto shrink-0 text-muted-foreground">{OUTCOME_LABEL[outcome]}</span>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );

  if (!event) {
    return (
      <StatusBar icon={<CloudOff className="size-4 text-warning" aria-hidden />} actions={<>{publish}{retry}</>}>
        <p className="font-medium">No published relay list found</p>
        <p className="text-muted-foreground">
          Other apps and your other devices can't find your relays. Changes stay on this device until you publish this list.
        </p>
        {details}
      </StatusBar>
    );
  }

  if (event.created_at < config.relayMetadata.updatedAt) {
    return (
      <StatusBar icon={<AlertTriangle className="size-4 text-warning" aria-hidden />} actions={<>{publish}{retry}</>}>
        <p className="font-medium">Changes on this device aren't published yet</p>
        <p className="text-muted-foreground">
          The newest published list is from{' '}
          <time dateTime={new Date(event.created_at * 1000).toISOString()} title={absoluteTime(event.created_at)}>
            {relativeTime(event.created_at)}
          </time>
          .
        </p>
        {details}
      </StatusBar>
    );
  }

  return (
    <StatusBar icon={<CheckCircle2 className="size-4 text-success" aria-hidden />} actions={retry}>
      <p className="font-medium">
        Relay list synced · found on {result.foundOn.length} of {result.queried.length} relays
      </p>
      <p className="text-muted-foreground">
        Last published{' '}
        <time dateTime={new Date(event.created_at * 1000).toISOString()} title={absoluteTime(event.created_at)}>
          {relativeTime(event.created_at)}
        </time>
        .
      </p>
      {details}
    </StatusBar>
  );
}

function StatusBar({ icon, actions, children }: { icon: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label="Relay list sync status" aria-live="polite" className="flex gap-2 border-b border-border px-3 py-2 text-xs">
      <div className="pt-px">{icon}</div>
      <div className="min-w-0 flex-1 space-y-0.5">{children}</div>
      {actions && <div className="flex shrink-0 items-start gap-1">{actions}</div>}
    </section>
  );
}
