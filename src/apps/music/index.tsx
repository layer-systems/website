import { useEffect, useMemo, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { ArrowLeft, ChevronDown, ChevronUp, Disc3, Heart, ListMusic, Music2, Pause, Play, Plus, Search, Share2, SkipBack, SkipForward, Trash2, Volume2 } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { FeedScopeSelect } from '@/components/nostr/FeedScopeSelect';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMusicPlayer } from '@/hooks/useMusicPlayer';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedScope } from '@/hooks/useFeedScope';
import { useMusicPlaylist, useMusicPlaylists, useMusicTrack, useMusicTracks, usePlaylistTracks, playlistAddresses } from '@/hooks/useMusic';
import { useNip51ListMutation } from '@/hooks/useNip51Lists';
import { useRelayHints } from '@/hooks/useRelayHints';
import { useToast } from '@/hooks/useToast';
import { decodeRelayHints } from '@/lib/nostrUtils';
import { formatDuration, FAVORITES_ID, PLAYLIST_KIND, TRACK_KIND, trackAddress, type Track } from '@/lib/music';
import { generateIdentifier, listNaddr, type Nip51List } from '@/lib/nip51';
import type { AppProps } from '@/os/types';
import { PublishTrack } from './PublishTrack';

type View = 'discover' | 'library' | 'publish';

function MusicArtwork({ track, className = '' }: { track: Track; className?: string }) {
  return track.artwork
    ? <img src={track.artwork} alt="" loading="lazy" className={`bg-muted object-cover ${className}`} />
    : <div className={`flex items-center justify-center bg-primary/10 text-primary ${className}`}><Disc3 className="size-1/3" aria-hidden /></div>;
}

function shareUrl(identifier: string): string { return `${window.location.origin}/${identifier}`; }

