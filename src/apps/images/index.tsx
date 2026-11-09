import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ImagePlus, Images, Loader2, Search, X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { FeedScopeSelect } from '@/components/nostr/FeedScopeSelect';
import { EventComments } from '@/components/nostr/EventComments';
import { ReactionButton } from '@/components/nostr/ReactionButton';
import { RepostButton } from '@/components/nostr/RepostButton';
import { ZapButton } from '@/components/nostr/ZapButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type FeedScopeState, useFeedScope } from '@/hooks/useFeedScope';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { absoluteTime } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import { isPicturePost, pictureImages, pictureTags, pictureTitle } from '@/lib/picturePosts';
import type { AppProps } from '@/os/types';

const PAGE_SIZE = 80;

function usePictures({ authors, queryKey }: FeedScopeState, tag: string) {
  const { nostr } = useNostr();
  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'images', ...queryKey, tag],
    // Unresolved or empty author lists have nothing to ask relays for.
    enabled: authors === null || (authors?.length ?? 0) > 0,
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{
        kinds: [20],
        ...(authors ? { authors } : {}),
        ...(tag ? { '#t': [tag] } : {}),
        limit: PAGE_SIZE,
      }], { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
      return events.filter(isPicturePost).sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });
}

function usePicture(id: string | undefined) {
  const { nostr } = useNostr();
  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'image', id ?? ''],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ ids: [id!], kinds: [20] }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      return events.find(isPicturePost) ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

export default function ImagesApp({ params, setParams, setTitle }: AppProps) {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const selected = usePicture(params.id);

  const feedScope = useFeedScope('images:scope');

  useEffect(() => { setTitle(params.id ? 'Image' : `Images — ${feedScope.label}`); }, [params.id, feedScope.label, setTitle]);

  if (params.id) {
    return <PictureDetail
      event={selected.data}
      loading={selected.isLoading}
      onBack={() => setParams({})}
      onTagSelect={(value) => { setTag(value); setSearch(''); setParams({}); }}
    />;
  }

  return <PictureFeed
    feedScope={feedScope}
    tag={tag}
    search={search}
    onTagChange={setTag}
    onSearchChange={setSearch}
    onOpen={(id) => setParams({ id })}
  />;
}

/**
 * Below ~576px cards run edge to edge with only a divider between them, so
 * the picture gets the full width; wider windows show bordered cards.
 */
const CARD_FRAME = 'overflow-hidden border-b border-border bg-card @xl:rounded-xl @xl:border @xl:shadow-sm';

/**
 * Feed layout keys off the window's width (container queries), not the
 * viewport: a narrow window on a wide desktop should still get one column.
 * One post per row below ~768px, then a uniform grid that grows with the window.
 */
const FEED_GRID = 'mx-auto grid w-full max-w-xl grid-cols-1 @xl:gap-4 @xl:p-3 @3xl:max-w-6xl @3xl:grid-cols-2 @3xl:gap-5 @3xl:p-5 @6xl:grid-cols-3 @[96rem]:max-w-[96rem] @[96rem]:grid-cols-4';

export function PictureGrid({ children }: { children: ReactNode }) {
  return <div className={FEED_GRID}>{children}</div>;
}

