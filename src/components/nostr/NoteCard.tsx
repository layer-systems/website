import { useMemo, useState } from 'react';
import { Link2, MessageSquare, MessageSquareReply, Repeat2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { AuthorLine } from './AuthorLine';
import { NoteContent } from './NoteContent';
import { BookmarkButton } from './BookmarkButton';
import { ModerationMenu } from './ModerationMenu';
import { ZapButton } from './ZapButton';
import { ReactionButton } from './ReactionButton';
import { RepostButton } from './RepostButton';
import { QuotedNotePreview } from './QuotedNotePreview';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWindowManager } from '@/os/useWindowManager';
import { useToast } from '@/hooks/useToast';
import { useRelayHints } from '@/hooks/useRelayHints';
import { useAuthor } from '@/hooks/useAuthor';
import { useNote } from '@/hooks/useNote';
import { GENERIC_REPOST_KIND, REPOST_KIND, parseEmbeddedRepost, repostReference } from '@/hooks/useReposts';
import { displayName, genUserName } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';

interface NoteCardProps {
  event: NostrEvent;
  /** Hides the action row (used where actions would be redundant). */
  compact?: boolean;
  /** Turns the thread button into an inline reply affordance for this note. */
  onReply?: (event: NostrEvent) => void;
  /** True while this note is the one being answered in the inline composer. */
  replyOpen?: boolean;
  className?: string;
  /** Guards against pathological (self-referential) repost chains. Internal use only. */
  depth?: number;
}

const MAX_REPOST_DEPTH = 3;

/**
 * One note in a list. Dense by design: a 44px-ish header, the content, and a
 * thin action row — no oversized card padding.
 *
 * A NIP-18 repost (kind 6/16) renders as an attribution banner over the
 * original note rather than as its own bubble, so a repost never loses the
 * context of what was reposted. A NIP-18 quote post is a regular kind-1 note
 * carrying a `q` tag; it renders its author's own words plus an embedded,
 * navigable preview of the quoted note — keeping the two clearly distinct.
 */
export function NoteCard({ event, compact, onReply, replyOpen, className, depth = 0 }: NoteCardProps) {
  const { openApp } = useWindowManager();
  const { toast } = useToast();
  const hints = useRelayHints();
  // Tracks the same interaction that reveals the action row via CSS
  // (`group-hover`/`focus-within`), so `ZapButton` can defer its relay query
  // until this note is actually looked at instead of firing on every mount.
  const [revealed, setRevealed] = useState(false);

  if (event.kind === REPOST_KIND || event.kind === GENERIC_REPOST_KIND) {
    return <RepostedNote event={event} compact={compact} className={className} depth={depth} />;
  }

  const quoteTag = event.tags.find(([name, value]) => name === 'q' && Boolean(value));

  const copyLink = async () => {
    try {
      // Without relay hints a shared link only resolves for people who happen
      // to read the same relays as the sender.
      const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey, relays: hints });
      await navigator.clipboard.writeText(`${window.location.origin}/${nevent}`);
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Could not copy the link', variant: 'destructive' });
    }
  };

  return (
    <article
      aria-label={`Note by ${genUserName(event.pubkey)}`}
      className={cn(
        'group border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40',
        className,
      )}
      onMouseEnter={() => setRevealed(true)}
      onFocus={() => setRevealed(true)}
    >
      <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} />

      <div className="mt-2 pl-11">
        <NoteContent content={event.content} />

        {quoteTag && <QuotedNotePreview id={quoteTag[1]} relays={quoteTag[2] ? [quoteTag[2]] : undefined} />}

        {!compact && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {onReply ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => onReply(event)}
                aria-expanded={!!replyOpen}
                aria-controls="reply-composer"
              >
                <MessageSquareReply className="size-3.5" aria-hidden />
                Reply
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => openApp('notes', { id: event.id })}
              >
                <MessageSquare className="size-3.5" aria-hidden />
                Open thread
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={copyLink}
            >
              <Link2 className="size-3.5" aria-hidden />
              Copy link
            </Button>
            <ZapButton target={event} revealed={revealed} />
            <ReactionButton target={event} />
            <RepostButton target={event} />
            <BookmarkButton target={{ type: 'e', value: event.id }} />
            <ModerationMenu pubkey={event.pubkey} event={event} className="ml-auto" />
          </div>
        )}
      </div>
    </article>
  );
}

interface RepostedNoteProps {
  event: NostrEvent;
  compact?: boolean;
  className?: string;
  depth: number;
}

/** The attribution banner + original note for a NIP-18 repost. */
function RepostedNote({ event, compact, className, depth }: RepostedNoteProps) {
  const { openApp } = useWindowManager();
  const { data: author } = useAuthor(event.pubkey);
  const name = displayName(event.pubkey, author?.metadata);

  const tooDeep = depth >= MAX_REPOST_DEPTH;
  const embedded = useMemo(() => (tooDeep ? null : parseEmbeddedRepost(event)), [event, tooDeep]);
  const reference = repostReference(event);
  // A malformed, self-referential repost (its `e` tag points at itself) must
  // not be followed, or fetching "the original" would just re-render this
  // same repost forever. Once MAX_REPOST_DEPTH is hit, stop following
  // reposts altogether rather than falling through to rendering the repost
  // event's own (JSON) content as if it were a note.
  const fetchId = !tooDeep && !embedded && reference && reference.id !== event.id ? reference.id : undefined;
  const fetched = useNote(fetchId, reference?.relay ? [reference.relay] : undefined);
  const original = embedded ?? fetched.data;

  return (
    <div className={cn('border-b border-border last:border-b-0', className)}>
      <div className="flex items-center gap-1.5 px-4 pt-3 text-xs text-muted-foreground">
        <Repeat2 className="size-3.5 shrink-0" aria-hidden />
        <button
          type="button"
          onClick={() => openApp('profile', { pubkey: event.pubkey })}
          className="truncate font-medium hover:underline"
        >
          {name}
        </button>
        <span>reposted</span>
      </div>

      {tooDeep ? (
        <p className="px-4 pb-3 pl-11 text-xs text-muted-foreground">
          Repost chain is too deep to display.
        </p>
      ) : original ? (
        <NoteCard event={original} compact={compact} className="border-b-0" depth={depth + 1} />
      ) : fetched.isLoading ? (
        <div className="space-y-2 px-4 py-3 pl-11">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : (
        <p className="px-4 pb-3 pl-11 text-xs text-muted-foreground">
          This note is unavailable — it may live on another relay.
        </p>
      )}
    </div>
  );
}
