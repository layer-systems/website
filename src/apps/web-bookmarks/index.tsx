import { useEffect, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { ExternalLink, Loader2, Plus, X } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  bookmarkUrl,
  useCreateWebBookmark,
  useDeleteWebBookmark,
  useMyWebBookmarks,
  webBookmarkTopics,
} from '@/hooks/useWebBookmarks';
import { relativeTime, sanitizeUrl, tagValue } from '@/lib/nostrUtils';
import type { AppProps } from '@/os/types';

export default function WebBookmarksApp({ setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => setTitle('Web Bookmarks'), [setTitle]);

  const bookmarks = useMyWebBookmarks();

  if (!user) {
    return <LoginRequired action="save web bookmarks" />;
  }

  return (
    <AppLayout>
      <AppToolbar>
        <span className="text-[13px] font-medium">Web Bookmarks</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1.5 px-2 text-xs"
          onClick={() => setFormOpen((open) => !open)}
        >
          {formOpen ? <X className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
          {formOpen ? 'Cancel' : 'Add bookmark'}
        </Button>
      </AppToolbar>

      <AppBody>
        {formOpen && <NewBookmarkForm onDone={() => setFormOpen(false)} />}

        {bookmarks.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : bookmarks.data && bookmarks.data.length > 0 ? (
          bookmarks.data.map((event) => <WebBookmarkRow key={event.id} event={event} />)
        ) : (
          <EmptyState
            title="No web bookmarks yet"
            hint="Save a link and it will show up here."
            action={
              !formOpen && (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  Add a bookmark
                </Button>
              )
            }
          />
        )}
      </AppBody>
    </AppLayout>
  );
}

function NewBookmarkForm({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const create = useCreateWebBookmark();
  const { toast } = useToast();

  const trimmedUrl = url.trim();
  const isValid = /^https?:\/\/.+/i.test(trimmedUrl);

  const submit = async () => {
    if (!isValid) return;
    try {
      await create.mutateAsync({
        url: trimmedUrl,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      toast({ title: 'Bookmark saved' });
      onDone();
    } catch (error) {
      toast({
        title: 'Could not save bookmark',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-2.5 border-b border-border px-4 py-3">
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://…"
        autoFocus
        aria-invalid={url.length > 0 && !isValid}
      />
      <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title (optional)" />
      <Textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="min-h-16 resize-none text-[14px]"
      />
      <Input
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        placeholder="Tags, comma separated (optional)"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={!isValid || create.isPending} className="gap-1.5">
          {create.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Save bookmark
        </Button>
      </div>
    </div>
  );
}

function WebBookmarkRow({ event }: { event: NostrEvent }) {
  const del = useDeleteWebBookmark();
  const { toast } = useToast();

  const dTag = tagValue(event, 'd') ?? '';
  const url = sanitizeUrl(bookmarkUrl(dTag)) ?? bookmarkUrl(dTag);
  const title = tagValue(event, 'title') ?? dTag;
  const topics = webBookmarkTopics(event);

  const handleDelete = async () => {
    try {
      await del.mutateAsync(event);
      toast({ title: 'Bookmark removed' });
    } catch (error) {
      toast({
        title: 'Could not remove bookmark',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  return (
    <article className="group border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40">
      <div className="flex items-start justify-between gap-3">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium hover:underline"
        >
          <span className="truncate">{title}</span>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </a>
        <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(event.created_at)}</span>
      </div>

      <p className="mt-0.5 truncate text-xs text-muted-foreground">{dTag}</p>

      {event.content && <p className="mt-1.5 text-[13px] leading-relaxed">{event.content}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {topics.map((topic) => (
          <Badge key={topic} variant="secondary" className="text-[11px]">
            {topic}
          </Badge>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1 px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
          onClick={handleDelete}
          disabled={del.isPending}
        >
          {del.isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <X className="size-3" aria-hidden />}
          Remove
        </Button>
      </div>
    </article>
  );
}
