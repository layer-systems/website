import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowRight, ExternalLink, Loader2, RotateCw, Search, Settings2, Users } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMyFollows } from '@/hooks/useFollows';
import { useMutedPubkeys } from '@/hooks/useMuteList';
import { useNsiteDirectory, type NsiteScope } from '@/hooks/useNsites';
import {
  isGatewayRunnable,
  NAPP_KIND,
  nostrappsLaunchUrl,
  nsiteTitle,
  parseNsiteInput,
  type Nsite,
  type NsitePointer,
} from '@/lib/nsites';
import { cn } from '@/lib/utils';
import { GatewayDialog, KindBadge, SiteIcon } from './parts';
import { useNsiteGateway } from './useNsiteGateway';

const SCOPES: { value: NsiteScope; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'following', label: 'Following' },
  { value: 'mine', label: 'Mine' },
];

type KindFilter = 'all' | 'sites' | 'napps';

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sites', label: 'Sites' },
  { value: 'napps', label: 'Napps' },
];

const PAGE = 48;

function matches(site: Nsite, needle: string): boolean {
  if (!needle) return true;
  return [site.title, site.description, site.identifier]
    .some((value) => value?.toLowerCase().includes(needle));
}

/**
 * Every nsite and napp the user's relays know about, newest first. The search
 * box filters the list, and also accepts an address (naddr, npub, or a NIP-5A
 * gateway hostname) to open a site that isn't listed.
 */
