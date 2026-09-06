import { useEffect, useMemo, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, Search, X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { Composer } from '@/apps/feed/Composer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { absoluteTime } from '@/lib/nostrUtils';
import { isPicturePost, pictureTags, pictureUrl } from '@/lib/picturePosts';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';

const PAGE_SIZE = 80;

function usePictures(tag: string) {
  const { nostr } = useNostr();
  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'images', tag],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{
        kinds: [20],
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

function useReplies(id: string | undefined) {
  const { nostr } = useNostr();
  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'image-replies', id ?? ''],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [1], '#e': [id!], limit: 100 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      return events.filter((event) => event.content.trim()).sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 30_000,
  });
}

export default function ImagesApp({ params, setParams, setTitle }: AppProps) {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const selected = usePicture(params.id);
  const replies = useReplies(params.id);

  useEffect(() => { setTitle(params.id ? 'Image' : 'Images'); }, [params.id, setTitle]);

  if (params.id) {
    return <PictureDetail event={selected.data} loading={selected.isLoading} replies={replies.data ?? []} onBack={() => setParams({})} onRefresh={() => replies.refetch()} />;
  }

  return <PictureFeed
    tag={tag}
    search={search}
    onTagChange={setTag}
    onSearchChange={setSearch}
    onOpen={(id) => setParams({ id })}
  />;
}