function PictureFeed({ feedScope, tag, search, onTagChange, onSearchChange, onOpen }: {
  feedScope: FeedScopeState; tag: string; search: string; onTagChange: (tag: string) => void; onSearchChange: (value: string) => void; onOpen: (id: string) => void;
}) {
  const { user } = useCurrentUser();
  const query = usePictures(feedScope, tag);
  const { scope, setScope, authors } = feedScope;
  const hasNoFollows = scope === 'following' && authors?.length === 0;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const pictures = useMemo(() => (query.data ?? []).filter((event) =>
    !normalizedSearch || `${pictureTitle(event) ?? ''} ${event.content} ${pictureTags(event).join(' ')}`.toLocaleLowerCase().includes(normalizedSearch),
  ), [query.data, normalizedSearch]);

  return (
    <AppLayout className="@container">
      <AppToolbar className="gap-2">
        <FeedScopeSelect state={feedScope} label="Picture source" />
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Search picture posts" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search pictures" className="h-8 pl-8 text-sm" />
        </div>
        <Button size="sm" className="h-8 shrink-0 gap-1.5 px-2.5" onClick={() => document.getElementById('image-upload')?.click()} disabled={!user} aria-label="Upload a picture">
          <ImagePlus className="size-4" aria-hidden /> <span className="hidden @md:inline">Upload</span>
        </Button>
      </AppToolbar>
      <AppBody>
        {user && <PictureComposer onPublished={() => query.refetch()} />}
        <div className="flex min-h-10 items-center gap-2 border-b border-border px-3 py-2">
          <Input aria-label="Filter by hashtag" value={tag} onChange={(event) => onTagChange(event.target.value.replace(/^#/, '').trim())} placeholder="Filter #tag" className="h-7 max-w-44 text-xs" />
          {tag && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onTagChange('')}><X className="size-3" aria-hidden /> Clear filter</Button>}
          {query.isFetching && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" aria-label="Loading pictures" />}
        </div>
        {feedScope.followsError ? (
          <EmptyState title="Couldn't load your follow list" hint="Check your relay connections and try again." action={<Button size="sm" onClick={() => void feedScope.refetchFollows()} disabled={feedScope.followsFetching}>Retry</Button>} />
        ) : hasNoFollows ? (
          <EmptyState title="You are not following anyone yet" hint="Switch to Global to discover pictures, then follow people from their profile." action={<Button size="sm" onClick={() => setScope('global')}>Browse Global</Button>} />
        ) : query.isPending ? <PictureSkeleton /> : query.isError ? (
          <EmptyState title="Couldn’t load pictures" hint="Check your relays and try again." action={<Button size="sm" onClick={() => query.refetch()}>Try again</Button>} />
        ) : pictures.length ? (
          <PictureGrid>
            {pictures.map((event) => <PictureCard key={event.id} event={event} onOpen={onOpen} />)}
          </PictureGrid>
        ) : <EmptyState title={search || tag ? 'No matching pictures' : 'No pictures yet'} hint={search || tag ? 'Try a different search or clear the filter.' : scope === 'global' ? 'Your relays have not returned any picture posts.' : 'Nobody here has posted pictures yet. Try Global to see more.'} action={!search && !tag && scope !== 'global' ? <Button size="sm" variant="outline" onClick={() => setScope('global')}>Browse Global</Button> : undefined} />}
      </AppBody>
    </AppLayout>
  );
}

/** True once `ref` has come within ~one screen of the viewport; never resets. */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  // Without IntersectionObserver there is no way to defer, so load right away.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const node = ref.current;
    if (seen || !node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

export function PictureCard({ event, onOpen }: { event: NostrEvent; onOpen: (id: string) => void }) {
  const images = pictureImages(event);
  const cover = images[0];
  const title = pictureTitle(event);
  const caption = event.content.trim();
  // Each card's like and zap counts are their own relay query, so only cards
  // near the viewport fetch them, not every post in an 80-item page.
  const [ref, seen] = useSeen<HTMLElement>();
  return (
    <article ref={ref} className={cn(CARD_FRAME, 'flex min-w-0 flex-col @xl:transition-shadow @xl:hover:shadow-md motion-safe:duration-200')}>
      <div className="px-3 py-2.5"><AuthorLine pubkey={event.pubkey} createdAt={event.created_at} size="sm" /></div>
      <button
        type="button"
        onClick={() => onOpen(event.id)}
        aria-label={`Open picture: ${title || cover.alt}`}
        className="group flex flex-1 flex-col text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <div className="relative w-full overflow-hidden bg-muted">
          <img
            src={cover.url}
            alt={cover.alt}
            width={cover.width}
            height={cover.height}
            loading="lazy"
            decoding="async"
            className="block h-auto max-h-[75vh] w-full object-contain @3xl:aspect-square @3xl:max-h-none @3xl:object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.02]"
          />
          {images.length > 1 && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              <Images className="size-3.5" aria-hidden /> {images.length}
              <span className="sr-only">pictures</span>
            </span>
          )}
        </div>
        {(title || caption) && (
          <div className="w-full space-y-0.5 px-3 pt-2.5">
            {title && <p className="truncate text-sm font-semibold">{title}</p>}
            {caption && caption !== title && <p className="line-clamp-2 text-sm text-muted-foreground">{caption}</p>}
          </div>
        )}
      </button>
      <div className="flex items-center gap-1 px-1.5 py-1.5" role="group" aria-label="Picture actions">
        <ReactionButton target={event} revealed={seen} className="h-8" />
        <ZapButton target={event} revealed={seen} className="h-8" />
      </div>
    </article>
  );
}

function DetailToolbar({ onBack }: { onBack: () => void }) {
  return <AppToolbar><Button variant="ghost" size="sm" className="-ml-1 gap-1 px-2" onClick={onBack}><ChevronLeft className="size-4" aria-hidden /> All images</Button></AppToolbar>;
}

/**
 * Narrow windows stack the picture above its details; wide windows put the
 * details, actions and comments in a side column beside a sticky picture.
 */
function PictureDetail({ event, loading, onBack, onTagSelect }: {
  event: NostrEvent | null | undefined; loading: boolean; onBack: () => void; onTagSelect: (tag: string) => void;
}) {
  if (loading) return <AppLayout><DetailToolbar onBack={onBack} /><AppBody><DetailSkeleton /></AppBody></AppLayout>;
  if (!event) return <AppLayout><DetailToolbar onBack={onBack} /><EmptyState title="Picture not found" hint="None of your relays returned this picture post." /></AppLayout>;
  const images = pictureImages(event);
  const title = pictureTitle(event);
  const tags = pictureTags(event);
  return <AppLayout className="@container"><DetailToolbar onBack={onBack} /><AppBody>
    <article className="mx-auto w-full max-w-3xl @4xl:grid @4xl:max-w-none @4xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] @4xl:items-start">
      <div className="grid gap-1 bg-muted/60 @4xl:sticky @4xl:top-0 @4xl:gap-2 @4xl:p-4">
        {images.map((image, index) => (
          <img
            key={index}
            src={image.url}
            alt={image.alt}
            width={image.width}
            height={image.height}
            decoding="async"
            className="mx-auto block h-auto max-h-[75vh] w-full object-contain @4xl:max-h-[calc(100vh-10rem)]"
          />
        ))}
      </div>
      <div className="min-w-0 @4xl:border-l @4xl:border-border">
        <div className="space-y-3 p-4">
          <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} />
          {title && <h2 className="text-lg font-semibold leading-snug">{title}</h2>}
          {event.content.trim() && event.content.trim() !== title && <p className="whitespace-pre-wrap break-words text-sm">{event.content}</p>}
          {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map((tag) => (
            <button key={tag} type="button" onClick={() => onTagSelect(tag)} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`Show pictures tagged ${tag}`}>#{tag}</button>
          ))}</div>}
          <p className="text-xs text-muted-foreground">{absoluteTime(event.created_at)}</p>
          <div className="-mx-2 flex flex-wrap items-center gap-1 border-y border-border py-1.5" role="group" aria-label="Picture actions">
            <ReactionButton target={event} className="h-8" />
            <RepostButton target={event} className="h-8" />
            <ZapButton target={event} className="h-8" />
          </div>
        </div>
        <EventComments event={event} />
      </div>
    </article>
  </AppBody></AppLayout>;
}