export function Directory({ onOpen }: { onOpen: (pointer: NsitePointer) => void }) {
  const { user } = useCurrentUser();
  const follows = useMyFollows();
  const muted = useMutedPubkeys();
  const [gateway, setGateway] = useNsiteGateway();
  const [scope, setScope] = useState<NsiteScope>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [gatewayOpen, setGatewayOpen] = useState(false);

  const effective: NsiteScope = scope !== 'all' && !user ? 'all' : scope;
  const authors = effective === 'mine' ? (user ? [user.pubkey] : []) : effective === 'following' ? follows.data : undefined;
  const query = useNsiteDirectory(effective, authors);

  const deferredSearch = useDeferredValue(search);
  const needle = deferredSearch.trim().toLowerCase();
  const pointer = useMemo(() => parseNsiteInput(deferredSearch), [deferredSearch]);

  const sites = useMemo(() => {
    return (query.data ?? []).filter((site) => {
      if (muted.includes(site.pubkey)) return false;
      if (kindFilter === 'sites' && site.kind === NAPP_KIND) return false;
      if (kindFilter === 'napps' && site.kind !== NAPP_KIND) return false;
      return pointer ? true : matches(site, needle);
    });
  }, [query.data, muted, kindFilter, needle, pointer]);

  const followingPending = effective === 'following' && follows.isLoading;
  const followingEmpty = effective === 'following' && !follows.isLoading && !follows.data?.length;

  return (
    <AppLayout>
      <AppToolbar>
        <div className="flex min-w-0 items-center gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Whose sites">
          {SCOPES.map((item) => {
            const disabled = item.value !== 'all' && !user;
            return (
              <Button
                key={item.value}
                type="button"
                variant="ghost"
                size="sm"
                role="radio"
                aria-checked={effective === item.value}
                disabled={disabled}
                title={disabled ? 'Sign in to filter by people' : undefined}
                className={cn('h-7 gap-1.5 px-2.5 text-xs', effective === item.value && 'bg-background shadow-sm')}
                onClick={() => {
                  setScope(item.value);
                  setShown(PAGE);
                }}
              >
                {item.value === 'following' && <Users className="size-3.5" aria-hidden />}
                {item.label}
              </Button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {query.isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Loading sites" />}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh sites"
          >
            <RotateCw className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setGatewayOpen(true)}
            aria-label={`Site gateway: ${gateway}`}
            title={`Sites are served by ${gateway}`}
          >
            <Settings2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </AppToolbar>

      <AppBody className="@container">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
          <div className="relative min-w-0 flex-1 basis-48">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setShown(PAGE);
              }}
              placeholder="Search, or paste an naddr or nsite address"
              aria-label="Search sites, or paste an naddr, npub or nsite address"
              className="h-8 pl-8 text-sm"
              spellCheck={false}
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Kind of app">
            {KIND_FILTERS.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant="ghost"
                size="sm"
                role="radio"
                aria-checked={kindFilter === item.value}
                className={cn('h-6 px-2 text-xs', kindFilter === item.value && 'bg-background shadow-sm')}
                onClick={() => {
                  setKindFilter(item.value);
                  setShown(PAGE);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {pointer && (
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => onOpen(pointer)}>
              Open this address <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        )}

        {followingPending || (query.isPending && query.fetchStatus !== 'idle') ? (
          <DirectorySkeleton />
        ) : followingEmpty ? (
          <EmptyState title="Your follow list is empty" hint="Follow a few people, and the sites they publish will show here." />
        ) : query.isError ? (
          <EmptyState
            title="Couldn’t load sites"
            hint="Your relays could not complete this request."
            action={
              <Button size="sm" onClick={() => void query.refetch()}>
                <RotateCw className="size-3.5" aria-hidden /> Try again
              </Button>
            }
          />
        ) : sites.length === 0 ? (
          <EmptyState
            title={needle && !pointer ? 'No matching sites' : 'No sites found'}
            hint={
              needle && !pointer
                ? 'Try another search, or paste the site’s naddr.'
                : effective === 'mine'
                  ? 'Publish a static site as an nsite (for example with nsyte), and it will show here.'
                  : 'Your relays have not returned any nsite or napp manifests.'
            }
          />
        ) : (
          <>
            <ul className="grid gap-3 p-3 @lg:grid-cols-2 @4xl:grid-cols-3" aria-label="Sites and napps" aria-busy={query.isFetching}>
              {sites.slice(0, shown).map((site) => (
                <li key={`${site.kind}:${site.pubkey}:${site.identifier}`}>
                  <SiteCard site={site} gateway={gateway} onOpen={onOpen} />
                </li>
              ))}
            </ul>
            {sites.length > shown && (
              <div className="flex justify-center pb-4">
                <Button variant="outline" size="sm" onClick={() => setShown((count) => count + PAGE)}>
                  Show more ({sites.length - shown} left)
                </Button>
              </div>
            )}
          </>
        )}
      </AppBody>

      <GatewayDialog open={gatewayOpen} onOpenChange={setGatewayOpen} gateway={gateway} onSave={setGateway} />
    </AppLayout>
  );
}

function SiteCard({
  site,
  gateway,
  onOpen,
}: {
  site: Nsite;
  gateway: string;
  onOpen: (pointer: NsitePointer) => void;
}) {
  const title = nsiteTitle(site) ?? 'Untitled site';
  const napp = site.kind === NAPP_KIND;
  const runnable = !napp && isGatewayRunnable(site);
  const open = () => onOpen({ kind: site.kind, pubkey: site.pubkey, identifier: site.identifier });

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex min-w-0 items-start gap-3">
        <SiteIcon site={site} name={title} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{title}</h3>
            <KindBadge site={site} />
          </div>
          <p className={cn('mt-0.5 line-clamp-2 text-sm', site.description ? 'text-muted-foreground' : 'italic text-muted-foreground/70')}>
            {site.description ?? 'No description'}
          </p>
        </div>
      </div>
      <div className="mt-auto flex min-w-0 items-center gap-2">
        <AuthorLine pubkey={site.pubkey} createdAt={site.event.created_at} size="sm" className="min-w-0 flex-1" />
        {napp ? (
          <Button asChild size="sm" variant="secondary" className="h-8 shrink-0 gap-1.5">
            <a
              href={nostrappsLaunchUrl(site)}
              target="_blank"
              rel="noopener noreferrer"
              title="Napps need a launcher’s bridge. Opens nostrapps.com in a new tab"
            >
              nostrapps <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 shrink-0"
            onClick={open}
            disabled={!runnable}
            title={runnable ? `Open in a window, served by ${gateway}` : 'This site has no index page or no canonical address'}
            aria-label={`Open ${title}`}
          >
            Open
          </Button>
        )}
      </div>
    </article>
  );
}

function DirectorySkeleton() {
  return (
    <div className="grid gap-3 p-3 @lg:grid-cols-2 @4xl:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <div className="flex gap-3">
            <Skeleton className="size-12 rounded-[24%]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
