import { useCallback, useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  AppBody,
  AppLayout,
  AppSectionTitle,
  AppSidebar,
  AppSplit,
  AppToolbar,
  EmptyState,
} from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { LiveChat } from './LiveChat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useIsMobile } from '@/hooks/useIsMobile';
import { displayName, relativeTime, sanitizeUrl, tagValue, tagValues } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import type { AppParams, AppProps } from '@/os/types';

const LIVE_EVENT_KIND = 30311;

type Status = 'live' | 'planned' | 'ended' | string;

/** A live event is only listable once it has a `d` identifier and a title (NIP-53). */
function isRenderableStream(event: NostrEvent): boolean {
  return event.kind === LIVE_EVENT_KIND && Boolean(tagValue(event, 'd')) && Boolean(tagValue(event, 'title'));
}

function statusOf(event: NostrEvent): Status {
  return tagValue(event, 'status') ?? 'ended';
}

/** Live first, then planned, then everything else, each bucket newest first. */
function streamOrder(event: NostrEvent): number {
  const status = statusOf(event);
  if (status === 'live') return 0;
  if (status === 'planned') return 1;
  return 2;
}

function hostPubkey(event: NostrEvent): string | undefined {
  const host = event.tags.find(([name, , , role]) => name === 'p' && role === 'Host');
  return host?.[1] ?? tagValue(event, 'p') ?? event.pubkey;
}

function useLiveEvents() {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'live-events'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [LIVE_EVENT_KIND], limit: 60 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      // Addressable events can arrive with stale duplicates; the relay pool
      // already dedupes by id, but not by (kind, pubkey, d) — keep the
      // newest revision of each stream.
      const latest = new Map<string, NostrEvent>();
      for (const event of events.filter(isRenderableStream)) {
        const address = `${event.pubkey}:${tagValue(event, 'd')}`;
        const current = latest.get(address);
        if (!current || event.created_at > current.created_at) latest.set(address, event);
      }
      return [...latest.values()].sort(
        (a, b) => streamOrder(a) - streamOrder(b) || b.created_at - a.created_at,
      );
    },
    staleTime: 30_000,
  });
}

function useLiveEvent(pubkey: string | undefined, identifier: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'live-event', pubkey ?? '', identifier ?? ''],
    enabled: Boolean(pubkey && identifier),
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query(
        [{ kinds: [LIVE_EVENT_KIND], authors: [pubkey!], '#d': [identifier!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return event ?? null;
    },
    staleTime: 15_000,
  });
}

export default function LiveApp({ params, setTitle, setParams }: AppProps) {
  const isMobile = useIsMobile();

  const selected = params.pubkey && params.identifier ? { pubkey: params.pubkey, identifier: params.identifier } : null;

  const select = useCallback((next: AppParams | null) => setParams(next ?? {}), [setParams]);

  const list = useLiveEvents();
  const stream = useLiveEvent(selected?.pubkey, selected?.identifier);
  const title = stream.data ? tagValue(stream.data, 'title') : undefined;

  useEffect(() => {
    setTitle(title ? `Live — ${title}` : 'Live');
  }, [title, setTitle]);

  const listPane = (
    <StreamList
      query={list}
      selected={selected}
      onSelect={(event) => select({ pubkey: event.pubkey, identifier: tagValue(event, 'd')! })}
    />
  );

  const detailPane = !selected ? (
    <EmptyState title="Pick a stream" hint="Choose one from the list to see details and join the chat." />
  ) : stream.isLoading ? (
    <div className="space-y-4 p-6">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
    </div>
  ) : stream.data ? (
    <StreamDetail event={stream.data} />
  ) : (
    <EmptyState title="Stream not found" hint="None of your relays returned this stream." />
  );

  if (isMobile) {
    return (
      <AppLayout>
        <AppToolbar>
          {selected ? (
            <button
              type="button"
              onClick={() => select(null)}
              className="-ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
              All streams
            </button>
          ) : (
            <span className="text-[13px] font-medium">Live</span>
          )}
        </AppToolbar>
        <AppBody>{selected ? detailPane : listPane}</AppBody>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppToolbar>
        <span className="truncate text-[13px] font-medium">{title ?? 'Live'}</span>
      </AppToolbar>
      <AppSplit>
        <AppSidebar className="p-0">{listPane}</AppSidebar>
        <AppBody>{detailPane}</AppBody>
      </AppSplit>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'live') {
    return (
      <Badge className="gap-1 border-transparent bg-destructive text-destructive-foreground">
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
        Live
      </Badge>
    );
  }
  if (status === 'planned') {
    return <Badge variant="secondary">Planned</Badge>;
  }
  return <Badge variant="outline">Ended</Badge>;
}

function StreamList({
  query,
  selected,
  onSelect,
}: {
  query: ReturnType<typeof useLiveEvents>;
  selected: { pubkey: string; identifier: string } | null;
  onSelect: (event: NostrEvent) => void;
}) {
  if (query.isLoading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!query.data || query.data.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No live events on your relays.
      </p>
    );
  }

  return (
    <>
      <AppSectionTitle>Streams</AppSectionTitle>
      <ul className="pb-2">
        {query.data.map((event) => {
          const identifier = tagValue(event, 'd')!;
          const active = selected?.pubkey === event.pubkey && selected?.identifier === identifier;
          return (
            <li key={`${event.pubkey}:${identifier}`}>
              <StreamListItem event={event} active={active} onSelect={() => onSelect(event)} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function StreamListItem({
  event,
  active,
  onSelect,
}: {
  event: NostrEvent;
  active: boolean;
  onSelect: () => void;
}) {
  const host = useAuthor(hostPubkey(event));
  const title = tagValue(event, 'title') ?? 'Untitled stream';
  const status = statusOf(event);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full px-3 py-2 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="line-clamp-1 flex-1 text-[13px] font-medium leading-snug">{title}</span>
        <StatusBadge status={status} />
      </div>
      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
        {displayName(hostPubkey(event) ?? event.pubkey, host.data?.metadata)} · {relativeTime(event.created_at)}
      </span>
    </button>
  );
}

function StreamDetail({ event }: { event: NostrEvent }) {
  const title = tagValue(event, 'title') ?? 'Untitled stream';
  const summary = tagValue(event, 'summary');
  const image = sanitizeUrl(tagValue(event, 'image'));
  const streamingUrl = sanitizeUrl(tagValue(event, 'streaming'));
  const recordingUrl = sanitizeUrl(tagValue(event, 'recording'));
  const status = statusOf(event);
  const topics = tagValues(event, 't');
  const address = `${LIVE_EVENT_KIND}:${event.pubkey}:${tagValue(event, 'd') ?? ''}`;
  const watchUrl = streamingUrl ?? (status === 'ended' ? recordingUrl : undefined);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-border p-5">
        {image && <img src={image} alt="" className="aspect-video w-full rounded-lg border border-border object-cover" />}
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {topics.map((topic) => (
            <Badge key={topic} variant="outline" className="text-[11px]">
              {topic}
            </Badge>
          ))}
        </div>
        <h1 className="text-xl font-semibold leading-tight tracking-tight">{title}</h1>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <AuthorLine pubkey={hostPubkey(event) ?? event.pubkey} size="sm" />
        {watchUrl ? (
          <Button asChild className="w-full gap-1.5">
            <a href={watchUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" aria-hidden />
              {status === 'ended' && recordingUrl ? 'Watch the recording' : 'Watch the stream'}
            </a>
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">No playback URL was published for this stream.</p>
        )}
      </div>

      <LiveChat address={address} />
    </div>
  );
}