function PictureComposer({ onPublished }: { onPublished: () => void }) {
  const upload = useUploadFile();
  const publish = useNostrPublish();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [title, setPictureTitle] = useState('');
  const [alt, setAlt] = useState('');
  const publishPicture = async () => {
    if (!file) return;
    try {
      const uploadTags = await upload.mutateAsync(file);
      const url = uploadTags.find(([name, value]) => name === 'url' && value)?.[1];
      if (!url) throw new Error('Upload did not return a URL.');
      const pictureTitle = title.trim() || file.name;
      const imageAlt = alt.trim() || description.trim() || pictureTitle;
      const mediaType = uploadTags.find(([name]) => name === 'm')?.[1] || file.type;
      const hash = uploadTags.find(([name]) => name === 'x')?.[1]
        || Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const imeta = ['imeta', `alt ${imageAlt}`, `m ${mediaType}`, `x ${hash}`, `url ${url}`, ...uploadTags
        .filter(([name, value]) => !['url', 'alt', 'm', 'x'].includes(name) && value)
        .map(([name, value]) => `${name} ${value}`)];
      await publish.mutateAsync({ kind: 20, content: description.trim(), tags: [['title', pictureTitle], ['alt', `Picture post: ${imageAlt}`], ['m', mediaType], ['x', hash], imeta] });
      setFile(null); setDescription(''); setPictureTitle(''); setAlt(''); toast({ title: 'Picture published' }); onPublished();
    } catch (error) { toast({ title: 'Could not publish picture', description: error instanceof Error ? error.message : 'Upload failed.', variant: 'destructive' }); }
  };
  return <div className="space-y-2 border-b border-border p-3">
    <input id="image-upload" type="file" accept="image/*" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{file?.name ?? 'Choose an image to share'}</span><Button variant="outline" size="sm" onClick={() => document.getElementById('image-upload')?.click()}>Choose image</Button></div>
    {file && <><Input aria-label="Picture title" value={title} onChange={(event) => setPictureTitle(event.target.value)} placeholder="Picture title (defaults to filename)" /><Input aria-label="Image alternative text" value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="Alternative text: describe what is visible" /><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe your picture (optional)" rows={2} className="resize-none text-sm" /><Button size="sm" onClick={() => void publishPicture()} disabled={upload.isPending || publish.isPending}>{upload.isPending || publish.isPending ? <Loader2 className="animate-spin" aria-label="Publishing picture" /> : 'Publish picture'}</Button></>}
  </div>;
}

function PictureSkeleton() {
  return <div className={FEED_GRID} aria-hidden>{Array.from({ length: 6 }).map((_, index) => (
    <div key={index} className={CARD_FRAME}>
      <div className="flex items-center gap-2 px-3 py-2.5"><Skeleton className="size-7 rounded-full" /><Skeleton className="h-3 w-28" /></div>
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-1.5 px-3 py-2.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-full" /></div>
      <div className="flex gap-2 px-3 pb-2.5"><Skeleton className="h-6 w-10" /><Skeleton className="h-6 w-10" /></div>
    </div>
  ))}</div>;
}

function DetailSkeleton() {
  return <div className="mx-auto w-full max-w-3xl" aria-hidden>
    <Skeleton className="aspect-[4/3] w-full rounded-none" />
    <div className="space-y-3 p-4"><div className="flex items-center gap-2"><Skeleton className="size-9 rounded-full" /><Skeleton className="h-4 w-32" /></div><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
  </div>;
}