export default function MusicApp({ params, setParams, setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const relayHints = useRelayHints();
  const player = useMusicPlayer();
  const { attach } = player;
  useEffect(attach, [attach]);
  const scope = useFeedScope('music:scope');
  const tracks = useMusicTracks(scope.authors, scope.queryKey);
  const ownTracks = useMusicTracks(user ? [user.pubkey] : undefined, ['mine', user?.pubkey ?? '']);
  const playlists = useMusicPlaylists();
  const favorites = useMusicPlaylist(user?.pubkey, FAVORITES_ID);
  const favoriteAddresses = useMemo(() => new Set(playlistAddresses(favorites.data)), [favorites.data]);
  const mutation = useNip51ListMutation();
  const [search, setSearch] = useState('');
  const [newPlaylist, setNewPlaylist] = useState('');
  const [editing, setEditing] = useState(false);
  const kind = Number(params.kind);
  const detail = Boolean(params.pubkey && params.identifier && (kind === TRACK_KIND || kind === PLAYLIST_KIND));
  const view: View = params.view === 'library' || params.view === 'publish' ? params.view : 'discover';
  const trackQuery = useMusicTrack(kind === TRACK_KIND ? params.pubkey : undefined, kind === TRACK_KIND ? params.identifier : undefined, decodeRelayHints(params.relays));
  const playlistQuery = useMusicPlaylist(kind === PLAYLIST_KIND ? params.pubkey : undefined, kind === PLAYLIST_KIND ? params.identifier : undefined, decodeRelayHints(params.relays));
  const playlistTracks = usePlaylistTracks(playlistQuery.data, decodeRelayHints(params.relays));
  const likedTracks = usePlaylistTracks(favorites.data);

  useEffect(() => {
    setTitle(detail ? (kind === TRACK_KIND ? trackQuery.data?.title ?? 'Music track' : playlistQuery.data?.title ?? 'Music playlist') : 'Music');
  }, [detail, kind, trackQuery.data?.title, playlistQuery.data?.title, setTitle]);

  const openTrack = (track: Track) => setParams({ kind: String(TRACK_KIND), pubkey: track.event.pubkey, identifier: track.identifier });
  const openPlaylist = (list: Nip51List) => setParams({ kind: String(PLAYLIST_KIND), pubkey: list.pubkey, identifier: list.identifier ?? '' });
  const navigate = (next: View) => { setEditing(false); setParams({ view: next }); };
  const saveFavorite = async (track: Track) => {
    if (!user) { toast({ title: 'Sign in to save tracks' }); return; }
    const address = trackAddress(track);
    try {
      await mutation.mutateAsync({ kind: PLAYLIST_KIND, identifier: FAVORITES_ID, ops: favoriteAddresses.has(address)
        ? [{ type: 'remove', key: `a:${address}` }]
        : [{ type: 'meta', title: 'Liked tracks' }, { type: 'add', tag: ['a', address], private: false }] });
      toast({ title: favoriteAddresses.has(address) ? 'Removed from liked tracks' : 'Added to liked tracks' });
    } catch (error) { toast({ title: 'Could not update liked tracks', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
  };

  const createPlaylist = async () => {
    const title = newPlaylist.trim();
    if (!title) return;
    const identifier = `music-${generateIdentifier(title)}`;
    try {
      const list = await mutation.mutateAsync({ kind: PLAYLIST_KIND, identifier, create: true, ops: [{ type: 'meta', title }] });
      setNewPlaylist('');
      openPlaylist(list);
      toast({ title: 'Playlist created' });
    } catch (error) { toast({ title: 'Could not create playlist', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
  };

  const shareTrack = async (track: Track) => {
    try {
      await navigator.clipboard.writeText(shareUrl(nip19.naddrEncode({ kind: TRACK_KIND, pubkey: track.event.pubkey, identifier: track.identifier, relays: relayHints })));
      toast({ title: 'Track link copied' });
    } catch { toast({ title: 'Could not copy link', variant: 'destructive' }); }
  };

  return <AppLayout>
    <AppToolbar className="gap-1 bg-background/90">
      <Music2 className="mr-2 size-4 text-primary" aria-hidden />
      {detail || editing ? <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setParams({ view: 'discover' }); }}><ArrowLeft aria-hidden /> Music</Button> : <nav className="flex items-center gap-1" aria-label="Music sections">
        {(['discover', 'library', 'publish'] as View[]).map((item) => <Button key={item} variant={view === item ? 'secondary' : 'ghost'} size="sm" onClick={() => navigate(item)} aria-current={view === item ? 'page' : undefined} className="capitalize">{item}</Button>)}
      </nav>}
      {player.current && <span className="ml-auto hidden max-w-40 truncate text-xs text-muted-foreground sm:block">Playing: {player.current.title}</span>}
    </AppToolbar>
    <AppBody className="bg-gradient-to-br from-primary/5 via-background to-background">
      {editing && trackQuery.data ? <PublishTrack existing={trackQuery.data} onPublished={(pubkey, identifier) => { setEditing(false); setParams({ kind: String(TRACK_KIND), pubkey, identifier }); }} />
        : detail && kind === TRACK_KIND ? <TrackDetail track={trackQuery.data} loading={trackQuery.isPending} error={trackQuery.isError} isOwner={trackQuery.data?.event.pubkey === user?.pubkey} liked={trackQuery.data ? favoriteAddresses.has(trackAddress(trackQuery.data)) : false} playlists={playlists.data ?? []} onPlay={(track) => player.playTracks([track])} onLike={(track) => void saveFavorite(track)} onShare={(track) => void shareTrack(track)} onEdit={() => setEditing(true)} />
        : detail && kind === PLAYLIST_KIND ? <PlaylistDetail key={`${params.pubkey}:${params.identifier}`} list={playlistQuery.data} loading={playlistQuery.isPending} error={playlistQuery.isError} tracks={playlistTracks.data ?? []} tracksLoading={playlistTracks.isPending} own={playlistQuery.data?.pubkey === user?.pubkey} onPlay={(items, index) => player.playTracks(items, index)} />
        : view === 'publish' ? <PublishTrack onPublished={(pubkey, identifier) => setParams({ kind: String(TRACK_KIND), pubkey, identifier })} />
        : view === 'library' ? <div className="mx-auto max-w-4xl p-4 sm:p-8">
          <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Your collection</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Library</h1><p className="mt-2 text-sm text-muted-foreground">Tracks and playlists you saved to Nostr.</p></div>
          {!user ? <EmptyState title="Sign in to build a library" hint="Liked tracks and playlists follow your Nostr account." /> : <>
            <section aria-labelledby="liked-heading"><h2 id="liked-heading" className="mb-3 text-lg font-semibold">Liked tracks</h2>{likedTracks.isPending && favoriteAddresses.size > 0 ? <TrackSkeleton /> : likedTracks.data?.length ? <div className="overflow-hidden rounded-xl border border-border bg-background">{likedTracks.data.map((track, index) => <TrackRow key={trackAddress(track)} track={track} index={index} playing={player.current ? trackAddress(player.current) === trackAddress(track) && player.playing : false} liked onOpen={() => openTrack(track)} onPlay={() => player.current && trackAddress(player.current) === trackAddress(track) ? player.toggle() : player.playTracks(likedTracks.data!, index)} onLike={() => void saveFavorite(track)} />)}</div> : <EmptyState title="No liked tracks yet" hint="Save a track from Discover to find it here." />}</section>
            <section className="mt-10" aria-labelledby="releases-heading"><h2 id="releases-heading" className="mb-3 text-lg font-semibold">Your releases</h2>{ownTracks.isPending ? <TrackSkeleton /> : ownTracks.data?.length ? <div className="overflow-hidden rounded-xl border border-border bg-background">{ownTracks.data.map((track, index) => <TrackRow key={trackAddress(track)} track={track} index={index} playing={player.current ? trackAddress(player.current) === trackAddress(track) && player.playing : false} liked={favoriteAddresses.has(trackAddress(track))} onOpen={() => openTrack(track)} onPlay={() => player.playTracks(ownTracks.data!, index)} onLike={() => void saveFavorite(track)} />)}</div> : <EmptyState title="No tracks published yet" hint="Use Publish to share your first track." />}</section>
            <section className="mt-10" aria-labelledby="playlist-heading"><h2 id="playlist-heading" className="mb-3 text-lg font-semibold">Playlists</h2><div className="mb-4 flex gap-2"><Input aria-label="New playlist name" value={newPlaylist} onChange={(event) => setNewPlaylist(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createPlaylist(); }} placeholder="Name a new playlist" maxLength={100} /><Button disabled={!newPlaylist.trim() || mutation.isPending} onClick={() => void createPlaylist()}><Plus aria-hidden /> Create</Button></div>{playlists.isPending ? <Skeleton className="h-24 w-full" /> : playlists.data?.filter((list) => list.identifier !== FAVORITES_ID).length ? <div className="grid gap-3 sm:grid-cols-2">{playlists.data.filter((list) => list.identifier !== FAVORITES_ID).map((list) => <button key={list.identifier} type="button" onClick={() => openPlaylist(list)} className="flex items-center gap-4 rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"><div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ListMusic aria-hidden /></div><span className="min-w-0"><strong className="block truncate">{list.title ?? 'Untitled playlist'}</strong><span className="text-xs text-muted-foreground">{playlistAddresses(list).length} tracks</span></span></button>)}</div> : <EmptyState title="No playlists yet" hint="Create one to arrange tracks in your own order." />}</section>
          </>}
        </div>
        : <Discover tracks={tracks.data ?? []} loading={tracks.isPending} error={tracks.isError} onRetry={() => void tracks.refetch()} search={search} onSearch={setSearch} scope={scope} liked={favoriteAddresses} player={player} onOpen={openTrack} onLike={(track) => void saveFavorite(track)} />}
    </AppBody>
    <PlayerBar />
  </AppLayout>;
}

function Discover({ tracks, loading, error, onRetry, search, onSearch, scope, liked, player, onOpen, onLike }: {
  tracks: Track[]; loading: boolean; error: boolean; onRetry: () => void; search: string; onSearch: (value: string) => void; scope: ReturnType<typeof useFeedScope>; liked: Set<string>; player: ReturnType<typeof useMusicPlayer>; onOpen: (track: Track) => void; onLike: (track: Track) => void;
}) {
  const filtered = tracks.filter((track) => `${track.title} ${track.artist} ${track.album ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="mx-auto max-w-5xl p-4 sm:p-8">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Open frequency</p><h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Music on Nostr</h1><p className="mt-2 text-sm text-muted-foreground">Independent sounds from the relays you read.</p></div><FeedScopeSelect state={scope} label="Music source" /></div>
    <div className="relative mb-5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input aria-label="Search loaded music" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search title, artist or album" className="pl-9" /></div>
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{scope.label} · Latest tracks</h2>
    {loading ? <TrackSkeleton /> : error ? <EmptyState title="Music could not be loaded" hint="Check your relay connections and try again." action={<Button onClick={onRetry}>Try again</Button>} /> : scope.authors?.length === 0 ? <EmptyState title="No followed artists yet" hint="Try Global to explore tracks across your relays." action={<Button onClick={() => scope.setScope('global')}>Browse Global</Button>} /> : filtered.length ? <div className="overflow-hidden rounded-xl border border-border bg-background/95 shadow-sm">{filtered.map((track, index) => <TrackRow key={trackAddress(track)} track={track} index={index} playing={player.current ? trackAddress(player.current) === trackAddress(track) && player.playing : false} liked={liked.has(trackAddress(track))} onOpen={() => onOpen(track)} onPlay={() => player.current && trackAddress(player.current) === trackAddress(track) ? player.toggle() : player.playTracks(filtered, index)} onLike={() => onLike(track)} />)}</div> : <EmptyState title={search ? 'No matching tracks' : 'No music on these relays yet'} hint={search ? 'Try a different search.' : 'Try Global or another relay, or publish the first track.'} />}
  </div>;
}

function TrackSkeleton() { return <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full rounded-lg" />)}</div>; }

function TrackRow({ track, index, playing, liked, onOpen, onPlay, onLike }: { track: Track; index: number; playing: boolean; liked: boolean; onOpen: () => void; onPlay: () => void; onLike: () => void }) {
  return <div className="group flex min-w-0 items-center gap-3 border-b border-border/70 px-3 py-2 last:border-0 hover:bg-muted/35">
    <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
    <Button variant="ghost" size="icon" onClick={onPlay} aria-label={`${playing ? 'Pause' : 'Play'} ${track.title}`} className="shrink-0">{playing ? <Pause aria-hidden /> : <Play aria-hidden />}</Button>
    <MusicArtwork track={track} className="size-11 shrink-0 rounded-md" />
    <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-ring"><span className="block truncate text-sm font-medium">{track.title}</span><span className="block truncate text-xs text-muted-foreground">{track.artist}{track.album ? ` · ${track.album}` : ''}</span></button>
    <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{formatDuration(track.duration)}</span>
    <Button variant="ghost" size="icon" onClick={onLike} aria-label={liked ? `Remove ${track.title} from liked tracks` : `Like ${track.title}`} className="shrink-0">{liked ? <Heart className="fill-current text-primary" aria-hidden /> : <Heart aria-hidden />}</Button>
  </div>;
}

function TrackDetail({ track, loading, error, isOwner, liked, playlists, onPlay, onLike, onShare, onEdit }: {
  track: Track | null | undefined; loading: boolean; error: boolean; isOwner: boolean; liked: boolean; playlists: Nip51List[]; onPlay: (track: Track) => void; onLike: (track: Track) => void; onShare: (track: Track) => void; onEdit: () => void;
}) {
  const { user } = useCurrentUser();
  const mutation = useNip51ListMutation();
  const { toast } = useToast();
  const [selected, setSelected] = useState('');
  if (loading) return <div className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></div>;
  if (error || !track) return <EmptyState title="Track not found" hint="Your relays did not return this track. Check the link or relay settings." />;
  const add = async () => {
    if (!selected) return;
    try { await mutation.mutateAsync({ kind: PLAYLIST_KIND, identifier: selected, ops: [{ type: 'add', tag: ['a', trackAddress(track)], private: false }] }); toast({ title: 'Added to playlist' }); }
    catch (reason) { toast({ title: 'Could not add track', description: reason instanceof Error ? reason.message : undefined, variant: 'destructive' }); }
  };
  return <div className="mx-auto max-w-4xl p-4 sm:p-8">
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-background/90 p-5 shadow-sm sm:flex-row sm:p-8"><MusicArtwork track={track} className="aspect-square w-full max-w-64 shrink-0 rounded-xl shadow-md" /><div className="flex min-w-0 flex-1 flex-col justify-end"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Track</p><h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-5xl">{track.title}</h1><p className="mt-3 text-lg text-muted-foreground">{track.artist}</p>{track.album && <p className="text-sm text-muted-foreground">{track.album}</p>}<p className="mt-3 text-xs text-muted-foreground">{formatDuration(track.duration)}</p><div className="mt-6 flex flex-wrap gap-2"><Button onClick={() => onPlay(track)}><Play aria-hidden /> Play track</Button><Button variant="outline" onClick={() => onLike(track)} disabled={!user}><Heart className={liked ? 'fill-current' : ''} aria-hidden /> {liked ? 'Liked' : 'Like'}</Button><Button variant="outline" onClick={() => onShare(track)}><Share2 aria-hidden /> Share</Button>{isOwner && <Button variant="outline" onClick={onEdit}>Edit</Button>}</div></div></div>
    <div className="mt-6 max-w-md"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Published by</p><AuthorLine pubkey={track.event.pubkey} createdAt={track.event.created_at} /></div>
    {track.event.content && <p className="mt-6 max-w-prose whitespace-pre-wrap text-sm leading-relaxed">{track.event.content}</p>}
    {user && <div className="mt-8 flex max-w-lg flex-col gap-2"><Label htmlFor="music-add-playlist">Add to a playlist</Label><div className="flex gap-2"><select id="music-add-playlist" value={selected} onChange={(event) => setSelected(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose playlist</option>{playlists.filter((list) => list.identifier !== FAVORITES_ID).map((list) => <option key={list.identifier} value={list.identifier}>{list.title ?? list.identifier}</option>)}</select><Button variant="outline" disabled={!selected || mutation.isPending} onClick={() => void add()}>Add</Button></div></div>}
  </div>;
}

function PlaylistDetail({ list, loading, error, tracks, tracksLoading, own, onPlay }: { list: Nip51List | undefined; loading: boolean; error: boolean; tracks: Track[]; tracksLoading: boolean; own: boolean; onPlay: (tracks: Track[], index: number) => void }) {
  const mutation = useNip51ListMutation();
  const { toast } = useToast();
  const relayHints = useRelayHints();
  const [title, setTitle] = useState<string | null>(null);
  if (loading) return <div className="p-6"><Skeleton className="h-40 w-full rounded-xl" /></div>;
  if (error || !list || !list.eventId) return <EmptyState title="Playlist not found" hint="Your relays did not return this playlist." />;
  const edit = async (ops: Parameters<typeof mutation.mutateAsync>[0]['ops']) => {
    try { await mutation.mutateAsync({ kind: PLAYLIST_KIND, identifier: list.identifier, ops }); toast({ title: 'Playlist updated' }); }
    catch (reason) { toast({ title: 'Could not update playlist', description: reason instanceof Error ? reason.message : undefined, variant: 'destructive' }); }
  };
  const share = async () => {
    try { await navigator.clipboard.writeText(shareUrl(listNaddr(list, relayHints))); toast({ title: 'Playlist link copied' }); }
    catch { toast({ title: 'Could not copy link', variant: 'destructive' }); }
  };
  return <div className="mx-auto max-w-4xl p-4 sm:p-8"><div className="rounded-2xl border border-border bg-background/90 p-5 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Playlist</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">{list.title ?? 'Untitled playlist'}</h1><p className="mt-3 text-sm text-muted-foreground">{playlistAddresses(list).length} tracks</p><div className="mt-5 flex flex-wrap gap-2"><Button disabled={!tracks.length} onClick={() => onPlay(tracks, 0)}><Play aria-hidden /> Play all</Button><Button variant="outline" onClick={() => void share()}><Share2 aria-hidden /> Share</Button></div></div><div className="mt-5 max-w-md"><AuthorLine pubkey={list.pubkey} createdAt={list.createdAt} /></div>
    {own && <div className="mt-6 flex max-w-lg gap-2"><Input aria-label="Playlist title" value={title ?? list.title ?? ''} onChange={(event) => setTitle(event.target.value)} maxLength={100} /><Button variant="outline" disabled={!title?.trim() || title.trim() === list.title || mutation.isPending} onClick={() => void edit([{ type: 'meta', title: title!.trim() }])}>Rename</Button></div>}
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-background">{tracksLoading && playlistAddresses(list).length ? <TrackSkeleton /> : tracks.length ? tracks.map((track, index) => <div key={trackAddress(track)} className="flex items-center border-b border-border last:border-0"><button type="button" onClick={() => onPlay(tracks, index)} aria-label={`Play ${track.title}`} className="p-3 text-primary focus-visible:outline-2 focus-visible:outline-ring"><Play className="size-4" aria-hidden /></button><MusicArtwork track={track} className="size-10 rounded-md" /><div className="min-w-0 flex-1 px-3"><p className="truncate text-sm font-medium">{track.title}</p><p className="truncate text-xs text-muted-foreground">{track.artist}</p></div>{own && <div className="flex"><Button variant="ghost" size="icon" aria-label={`Move ${track.title} up`} disabled={index === 0 || mutation.isPending} onClick={() => void edit([{ type: 'move', key: `a:${trackAddress(track)}`, direction: -1 }])}><ChevronUp aria-hidden /></Button><Button variant="ghost" size="icon" aria-label={`Move ${track.title} down`} disabled={index === tracks.length - 1 || mutation.isPending} onClick={() => void edit([{ type: 'move', key: `a:${trackAddress(track)}`, direction: 1 }])}><ChevronDown aria-hidden /></Button><Button variant="ghost" size="icon" aria-label={`Remove ${track.title}`} disabled={mutation.isPending} onClick={() => void edit([{ type: 'remove', key: `a:${trackAddress(track)}` }])}><Trash2 aria-hidden /></Button></div>}</div>) : <EmptyState title="No playable tracks" hint="Add a track from its detail page, or check your relay connections." />}</div>
  </div>;
}

function PlayerBar() {
  const player = useMusicPlayer();
  if (!player.current) return null;
  return <div className="shrink-0 border-t border-border bg-background px-3 py-2" role="region" aria-label="Music player">
    <div className="flex items-center gap-3"><MusicArtwork track={player.current} className="size-10 shrink-0 rounded-md" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{player.current.title}</p><p className="truncate text-xs text-muted-foreground">{player.current.artist}</p></div><div className="flex items-center"><Button variant="ghost" size="icon" aria-label="Previous track" onClick={player.previous}><SkipBack aria-hidden /></Button><Button variant="ghost" size="icon" aria-label={player.playing ? 'Pause' : 'Play'} onClick={player.toggle}>{player.playing ? <Pause aria-hidden /> : <Play aria-hidden />}</Button><Button variant="ghost" size="icon" aria-label="Next track" onClick={player.next} disabled={player.index >= player.queue.length - 1}><SkipForward aria-hidden /></Button></div><div className="hidden items-center gap-2 sm:flex"><Volume2 className="size-4 text-muted-foreground" aria-hidden /><input type="range" min="0" max="1" step="0.01" value={player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} aria-label="Volume" className="w-16 accent-primary" /></div></div>
    <div className="mt-1 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground"><span>{formatDuration(player.time)}</span><input type="range" min="0" max={player.duration || player.current.duration || 1} step="1" value={Math.min(player.time, player.duration || player.current.duration || 1)} onChange={(event) => player.seek(Number(event.target.value))} aria-label="Seek within track" className="min-w-0 flex-1 accent-primary" /><span>{formatDuration(player.duration || player.current.duration)}</span></div>
    {player.error && <p role="alert" className="text-xs text-destructive">{player.error}</p>}
  </div>;
}
