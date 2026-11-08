import { useEffect, useMemo, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { NoteContent } from '@/components/nostr/NoteContent';
import { NoteCard } from '@/components/nostr/NoteCard';
import { NoteRelaysDialog } from '@/components/nostr/NoteRelaysDialog';
import { PollCard } from '@/components/nostr/PollCard';
import { PowBadge } from '@/components/nostr/PowBadge';
import { ZapButton } from '@/components/nostr/ZapButton';
import { ReactionButton } from '@/components/nostr/ReactionButton';
import { Composer } from '@/apps/feed/Composer';
import { DraftNote } from './Draft';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import {
  absoluteTime,
  ancestorChain,
  buildReplyTags,
  decodeRelayHints,
  encodeRelayHints,
  displayName,
  threadReplies,
  threadRootId,
  type ReplyNode,
} from '@/lib/nostrUtils';
import { isPoll, POLL_KIND } from '@/lib/polls';
import { cn } from '@/lib/utils';
import { PODCAST_EPISODE_KIND } from '@/lib/podcasts';
import { useWindowManager } from '@/os/useWindowManager';
import type { AppProps } from '@/os/types';

function useNote(id: string | undefined, relays: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'note', id ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query([{ ids: [id!] }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        relays,
      });
      return event ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Most parent lookups a single thread load will chase for missing ancestors. */
const MAX_ANCESTOR_LOOKUPS = 8;

/**
 * Every kind-1 event of the thread `opened` belongs to, loaded by its real
 * NIP-10 root rather than by the opened note: replies deeper in the thread
 * tag the root, so querying `#e` for a reply alone would miss them. Replies
 * that tag only the opened note are included too, and ancestors the root
 * query did not return are fetched one by one up the chain.
 */
function useThread(opened: NostrEvent | undefined, relays: string[] | undefined) {
  const { nostr } = useNostr();
  const rootId = opened ? threadRootId(opened) : undefined;

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'thread', rootId ?? '', opened?.id ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(opened && rootId),
    queryFn: async ({ signal }) => {
      if (!opened || !rootId) return [];
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]), relays };
      const isRoot = rootId === opened.id;

      const events = new Map<string, NostrEvent>([[opened.id, opened]]);
      const found = await nostr.query(
        [
          { kinds: [1], '#e': isRoot ? [rootId] : [rootId, opened.id], limit: 500 },
          ...(isRoot ? [] : [{ ids: [rootId] }]),
        ],
        opts,
      );
      for (const event of found) events.set(event.id, event);

      // Ancestors that do not tag the root (or never reached these relays)
      // are fetched by id, one hop at a time.
      const tried = new Set<string>();
      for (let round = 0; round < MAX_ANCESTOR_LOOKUPS; round += 1) {
        const { missing } = ancestorChain(opened, events.values());
        if (!missing || tried.has(missing)) break;
        tried.add(missing);
        const [parent] = await nostr.query([{ ids: [missing] }], opts);
        if (!parent) break;
        events.set(parent.id, parent);
      }

      return [...events.values()].sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 30_000,
  });
}

