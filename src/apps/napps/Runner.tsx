import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ExternalLink, Link2, Loader2, RotateCw, ShieldCheck } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useNsite } from '@/hooks/useNsites';
import { useRelayHints } from '@/hooks/useRelayHints';
import { useToast } from '@/hooks/useToast';
import { displayName } from '@/lib/nostrUtils';
import {
  isGatewayRunnable,
  NAPP_KIND,
  nostrappsLaunchUrl,
  nsiteGatewayUrl,
  nsiteNaddr,
  nsiteTitle,
  type Nsite,
  type NsitePointer,
} from '@/lib/nsites';
import { useWindowManager } from '@/os/useWindowManager';
import { KindBadge, SiteIcon } from './parts';
import { useNsiteGateway } from './useNsiteGateway';

/** After this long without a load event, say the gateway may be struggling. */
const SLOW_LOAD_MS = 15_000;

/**
 * Sandbox for a site served by a gateway. The site is on the gateway's origin,
 * never ours, so `allow-same-origin` only lets it keep its own storage. It may
 * not navigate LAYER itself (`allow-top-navigation` is left out); links meant
 * for a new tab still work.
 */
const SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-modals',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-downloads',
].join(' ');

/** Powerful features stay off; a site that needs a camera can be opened in a tab. */
const ALLOW = 'clipboard-write; fullscreen';

export function Runner({
  windowId,
  pointer,
  setTitle,
  onBack,
}: {
  windowId: string;
  pointer: NsitePointer;
  setTitle: (title: string) => void;
  onBack: () => void;
}) {
  const query = useNsite(pointer);
  const site = query.data ?? undefined;
  const author = useAuthor(pointer.pubkey);
  const fallbackName = `${displayName(pointer.pubkey, author.data?.metadata)}’s site`;
  const title = site ? nsiteTitle(site) ?? fallbackName : undefined;

  useEffect(() => {
    setTitle(title ?? 'Napps');
  }, [title, setTitle]);

  if (query.isPending) {
    return (
      <AppLayout>
        <RunnerToolbar onBack={onBack} />
        <AppBody className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-[24%]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <Skeleton className="mt-4 h-64 w-full rounded-xl" />
        </AppBody>
      </AppLayout>
    );
  }

  if (query.isError || !site) {
    return (
      <AppLayout>
        <RunnerToolbar onBack={onBack} />
        <AppBody>
          <EmptyState
            title={query.isError ? 'Couldn’t load this site' : 'Site not found'}
            hint={
              query.isError
                ? 'Your relays could not complete this request.'
                : 'Your relays have no manifest for this address. It may have been published to other relays.'
            }
            action={
              <Button size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                <RotateCw className="size-3.5" aria-hidden /> Try again
              </Button>
            }
          />
        </AppBody>
      </AppLayout>
    );
  }

  if (site.kind === NAPP_KIND || !isGatewayRunnable(site)) {
    return <NotRunnable site={site} title={title ?? fallbackName} onBack={onBack} />;
  }

  return <SiteFrame windowId={windowId} site={site} title={title ?? fallbackName} onBack={onBack} />;
}

function RunnerToolbar({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <AppToolbar className="gap-1.5">
      <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onBack} aria-label="Back to all sites">
        <ChevronLeft className="size-4" aria-hidden />
        <span className="hidden sm:inline">All sites</span>
      </Button>
      {children}
    </AppToolbar>
  );
}

