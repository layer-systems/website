import { useCallback, useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Link2 } from 'lucide-react';
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
import { HighlightLayer } from './HighlightLayer';
import { Markdown } from './Markdown';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import {
  absoluteTime,
  decodeRelayHints,
  displayName,
  relativeTime,
  sanitizeUrl,
  tagValue,
} from '@/lib/nostrUtils';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useRelayHints } from '@/hooks/useRelayHints';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { AppParams, AppProps } from '@/os/types';

const ARTICLE_KIND = 30023;

/** A long-form event is only useful with a body and a `d` identifier (NIP-23). */
function isRenderableArticle(event: NostrEvent): boolean {
  return (
    event.kind === ARTICLE_KIND &&
    typeof event.content === 'string' &&
    event.content.trim().length > 0 &&
    Boolean(tagValue(event, 'd'))
  );
}

function useRecentArticles() {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'articles', 'recent'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [ARTICLE_KIND], limit: 40 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      return events.filter(isRenderableArticle).sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useArticle(
  pubkey: string | undefined,
  identifier: string | undefined,
  kind: number,
  relays: string[] | undefined,
) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'article', pubkey ?? '', identifier ?? '', kind, relays?.join(',') ?? ''],
    enabled: Boolean(pubkey && identifier !== undefined),
    queryFn: async ({ signal }) => {
      // Addressable events must be constrained by author, kind and `d` tag.
      const [event] = await nostr.query(
        [{ kinds: [kind], authors: [pubkey!], '#d': [identifier!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]), relays },
      );
      return event ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function ArticlesApp({ params, setTitle, setParams }: AppProps) {
  const isMobile = useIsMobile();

  // The selection lives in the window's params rather than local state, so the
  // URL, a reload and the switch between the desktop and mobile shells all
  // agree on which article is open.
  const selected =
    params.pubkey && params.identifier !== undefined
      ? {
          pubkey: params.pubkey,
          identifier: params.identifier,
          kind: Number(params.kind) || ARTICLE_KIND,
        }
      : null;

  const select = useCallback(
    (next: AppParams | null) => setParams(next ?? {}),
    [setParams],
  );

  const list = useRecentArticles();
  const article = useArticle(
    selected?.pubkey,
    selected?.identifier,
    selected?.kind ?? ARTICLE_KIND,
    decodeRelayHints(params.relays),
  );
  const title = article.data ? tagValue(article.data, 'title') : undefined;

  useEffect(() => {
    setTitle(title ? `Reader — ${title}` : 'Reader');
  }, [title, setTitle]);

  const listPane = (
    <ArticleList
      query={list}
      selected={selected}
      onSelect={(event, identifier) =>
        select({ pubkey: event.pubkey, identifier, kind: String(event.kind) })
      }
    />
  );

  const readerPane = !selected ? (
    <EmptyState
      title="Pick an article"
      hint="Choose one from the list, or open an naddr link to jump straight to it."
    />
  ) : article.isLoading ? (
    <div className="space-y-4 p-8">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  ) : article.data ? (
    <ArticleView event={article.data} />
  ) : (
    <EmptyState title="Article not found" hint="None of your relays returned this article." />
  );

  // Narrow windows have no room for a sidebar, so the list and the article take
  // turns instead of the list simply disappearing.
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
              All articles
            </button>
          ) : (
            <span className="text-[13px] font-medium">Long-form articles</span>
          )}
        </AppToolbar>
        <AppBody>{selected ? readerPane : listPane}</AppBody>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppToolbar>
        <span className="truncate text-[13px] font-medium">
          {title ?? 'Long-form articles'}
        </span>
        {article.data && <CopyArticleLink event={article.data} />}
      </AppToolbar>

      <AppSplit>
        <AppSidebar className="p-0">{listPane}</AppSidebar>
        <AppBody>{readerPane}</AppBody>
      </AppSplit>
    </AppLayout>
  );
}

function CopyArticleLink({ event }: { event: NostrEvent }) {
  const hints = useRelayHints();
  const { toast } = useToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="ml-auto h-7 shrink-0 gap-1.5 px-2 text-xs"
      onClick={async () => {
        try {
          const naddr = nip19.naddrEncode({
            pubkey: event.pubkey,
            kind: event.kind,
            identifier: tagValue(event, 'd') ?? '',
            relays: hints,
          });
          await navigator.clipboard.writeText(`${window.location.origin}/${naddr}`);
          toast({ title: 'Link copied' });
        } catch {
          toast({ title: 'Could not copy the link', variant: 'destructive' });
        }
      }}
    >
      <Link2 className="size-3.5" aria-hidden />
      Copy link
    </Button>
  );
}

function ArticleList({
  query,
  selected,
  onSelect,
}: {
  query: ReturnType<typeof useRecentArticles>;
  selected: { pubkey: string; identifier: string } | null;
  onSelect: (event: NostrEvent, identifier: string) => void;
}) {
  if (query.isLoading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!query.data || query.data.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No articles on your relays.
      </p>
    );
  }

  return (
    <>
      <AppSectionTitle>Recent</AppSectionTitle>
      <ul className="pb-2">
        {query.data.map((event) => {
          const identifier = tagValue(event, 'd')!;
          const active =
            selected?.pubkey === event.pubkey && selected?.identifier === identifier;
          return (
            <li key={`${event.pubkey}:${identifier}`}>
              <ArticleListItem
                event={event}
                active={active}
                onSelect={() => onSelect(event, identifier)}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ArticleListItem({
  event,
  active,
  onSelect,
}: {
  event: NostrEvent;
  active: boolean;
  onSelect: () => void;
}) {
  const author = useAuthor(event.pubkey);
  const title = tagValue(event, 'title') ?? tagValue(event, 'd') ?? 'Untitled';

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
      <span className="line-clamp-2 text-[13px] font-medium leading-snug">{title}</span>
      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
        {displayName(event.pubkey, author.data?.metadata)} · {relativeTime(event.created_at)}
      </span>
    </button>
  );
}

function ArticleView({ event }: { event: NostrEvent }) {
  const title = tagValue(event, 'title') ?? tagValue(event, 'd') ?? 'Untitled';
  const summary = tagValue(event, 'summary');
  const image = sanitizeUrl(tagValue(event, 'image'));
  const publishedAt = Number(tagValue(event, 'published_at')) || event.created_at;

  return (
    <article className="mx-auto max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">{title}</h1>
        {summary && <p className="text-lg text-muted-foreground">{summary}</p>}
        <div className="flex items-center justify-between gap-3 border-y border-border py-3">
          <AuthorLine pubkey={event.pubkey} size="sm" />
          <time
            dateTime={new Date(publishedAt * 1000).toISOString()}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {absoluteTime(publishedAt)}
          </time>
        </div>
        {image && (
          <img src={image} alt="" className="w-full rounded-lg border border-border" />
        )}
      </header>

      <HighlightLayer
        // An empty string (rather than a malformed "kind:pubkey:" address)
        // when the article has no `d` tag — HighlightLayer treats a falsy
        // address as "highlighting isn't available for this article."
        address={tagValue(event, 'd') ? `${event.kind}:${event.pubkey}:${tagValue(event, 'd')}` : ''}
        authorPubkey={event.pubkey}
      >
        <div className="mt-6 text-[15px]">
          <Markdown>{event.content}</Markdown>
        </div>
      </HighlightLayer>
    </article>
  );
}