function PictureFeed({ tag, search, onTagChange, onSearchChange, onOpen }: {
  tag: string; search: string; onTagChange: (tag: string) => void; onSearchChange: (value: string) => void; onOpen: (id: string) => void;
}) {
  const { user } = useCurrentUser();
  const query = usePictures(tag);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const pictures = useMemo(() => (query.data ?? []).filter((event) =>
    !normalizedSearch || `${event.content} ${pictureTags(event).join(' ')}`.toLocaleLowerCase().includes(normalizedSearch),
  ), [query.data, normalizedSearch]);

  return (
    <AppLayout>
      <AppToolbar className="gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Search picture posts" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search pictures" className="h-8 pl-8 text-sm" />
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => document.getElementById('image-upload')?.click()} disabled={!user}>
          <ImagePlus className="size-4" aria-hidden /> Upload
        </Button>
      </AppToolbar>
      <AppBody>
        {user && <PictureComposer onPublished={() => query.refetch()} />}
        <div className="flex min-h-10 items-center gap-2 border-b border-border px-3 py-2">
          <Input aria-label="Filter by hashtag" value={tag} onChange={(event) => onTagChange(event.target.value.replace(/^#/, '').trim())} placeholder="Filter #tag" className="h-7 max-w-44 text-xs" />
          {tag && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onTagChange('')}><X className="size-3" aria-hidden /> Clear filter</Button>}
          {query.isFetching && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" aria-label="Loading pictures" />}
        </div>
        {query.isLoading ? <PictureSkeleton /> : query.isError ? (
          <EmptyState title="Couldn’t load pictures" hint="Check your relays and try again." action={<Button size="sm" onClick={() => query.refetch()}>Try again</Button>} />
        ) : pictures.length ? (
          <div className="columns-2 gap-2 p-2 sm:columns-3 lg:columns-4">
            {pictures.map((event) => <PictureTile key={event.id} event={event} onOpen={onOpen} />)}
          </div>
        ) : <EmptyState title={search || tag ? 'No matching pictures' : 'No pictures yet'} hint={search || tag ? 'Try a different search or clear the filter.' : 'Your relays have not returned any picture posts.'} />}
      </AppBody>
    </AppLayout>
  );
}

function PictureTile({ event, onOpen }: { event: NostrEvent; onOpen: (id: string) => void }) {
  const url = pictureUrl(event)!;
  return <button type="button" onClick={() => onOpen(event.id)} className="group mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg bg-muted text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    <img src={url} alt={event.content || 'Picture post'} loading="lazy" className="w-full object-cover transition duration-300 motion-safe:group-hover:scale-[1.02]" />
    <div className="space-y-1 px-2.5 py-2"><AuthorLine pubkey={event.pubkey} createdAt={event.created_at} size="sm" /></div>
  </button>;
}

function PictureDetail({ event, loading, replies, onBack, onRefresh }: { event: NostrEvent | null | undefined; loading: boolean; replies: NostrEvent[]; onBack: () => void; onRefresh: () => void }) {
  const { user } = useCurrentUser();
  if (loading) return <AppLayout><AppToolbar><Button variant="ghost" size="sm" onClick={onBack}>All images</Button></AppToolbar><AppBody><PictureSkeleton /></AppBody></AppLayout>;
  if (!event) return <AppLayout><AppToolbar><Button variant="ghost" size="sm" onClick={onBack}>All images</Button></AppToolbar><EmptyState title="Picture not found" hint="None of your relays returned this picture post." /></AppLayout>;
  const url = pictureUrl(event)!;
  const replyTags = [['e', event.id, '', 'root'], ['p', event.pubkey]];
  return <AppLayout><AppToolbar><Button variant="ghost" size="sm" onClick={onBack}>All images</Button></AppToolbar><AppBody>
    <article className="mx-auto max-w-3xl">
      <img src={url} alt={event.content || 'Picture post'} className="max-h-[65vh] w-full bg-muted object-contain" />
      <div className="space-y-3 p-4"><AuthorLine pubkey={event.pubkey} createdAt={event.created_at} /><p className="whitespace-pre-wrap text-sm">{event.content}</p><p className="text-xs text-muted-foreground">{absoluteTime(event.created_at)}</p>
        {pictureTags(event).length > 0 && <div className="flex flex-wrap gap-1">{pictureTags(event).map((tag) => <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">#{tag}</span>)}</div>}
      </div>
      {user && <Composer replyTags={replyTags} placeholder="Write a reply…" onPublished={onRefresh} />}
      {replies.length ? <div>{replies.map((reply) => <div key={reply.id} className="border-t border-border px-4 py-3"><AuthorLine pubkey={reply.pubkey} createdAt={reply.created_at} /><p className="mt-2 pl-9 text-sm whitespace-pre-wrap">{reply.content}</p></div>)}</div> : <EmptyState title="No replies yet" hint={user ? 'Be the first to reply.' : 'Sign in to reply.'} />}
    </article>
  </AppBody></AppLayout>;
}

function PictureComposer({ onPublished }: { onPublished: () => void }) {
  const upload = useUploadFile();
  const publish = useNostrPublish();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const publishPicture = async () => {
    if (!file) return;
    try {
      const uploadTags = await upload.mutateAsync(file);
      const url = uploadTags.find(([name, value]) => name === 'url' && value)?.[1];
      if (!url) throw new Error('Upload did not return a URL.');
      const imeta = ['imeta', `url ${url}`, ...uploadTags
        .filter(([name, value]) => name !== 'url' && value)
        .map(([name, value]) => `${name} ${value}`)];
      await publish.mutateAsync({ kind: 20, content: description.trim(), tags: [imeta] });
      setFile(null); setDescription(''); toast({ title: 'Picture published' }); onPublished();
    } catch (error) { toast({ title: 'Could not publish picture', description: error instanceof Error ? error.message : 'Upload failed.', variant: 'destructive' }); }
  };
  return <div className="space-y-2 border-b border-border p-3">
    <input id="image-upload" type="file" accept="image/*" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{file?.name ?? 'Choose an image to share'}</span><Button variant="outline" size="sm" onClick={() => document.getElementById('image-upload')?.click()}>Choose image</Button></div>
    {file && <><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe your picture (optional)" rows={2} className="resize-none text-sm" /><Button size="sm" onClick={() => void publishPicture()} disabled={upload.isPending || publish.isPending}>{upload.isPending || publish.isPending ? <Loader2 className="animate-spin" aria-label="Publishing picture" /> : 'Publish picture'}</Button></>}
  </div>;
}

function PictureSkeleton() {
  return <div className="columns-2 gap-2 p-2 sm:columns-3 lg:columns-4">{Array.from({ length: 12 }).map((_, index) => <Skeleton key={index} className={cn('mb-2 w-full break-inside-avoid rounded-lg', index % 3 === 0 ? 'h-52' : index % 3 === 1 ? 'h-36' : 'h-44')} />)}</div>;
}
