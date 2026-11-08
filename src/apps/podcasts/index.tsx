import { useCallback, useEffect, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import { decodeRelayHints, encodeRelayHints } from '@/lib/nostrUtils';
import { setPlayerAccount } from '@/lib/podcastPlayer';
import { isHexPubkey } from '@/lib/podcasts';
import type { AppParams, AppProps } from '@/os/types';
import { PlayerBar } from './PlayerBar';
import { Publish } from './Publish';
import { EpisodeDetail, Favorites, RecentEpisodes, ShowDetail, ShowDirectory } from './views';

type View = 'episodes' | 'shows' | 'favorites' | 'publish';

const VIEWS: { id: View; label: string }[] = [
  { id: 'episodes', label: 'Episodes' },
  { id: 'shows', label: 'Shows' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'publish', label: 'Publish' },
];

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * NIP-F4 podcasts. Navigation lives in window params — `view`, `show`
 * (the show's pubkey), `episode` (event id) and `relays` hints — so a reload,
 * a shared link or a desktop↔mobile shell switch reopens the same screen.
 * Playback itself lives in `podcastPlayer`, outside this component.
 */
export default function PodcastsApp({ params, setParams, setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const view: View = VIEWS.some((candidate) => candidate.id === params.view) ? (params.view as View) : 'episodes';
  const show = isHexPubkey(params.show) ? params.show : undefined;
  const episode = params.episode && HEX64.test(params.episode) ? params.episode : undefined;
  const relays = useMemo(() => decodeRelayHints(params.relays), [params.relays]);

  useEffect(() => setPlayerAccount(user?.pubkey), [user?.pubkey]);

  useEffect(() => {
    setTitle(episode ? 'Podcasts — Episode' : show ? 'Podcasts — Show' : 'Podcasts');
  }, [episode, show, setTitle]);

  const navigate = useCallback(
    (next: { view?: View; show?: string; episode?: string; relays?: string[] }) => {
      const result: AppParams = { view: next.view ?? view };
      if (next.show) result.show = next.show;
      if (next.episode) result.episode = next.episode;
      const hints = encodeRelayHints(next.relays);
      if (hints) result.relays = hints;
      setParams(result);
    },
    [setParams, view],
  );

  // Relay hints from a shared link stay with the window: the show's other
  // events most likely live on the same relays.
  const openShow = useCallback((pubkey: string) => navigate({ show: pubkey, relays }), [navigate, relays]);
  const openEpisode = useCallback((id: string) => navigate({ episode: id, show, relays }), [navigate, show, relays]);
  const back = () => (episode && show ? navigate({ show, relays }) : navigate({}));

  let content;
  if (episode) content = <EpisodeDetail id={episode} relays={relays} openShow={openShow} />;
  else if (show) content = <ShowDetail pubkey={show} relays={relays} openEpisode={openEpisode} />;
  else if (view === 'shows') content = <ShowDirectory openShow={openShow} />;
  else if (view === 'favorites') content = <Favorites openShow={openShow} />;
  else if (view === 'publish') content = <Publish onPublished={(id) => navigate({ episode: id, show: user?.pubkey })} />;
  else content = <RecentEpisodes openEpisode={openEpisode} />;

  return (
    <AppLayout>
      <AppToolbar>
        {episode || show ? (
          <Button variant="ghost" size="sm" className="-ml-1 gap-1" onClick={back}>
            <ChevronLeft className="size-4" aria-hidden />
            {episode && show ? 'Show' : VIEWS.find((candidate) => candidate.id === view)?.label}
          </Button>
        ) : (
          <nav aria-label="Podcasts sections" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {VIEWS.map((candidate) => (
              <Button
                key={candidate.id}
                type="button"
                variant="ghost"
                size="sm"
                aria-current={view === candidate.id ? 'page' : undefined}
                onClick={() => navigate({ view: candidate.id })}
                className={cn('h-7 flex-1 text-xs', view === candidate.id && 'bg-background shadow-sm')}
              >
                {candidate.label}
              </Button>
            ))}
          </nav>
        )}
      </AppToolbar>
      <AppBody>{content}</AppBody>
      <PlayerBar onOpenEpisode={(id, showPubkey) => navigate({ episode: id, show: showPubkey })} />
    </AppLayout>
  );
}
