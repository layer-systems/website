import { useEffect, useMemo, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { NoteContent } from '@/components/nostr/NoteContent';
import { NoteCard } from '@/components/nostr/NoteCard';
import { ZapButton } from '@/components/nostr/ZapButton';
import { ReactionButton } from '@/components/nostr/ReactionButton';
import { RepostButton } from '@/components/nostr/RepostButton';
import { Composer } from '@/apps/feed/Composer';
import { DraftNote } from './Draft';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useNote } from '@/hooks/useNote';
import {
  absoluteTime,
  buildReplyTree,
  decodeRelayHints,
  displayName,
  tagValues,
  type ReplyNode,
} from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';

function useReplies(id: string | undefined, relays: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'replies', id ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [1], '#e': [id!], limit: 100 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        relays,
      });
      return events
        .filter((event) => event.content.trim().length > 0)
        .sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 30_000,
  });
}

export default function NotesApp({ params, setTitle, setParams }: AppProps) {
  const { user } = useCurrentUser();
  const id = params.id;
  const relays = decodeRelayHints(params.relays);
  const note = useNote(id, relays);
  const replies = useReplies(id, relays);
  const author = useAuthor(note.data?.pubkey);
  // The reply the inline composer is attached to, if any (otherwise the root).
  const [replyTarget, setReplyTarget] = useState<NostrEvent | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const name = note.data ? displayName(note.data.pubkey, author.data?.metadata) : undefined;

  const root = note.data ?? undefined;
  const tree = useMemo(
    () => (root && replies.data ? buildReplyTree(root.id, replies.data) : []),
    [root, replies.data],
  );
  // Replies that could not be placed under their NIP-10 parent still render,
  // but apart from the thread so a broken chain never looks like a real one.
  const wellPlaced = useMemo(() => tree.filter((node) => !node.misplaced), [tree]);
  const orphaned = useMemo(() => tree.filter((node) => node.misplaced), [tree]);

  useEffect(() => {
    setTitle(id ? (name ? `Note by ${name}` : 'Note') : 'New Note');
  }, [id, name, setTitle]);

  // Moving the composer to another reply brings it into view and hands focus
  // to the textarea, so keyboard and pointer users land in the same place.
  useEffect(() => {
    if (!replyTarget) return;
    const target = composerRef.current;
    if (!target) return;
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
    target.querySelector('textarea')?.focus();
  }, [replyTarget]);

  if (!id) {
    return <DraftNote onPublished={(publishedId) => setParams({ ...params, id: publishedId })} />;
  }

  if (note.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (!note.data) {
    return (
      <EmptyState
        title="Note not found"
        hint="None of your relays returned this note. It may live elsewhere."
        action={
          <Button size="sm" variant="outline" onClick={() => note.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const event = note.data;
  const isRootReply = !replyTarget;
  // NIP-10 tags for the note being composed: a top-level reply marks only the
  // root; a nested reply also marks its parent and carries the thread's
  // participants as p tags.
  const replyTags = replyTarget
    ? [
        ['e', event.id, '', 'root'],
        ['e', replyTarget.id, '', 'reply'],
        ...[event.pubkey, replyTarget.pubkey, ...tagValues(replyTarget, 'p')]
          .filter((pubkey, index, all) => all.indexOf(pubkey) === index)
          .map((pubkey) => ['p', pubkey]),
      ]
    : [
        ['e', event.id, '', 'root'],
        ['p', event.pubkey],
      ];

  const composer = user ? (
    <div ref={composerRef} id="reply-composer">
      <ReplyingToBar target={replyTarget} onCancel={() => setReplyTarget(null)} />
      <Composer
        key={replyTarget?.id ?? 'root'}
        replyTags={replyTags}
        placeholder={replyTarget ? 'Reply to this note…' : 'Write a reply…'}
        onPublished={() => {
          setReplyTarget(null);
          replies.refetch();
        }}
      />
    </div>
  ) : null;

  return (
    <AppLayout>
      <AppToolbar>
        <span className="truncate text-[13px] font-medium">Thread</span>
        <div className="ml-auto flex items-center gap-2">
          {replies.isFetching && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          )}
          <span className="text-xs text-muted-foreground">
            {replies.data?.length ?? 0} {replies.data?.length === 1 ? 'reply' : 'replies'}
          </span>
        </div>
      </AppToolbar>

      <AppBody>
        <div className="border-b border-border px-4 py-4">
          <AuthorLine pubkey={event.pubkey} />
          <div className="mt-3">
            <NoteContent content={event.content} className="text-base" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <p className="text-xs text-muted-foreground">{absoluteTime(event.created_at)}</p>
            <ZapButton target={event} className="h-6" />
            <ReactionButton target={event} className="h-6" />
            <RepostButton target={event} className="h-6" />
          </div>
        </div>

        {isRootReply && composer}

        {wellPlaced.length > 0 ? (
          <div role="tree" aria-label="Replies">
            {wellPlaced.map((node) => (
              <ThreadNode
                key={node.event.id}
                node={node}
                depth={1}
                onReply={user ? setReplyTarget : undefined}
                composer={!isRootReply ? composer : null}
                replyTargetId={replyTarget?.id}
              />
            ))}
          </div>
        ) : orphaned.length === 0 ? (
          <EmptyState title="No replies yet" hint={user ? 'Be the first to answer.' : undefined} />
        ) : null}

        {orphaned.length > 0 && (
          <section
            aria-label="Replies with missing or conflicting parents"
            className="border-t border-border bg-muted/30"
          >
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              Couldn’t be placed in the thread — their parent note is missing or their references
              conflict.
            </p>
            {orphaned.map((node) => (
              <div key={node.event.id}>
                <NoteCard
                  event={node.event}
                  onReply={user ? setReplyTarget : undefined}
                  replyOpen={node.event.id === replyTarget?.id}
                />
                {node.event.id === replyTarget?.id && composer}
                {node.children.length > 0 && (
                  // The orphan's own replies resolved against it fine, so they
                  // stay nested beneath it even though it sits apart.
                  <div className="border-l-2 border-border/70 pl-2 ml-8 sm:pl-3">
                    {node.children.map((child) => (
                      <OrphanBranch
                        key={child.event.id}
                        node={child}
                        onReply={user ? setReplyTarget : undefined}
                        composer={composer}
                        replyTargetId={replyTarget?.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </AppBody>
    </AppLayout>
  );
}

/** Banner above the inline composer saying which note is being answered. */
function ReplyingToBar({
  target,
  onCancel,
}: {
  target: NostrEvent | null;
  onCancel: () => void;
}) {
  if (!target) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">
        Replying to <AuthorName pubkey={target.pubkey} />
      </span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/** An author's display name, with the kind-0 lookup resolved inline. */
function AuthorName({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  return <span className="font-medium text-foreground">{displayName(pubkey, author.data?.metadata)}</span>;
}

/** A well-placed sub-branch beneath an orphaned note (no tree roles — the orphan sits outside the tree). */
function OrphanBranch({
  node,
  onReply,
  composer,
  replyTargetId,
}: {
  node: ReplyNode;
  onReply?: (event: NostrEvent) => void;
  composer?: React.ReactNode;
  replyTargetId?: string;
}) {
  return (
    <div>
      {node.parentPubkey && (
        <p className="pt-2 pl-11 text-xs text-muted-foreground">
          Replying to <AuthorName pubkey={node.parentPubkey} />
        </p>
      )}
      <NoteCard event={node.event} onReply={onReply} replyOpen={node.event.id === replyTargetId} />
      {node.event.id === replyTargetId && composer}
      {node.children.length > 0 && (
        <div className="border-l-2 border-border/70 pl-2 ml-8 sm:pl-3">
          {node.children.map((child) => (
            <OrphanBranch
              key={child.event.id}
              node={child}
              onReply={onReply}
              composer={composer}
              replyTargetId={replyTargetId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One reply and its children, nested with a thread line. */
function ThreadNode({
  node,
  depth,
  onReply,
  composer,
  replyTargetId,
}: {
  node: ReplyNode;
  depth: number;
  onReply?: (event: NostrEvent) => void;
  composer?: React.ReactNode;
  replyTargetId?: string;
}) {
  const isRootReply = depth === 1;

  return (
    <div
      role="treeitem"
      aria-level={depth}
      aria-expanded={node.children.length > 0 ? true : undefined}
      className={cn(
        !isRootReply &&
          // Indent one avatar-width per level (capped at 10rem) with a thread
          // line, so deep conversations stay readable instead of running off
          // screen. Plain min() — theme() is unreliable inside arbitrary values.
          'ml-[min(calc(var(--depth)*2rem),10rem)] border-l-2 border-border/70 pl-2 sm:pl-3',
      )}
      style={!isRootReply ? ({ '--depth': depth - 1 } as React.CSSProperties) : undefined}
    >
      {!isRootReply && node.parentPubkey && (
        <p className="pt-2 pl-11 text-xs text-muted-foreground">
          Replying to <AuthorName pubkey={node.parentPubkey} />
        </p>
      )}
      <NoteCard event={node.event} onReply={onReply} replyOpen={node.event.id === replyTargetId} />
      {node.event.id === replyTargetId && composer}
      {node.children.length > 0 && (
        <div role="group">
          {node.children.map((child) => (
            <ThreadNode
              key={child.event.id}
              node={child}
              depth={depth + 1}
              onReply={onReply}
              composer={composer}
              replyTargetId={replyTargetId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