function SiteFrame({
  windowId,
  site,
  title,
  onBack,
}: {
  windowId: string;
  site: Nsite;
  title: string;
  onBack: () => void;
}) {
  const [gateway] = useNsiteGateway();
  const { focusWindow } = useWindowManager();
  const { toast } = useToast();
  const hints = useRelayHints();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const url = nsiteGatewayUrl(site, gateway)!;
  // Load state belongs to one document: another site, gateway or a reload
  // starts unloaded again without an effect having to reset anything.
  const frameKey = `${url}#${reloadKey}`;
  const [loadedKey, setLoadedKey] = useState<string>();
  const [slowKey, setSlowKey] = useState<string>();
  const loaded = loadedKey === frameKey;
  const slow = slowKey === frameKey;

  useEffect(() => {
    const timer = window.setTimeout(() => setSlowKey(frameKey), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [frameKey]);

  // Clicks inside the frame never reach our document, so the window would not
  // come to the front. Focus moving into the frame blurs ours; use that.
  useEffect(() => {
    const onBlur = () => {
      window.setTimeout(() => {
        if (document.activeElement === frameRef.current) focusWindow(windowId);
      }, 0);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [focusWindow, windowId]);

  const copyLink = async () => {
    const link = `${window.location.origin}/${nsiteNaddr(site, hints)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Link copied', description: 'It opens this site in LAYER.' });
    } catch {
      toast({ title: 'Couldn’t copy the link', variant: 'destructive' });
    }
  };

  return (
    <AppLayout>
      <RunnerToolbar onBack={onBack}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SiteIcon site={site} name={title} className="size-6 rounded-md" />
          <span className="truncate text-[13px] font-medium">{title}</span>
          <KindBadge site={site} />
        </div>
        {!loaded && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Loading site" />}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2"
          onClick={() => setReloadKey((key) => key + 1)}
          aria-label="Reload site"
        >
          <RotateCw className="size-3.5" aria-hidden />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={() => void copyLink()} aria-label="Copy link to this site">
          <Link2 className="size-3.5" aria-hidden />
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2">
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open site in a new tab">
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
      </RunnerToolbar>

      <div className="relative min-h-0 flex-1 bg-white">
        <iframe
          key={frameKey}
          ref={frameRef}
          src={url}
          title={title}
          sandbox={SANDBOX}
          allow={ALLOW}
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full border-0"
          onLoad={() => setLoadedKey(frameKey)}
        />
        {!loaded && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
            <SiteIcon site={site} name={title} className="size-16" />
            <p className="text-sm font-medium">Loading {title}…</p>
            {slow && (
              <p className="max-w-xs text-sm text-muted-foreground">
                {gateway} is taking a while. The site’s files may not be on the Blossom servers it lists.
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">
          Served by {gateway} in its own origin. LAYER does not share your keys with it.
        </span>
      </footer>
    </AppLayout>
  );
}

/** Napps and sites without a gateway address: show what it is, and where it can run. */
function NotRunnable({ site, title, onBack }: { site: Nsite; title: string; onBack: () => void }) {
  const napp = site.kind === NAPP_KIND;

  return (
    <AppLayout>
      <RunnerToolbar onBack={onBack} />
      <AppBody className="p-4">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          <div className="flex items-start gap-3">
            <SiteIcon site={site} name={title} className="size-14" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold">{title}</h2>
                <KindBadge site={site} />
              </div>
              {site.description && <p className="mt-1 text-sm text-muted-foreground">{site.description}</p>}
            </div>
          </div>

          <AuthorLine pubkey={site.pubkey} createdAt={site.event.created_at} size="sm" />

          <div className="rounded-xl border border-dashed border-border p-4 text-sm">
            {napp ? (
              <>
                <p className="font-medium">This napp runs in a napp launcher</p>
                <p className="mt-1 text-muted-foreground">
                  Napps expect a launcher to give them a signer, an event store and actions through a
                  bridge. LAYER can’t do that yet, so for now it opens in nostrapps.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">This site can’t be opened through a gateway</p>
                <p className="mt-1 text-muted-foreground">
                  {site.paths.has('/index.html')
                    ? 'Its identifier can’t be part of a NIP-5A hostname (1–13 lowercase letters, digits or dashes).'
                    : 'Its manifest has no /index.html, so there is no page to start from.'}
                </p>
              </>
            )}
          </div>

          {(site.actions.length > 0 || site.requires.length > 0) && (
            <dl className="grid gap-2 text-sm">
              {site.actions.length > 0 && <TagRow label="Handles" values={site.actions} />}
              {site.requires.length > 0 && <TagRow label="Asks for" values={site.requires} />}
            </dl>
          )}

          <div className="flex flex-wrap gap-2">
            {napp && (
              <Button asChild size="sm" className="gap-1.5">
                <a href={nostrappsLaunchUrl(site)} target="_blank" rel="noopener noreferrer">
                  Open in nostrapps <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </Button>
            )}
            {site.source && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={site.source} target="_blank" rel="noopener noreferrer">
                  Source <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </Button>
            )}
          </div>
        </div>
      </AppBody>
    </AppLayout>
  );
}

function TagRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      {values.map((value) => (
        <dd key={value} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
          {value}
        </dd>
      ))}
    </div>
  );
}
