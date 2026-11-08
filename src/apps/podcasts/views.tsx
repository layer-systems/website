import { useMemo, useState } from 'react';
import { BadgeCheck, CircleHelp, Copy, ExternalLink, Heart, Loader2, RotateCw, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/os/AppChrome';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { Markdown } from '@/apps/articles/Markdown';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useRelayHints } from '@/hooks/useRelayHints';
import { useToast } from '@/hooks/useToast';
import { useWindowManager } from '@/os/useWindowManager';
import { absoluteTime, displayName, shortNpub } from '@/lib/nostrUtils';
import { progressMap } from '@/lib/podcastPlayer';
import {
  attributePeople,
  episodeNevent,
  type Attribution,
  type PodcastEpisode,
  type PodcastShow,
} from '@/lib/podcasts';
import {
  mergePages,
  useAuthoredClaim,
  useAuthoredLists,
  useEpisode,
  useEpisodeFeed,
  useFavoriteShows,
  useMyAuthoredShows,
  useShowDirectory,
  useShows,
  useToggleFavorite,
} from './hooks';
import { Artwork, ContentWarningGate, EpisodeRow, ListSkeleton, LoadMore, PlayButton, QueueButton, ShowRow } from './shared';

interface Navigate {
  openShow: (pubkey: string) => void;
  openEpisode: (id: string) => void;
}

function useProgress() {
  const { user } = useCurrentUser();
  // Read once per render of a list rather than per row.
  return progressMap(user?.pubkey);
}

function RelayError({ what, onRetry, busy }: { what: string; onRetry: () => void; busy: boolean }) {
  return (
    <EmptyState
      title={`Couldn’t load ${what}`}
      hint="Your relays didn’t answer in time or are unavailable. Check the Relays app, then try again."
      action={
        <Button size="sm" onClick={onRetry} disabled={busy}>
          <RotateCw className="size-3.5" aria-hidden /> Try again
        </Button>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export function RecentEpisodes({ openEpisode }: Pick<Navigate, 'openEpisode'>) {
  const feed = useEpisodeFeed();
  const episodes = useMemo(() => mergePages(feed.data?.pages, (episode) => episode.id), [feed.data]);
  const showKeys = useMemo(() => episodes.map((episode) => episode.showPubkey), [episodes]);
  const shows = useShows(showKeys);
  const progress = useProgress();

  if (feed.isLoading) return <ListSkeleton />;
  if (feed.isError && episodes.length === 0) return <RelayError what="episodes" onRetry={() => void feed.refetch()} busy={feed.isFetching} />;
  if (episodes.length === 0) {
    return (
      <EmptyState
        title="No episodes found"
        hint="None of your relays returned a valid NIP-F4 podcast episode. Try adding a relay that carries podcasts."
      />
    );
  }

  return (
    <>
      <ul aria-label="Recent episodes">
        {episodes.map((episode) => (
          <EpisodeRow
            key={episode.id}
            episode={episode}
            show={shows.data?.get(episode.showPubkey)}
            progress={progress[episode.id]}
            onOpen={() => openEpisode(episode.id)}
          />
        ))}
      </ul>
      <LoadMore hasMore={Boolean(feed.hasNextPage)} loading={feed.isFetchingNextPage} onLoad={() => void feed.fetchNextPage()} label="Older episodes" />
    </>
  );
}

export function ShowDirectory({ openShow }: Pick<Navigate, 'openShow'>) {
  const directory = useShowDirectory();
  const shows = useMemo(() => mergePages(directory.data?.pages, (show) => show.pubkey), [directory.data]);

  if (directory.isLoading) return <ListSkeleton />;
  if (directory.isError && shows.length === 0) return <RelayError what="shows" onRetry={() => void directory.refetch()} busy={directory.isFetching} />;
  if (shows.length === 0) {
    return <EmptyState title="No shows found" hint="None of your relays returned NIP-F4 podcast metadata." />;
  }
  return (
    <>
      <ul aria-label="Shows">
        {shows.map((show) => (
          <ShowRow key={show.pubkey} show={show} onOpen={() => openShow(show.pubkey)} trailing={<FavoriteButton show={show.pubkey} compact />} />
        ))}
      </ul>
      <LoadMore hasMore={Boolean(directory.hasNextPage)} loading={directory.isFetchingNextPage} onLoad={() => void directory.fetchNextPage()} label="More shows" />
    </>
  );
}

export function Favorites({ openShow }: Pick<Navigate, 'openShow'>) {
  const { user } = useCurrentUser();
  const favorites = useFavoriteShows();
  const shows = useShows(favorites.pubkeys);

  if (!user) return <LoginRequired action="keep favorite podcasts" />;

  const notice = (
    <p className="border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      Favorites are a public NIP-51 list (kind 10054): anyone can see which shows you’ve saved. Listening progress stays in this browser.
    </p>
  );

  if (favorites.isLoading) return <>{notice}<ListSkeleton rows={4} /></>;
  if (favorites.isError) return <>{notice}<RelayError what="your favorites" onRetry={() => void favorites.refetch()} busy={favorites.isFetching} /></>;
  if (favorites.pubkeys.length === 0) {
    return <>{notice}<EmptyState title="No favorite shows yet" hint="Open a show and press the heart to save it here." /></>;
  }

  return (
    <>
      {notice}
      <ul aria-label="Favorite shows">
        {favorites.pubkeys.map((pubkey) => {
          const show = shows.data?.get(pubkey);
          if (show) return <ShowRow key={pubkey} show={show} onOpen={() => openShow(pubkey)} trailing={<FavoriteButton show={pubkey} compact />} />;
          return (
            <li key={pubkey} className="flex items-center gap-3 border-b border-border px-3 py-2.5">
              <button
                type="button"
                onClick={() => openShow(pubkey)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Artwork className="size-14" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{shows.isLoading ? 'Loading…' : 'Show without metadata'}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{shortNpub(pubkey)}</span>
                </span>
              </button>
              <FavoriteButton show={pubkey} compact />
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Favorite toggle
// ---------------------------------------------------------------------------

export function FavoriteButton({ show, compact = false }: { show: string; compact?: boolean }) {
  const { user } = useCurrentUser();
  const favorites = useFavoriteShows();
  const toggle = useToggleFavorite();
  const { toast } = useToast();
  if (!user) return null;

  const isFavorite = favorites.pubkeys.includes(show);
  // Never write from a list we couldn't read: the whole list would be replaced.
  const unavailable = favorites.isLoading || favorites.isError;
  const label = isFavorite ? 'Remove from favorites' : 'Add to favorites';

  const onClick = () =>
    toggle.mutate(
      { show, favorite: !isFavorite },
      {
        onSuccess: () => toast({ title: isFavorite ? 'Removed from favorites' : 'Added to your public favorites' }),
        onError: (error) => toast({ title: 'Favorites not updated', description: error.message, variant: 'destructive' }),
      },
    );

  return (
    <Button
      size={compact ? 'icon' : 'sm'}
      variant={isFavorite ? 'secondary' : 'outline'}
      className={compact ? 'size-9 shrink-0' : 'gap-1.5'}
      onClick={onClick}
      disabled={unavailable || toggle.isPending}
      aria-pressed={isFavorite}
      aria-label={compact ? label : undefined}
      title={unavailable ? 'Your favorites list couldn’t be loaded yet' : `${label} (public)`}
    >
      {toggle.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Heart className={isFavorite ? 'size-4 fill-current text-primary' : 'size-4'} aria-hidden />}
      {!compact && (isFavorite ? 'Favorite' : 'Add to favorites')}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

function PersonChip({ person }: { person: Attribution }) {
  const { openApp } = useWindowManager();
  const author = useAuthor(person.pubkey);
  const name = displayName(person.pubkey, author.data?.metadata);
  return (
    <li>
      <button
        type="button"
        onClick={() => openApp('profile', { pubkey: person.pubkey })}
        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        title={person.verified ? 'Confirmed: this person lists the show as theirs' : 'Unconfirmed: the show names this person, but they haven’t confirmed it'}
      >
        {person.verified ? <BadgeCheck className="size-3.5 text-primary" aria-hidden /> : <CircleHelp className="size-3.5 text-muted-foreground" aria-hidden />}
        <span className="max-w-40 truncate font-medium">{name}</span>
        {person.role && <span className="text-muted-foreground">{person.role}</span>}
        <span className="sr-only">{person.verified ? '(confirmed)' : '(unconfirmed claim)'}</span>
      </button>
    </li>
  );
}

function ShowPeople({ show }: { show: PodcastShow }) {
  const { user } = useCurrentUser();
  const keys = useMemo(() => show.people.map((person) => person.pubkey), [show.people]);
  const authored = useAuthoredLists(keys);
  const mine = useMyAuthoredShows();
  const claim = useAuthoredClaim();
  const { toast } = useToast();
  if (show.people.length === 0) return null;

  const people = attributePeople(show, authored.data ?? new Map());
  const confirmed = people.filter((person) => person.verified);
  const claimed = people.filter((person) => !person.verified);
  const userNamed = Boolean(user && show.people.some((person) => person.pubkey === user.pubkey));

  return (
    <div className="space-y-2">
      {authored.isLoading ? (
        <Skeleton className="h-7 w-48" />
      ) : (
        <>
          {confirmed.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Made by</h3>
              <ul className="mt-1 flex flex-wrap gap-1.5">{confirmed.map((person) => <PersonChip key={person.pubkey} person={person} />)}</ul>
            </div>
          )}
          {claimed.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Claimed, not confirmed</h3>
              <ul className="mt-1 flex flex-wrap gap-1.5">{claimed.map((person) => <PersonChip key={person.pubkey} person={person} />)}</ul>
              <p className="mt-1 text-xs text-muted-foreground">
                {authored.isError ? 'Confirmations couldn’t be checked. ' : ''}
                Anyone can name anyone in show metadata. A claim is confirmed only when that person lists the show in their own authored-podcasts list.
              </p>
            </div>
          )}
        </>
      )}
      {userNamed && user && !mine.has(show.pubkey) && (
        <Button
          size="sm"
          variant="outline"
          disabled={claim.isPending}
          onClick={() =>
            claim.mutate(
              { show: show.pubkey, claim: true },
              {
                onSuccess: () => toast({ title: 'Authorship confirmed', description: 'Your authored-podcasts list now names this show.' }),
                onError: (error) => toast({ title: 'Couldn’t confirm', description: error.message, variant: 'destructive' }),
              },
            )
          }
        >
          {claim.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Confirm I work on this show
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Show detail
// ---------------------------------------------------------------------------

export function ShowDetail({ pubkey, relays, openEpisode }: { pubkey: string; relays?: string[]; openEpisode: (id: string) => void }) {
  const { openApp } = useWindowManager();
  const shows = useShows([pubkey], relays);
  const show = shows.data?.get(pubkey);
  const feed = useEpisodeFeed(pubkey, relays);
  const episodes = useMemo(() => mergePages(feed.data?.pages, (episode) => episode.id), [feed.data]);
  const progress = useProgress();
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <header className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row">
        {shows.isLoading ? (
          <Skeleton className="size-32 rounded-xl" />
        ) : (
          <Artwork src={show?.image} alt={show ? `Cover of ${show.title}` : ''} className="size-32 rounded-xl" blurred={show?.contentWarning !== undefined && !revealed} />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          {shows.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-full" /></div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{show?.title ?? 'Show without metadata'}</h2>
              <p className="font-mono text-xs text-muted-foreground">{shortNpub(pubkey)}</p>
              {!show && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {shows.isError ? 'The show’s metadata couldn’t be loaded.' : 'This key hasn’t published NIP-F4 show metadata on your relays.'}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <FavoriteButton show={pubkey} />
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => openApp('profile', { pubkey })}>
              <UserRound className="size-4" aria-hidden /> Profile
            </Button>
            {show?.websites.map((url) => (
              <Button key={url} size="sm" variant="ghost" className="gap-1.5" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink className="size-4" aria-hidden /> {new URL(url).hostname}
                </a>
              </Button>
            ))}
          </div>
          {show && (
            <ContentWarningGate reason={show.contentWarning} revealed={revealed} onReveal={() => setRevealed(true)}>
              {show.description && <p className="whitespace-pre-wrap text-sm leading-6">{show.description}</p>}
            </ContentWarningGate>
          )}
          {show && <ShowPeople show={show} />}
        </div>
      </header>

      <h3 className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Episodes</h3>
      {feed.isLoading ? (
        <ListSkeleton rows={4} />
      ) : feed.isError && episodes.length === 0 ? (
        <RelayError what="episodes" onRetry={() => void feed.refetch()} busy={feed.isFetching} />
      ) : episodes.length === 0 ? (
        <EmptyState title="No episodes yet" hint="Your relays returned no valid episodes signed by this show’s key." />
      ) : (
        <>
          <ul aria-label="Episodes">
            {episodes.map((episode) => (
              <EpisodeRow key={episode.id} episode={episode} show={show} progress={progress[episode.id]} onOpen={() => openEpisode(episode.id)} />
            ))}
          </ul>
          <LoadMore hasMore={Boolean(feed.hasNextPage)} loading={feed.isFetchingNextPage} onLoad={() => void feed.fetchNextPage()} label="Older episodes" />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Episode detail
// ---------------------------------------------------------------------------

export function EpisodeDetail({ id, relays, openShow }: { id: string; relays?: string[]; openShow: (pubkey: string) => void }) {
  const query = useEpisode(id, relays);
  const episode = query.data?.episode;
  const shows = useShows(episode ? [episode.showPubkey] : [], relays);
  const show = episode ? shows.data?.get(episode.showPubkey) : undefined;

  if (query.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="size-40 rounded-xl" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError) return <RelayError what="this episode" onRetry={() => void query.refetch()} busy={query.isFetching} />;
  if (!episode) {
    return (
      <EmptyState
        title="Episode not found"
        hint="None of your relays returned a valid podcast episode with this id. It may be on a relay you don’t use, or it lacks a title or an https audio file."
        action={<Button size="sm" onClick={() => void query.refetch()}><RotateCw className="size-3.5" aria-hidden /> Try again</Button>}
      />
    );
  }
  return <EpisodeView episode={episode} show={show} openShow={openShow} />;
}

function EpisodeView({ episode, show, openShow }: { episode: PodcastEpisode; show?: PodcastShow; openShow: (pubkey: string) => void }) {
  const hints = useRelayHints();
  const { toast } = useToast();
  const warning = episode.contentWarning ?? show?.contentWarning;
  const [revealed, setRevealed] = useState(false);

  const copyLink = async () => {
    const link = `${window.location.origin}/${episodeNevent(episode, hints)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Episode link copied' });
    } catch {
      toast({ title: 'Couldn’t copy the link', description: link, variant: 'destructive' });
    }
  };

  return (
    <article className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Artwork src={episode.image ?? show?.image} alt="" className="size-40 rounded-xl" blurred={warning !== undefined && !revealed} />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{episode.title}</h2>
          <button
            type="button"
            onClick={() => openShow(episode.showPubkey)}
            className="rounded text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {show?.title ?? `Show ${shortNpub(episode.showPubkey)}`}
          </button>
          <p className="text-xs text-muted-foreground">
            <time dateTime={new Date(episode.createdAt * 1000).toISOString()}>{absoluteTime(episode.createdAt)}</time>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <PlayButton episode={episode} show={show} className="size-10" />
            <QueueButton episode={episode} show={show} />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copyLink()}>
              <Copy className="size-3.5" aria-hidden /> Copy link
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <ContentWarningGate reason={warning} revealed={revealed} onReveal={() => setRevealed(true)}>
          {episode.description && <p className="whitespace-pre-wrap text-[15px] leading-7">{episode.description}</p>}
          {episode.notes.trim() && (
            <section aria-label="Show notes" className="border-t border-border pt-2 text-[15px]">
              <Markdown>{episode.notes}</Markdown>
            </section>
          )}
        </ContentWarningGate>

        <section className="border-t border-border pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Audio files</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {episode.sources.map((source) => (
              <li key={source.url} className="flex min-w-0 items-center gap-2">
                <a href={source.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-primary hover:underline">
                  {new URL(source.url).hostname}
                </a>
                {source.type && <span className="shrink-0 text-xs text-muted-foreground">{source.type}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}