/** Number of notes in a reply tree, nested replies included. */
function countNodes(nodes: ReplyNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

export default function NotesApp({ params, setTitle, setParams }: AppProps) {
  const { user } = useCurrentUser();
  const id = params.id;
  // A reply to scroll to and mark, e.g. when opened from a reply notification.
  const highlightId = params.highlight;
  const relays = decodeRelayHints(params.relays);
  const note = useNote(id, relays);
  const thread = useThread(note.data?.kind === 1 ? note.data : undefined, relays);
  const author = useAuthor(note.data?.pubkey);
  // The reply the inline composer is attached to, if any (otherwise the root).
  const [replyTarget, setReplyTarget] = useState<NostrEvent | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const name = note.data ? displayName(note.data.pubkey, author.data?.metadata) : undefined;

  const opened = note.data ?? undefined;
  const rootId = opened ? threadRootId(opened) : undefined;
  // The opened note may itself be a reply: show the conversation above it.
  const ancestors = useMemo(
    () => (opened && thread.data ? ancestorChain(opened, thread.data) : undefined),
    [opened, thread.data],
  );
  // Replies that could not be placed under their NIP-10 parent still render,
  // but apart from the thread so a broken chain never looks like a real one.
  const { replies: wellPlaced, orphaned } = useMemo(() => {
    if (!opened || !rootId || !thread.data) return { replies: [], orphaned: [] };
    const replies = thread.data.filter(
      (event) => event.kind === 1 && event.content.trim().length > 0,
    );
    return threadReplies(rootId, opened.id, replies);
  }, [opened, rootId, thread.data]);
  const replyCount = countNodes(wellPlaced) + countNodes(orphaned);

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
  if (event.kind === POLL_KIND && isPoll(event)) {
    // A plain note1 link can point at a poll; show it the way feeds do and
    // hand voting to the Polls app.
    return <AppLayout><AppBody>
      <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">This event is a poll. Open it to vote and see results.</p>
      <PollCard event={event} relays={relays} />
    </AppBody></AppLayout>;
  }
  if (event.kind !== 1) {
    return <AppLayout><AppBody>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Event kind {event.kind} — Notes only supports kind 1 threads.</p>
        {event.kind === PODCAST_EPISODE_KIND && <OpenInPodcasts event={event} relays={relays} />}
        <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} />
        <p className="whitespace-pre-wrap break-words">{event.content}</p>
      </div>
    </AppBody></AppLayout>;
  }
  const isRootReply = !replyTarget;
  // NIP-10 tags for the note being composed. The root marker always names
  // the thread's real root, even when the opened note is itself a reply.
  const replyTags = buildReplyTags(replyTarget ?? event, user?.pubkey, ancestors?.root);

  const composer = user ? (
    <div ref={composerRef} id="reply-composer">
      <ReplyingToBar target={replyTarget} onCancel={() => setReplyTarget(null)} />
      <Composer
        key={replyTarget?.id ?? 'root'}
        replyTags={replyTags}
        placeholder={replyTarget ? 'Reply to this note…' : 'Write a reply…'}
        onPublished={() => {
          setReplyTarget(null);
          thread.refetch();
        }}
      />
    </div>
  ) : null;

  return (
    <AppLayout>
      <AppToolbar>
        <span className="truncate text-[13px] font-medium">Thread</span>
        <div className="ml-auto flex items-center gap-2">
          {thread.isFetching && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          )}
          <span className="text-xs text-muted-foreground">
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </span>
        </div>
      </AppToolbar>

      <AppBody>
        {ancestors && rootId !== event.id && (
          <section aria-label="Earlier in this thread" className="border-b border-border">
            {ancestors.root ? (
              <NoteCard event={ancestors.root} highlighted={ancestors.root.id === highlightId} />
            ) : (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                The note that started this thread couldn’t be loaded.
              </p>
            )}
            {ancestors.gap && ancestors.root && (
              <p className="px-4 py-2 text-xs text-muted-foreground">
                Some earlier replies couldn’t be loaded.
              </p>
            )}
            {ancestors.chain.map((ancestor) => (
              <NoteCard
                key={ancestor.id}
                event={ancestor}
                highlighted={ancestor.id === highlightId}
              />
            ))}
          </section>
        )}
        <div className="border-b border-border px-4 py-4">
          <AuthorLine pubkey={event.pubkey} />
          <div className="mt-3">
            <NoteContent content={event.content} className="text-base" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs text-muted-foreground">{absoluteTime(event.created_at)}</p>
            <PowBadge event={event} />
            <ZapButton target={event} className="h-6" />
            <ReactionButton target={event} className="h-6" />
            <NoteRelaysDialog id={event.id} hints={relays} />
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
                highlightId={highlightId}
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
                  highlighted={node.event.id === highlightId}
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
                        highlightId={highlightId}
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
  highlightId,
}: {
  node: ReplyNode;
  onReply?: (event: NostrEvent) => void;
  composer?: React.ReactNode;
  replyTargetId?: string;
  highlightId?: string;
}) {
  return (
    <div>
      {node.parentPubkey && (
        <p className="pt-2 pl-11 text-xs text-muted-foreground">
          Replying to <AuthorName pubkey={node.parentPubkey} />
        </p>
      )}
      <NoteCard
        event={node.event}
        onReply={onReply}
        replyOpen={node.event.id === replyTargetId}
        highlighted={node.event.id === highlightId}
      />
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
              highlightId={highlightId}
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
  highlightId,
}: {
  node: ReplyNode;
  depth: number;
  onReply?: (event: NostrEvent) => void;
  composer?: React.ReactNode;
  replyTargetId?: string;
  highlightId?: string;
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
      <NoteCard
        event={node.event}
        onReply={onReply}
        replyOpen={node.event.id === replyTargetId}
        highlighted={node.event.id === highlightId}
      />
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
              highlightId={highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A podcast episode reached through a plain `note`/`nevent` link belongs in the Podcasts app. */
function OpenInPodcasts({ event, relays }: { event: NostrEvent; relays: string[] | undefined }) {
  const { openApp } = useWindowManager();
  const hints = encodeRelayHints(relays);
  return (
    <Button size="sm" onClick={() => openApp('podcasts', { episode: event.id, show: event.pubkey, ...(hints ? { relays: hints } : {}) })}>
      Open in Podcasts
    </Button>
  );
}
