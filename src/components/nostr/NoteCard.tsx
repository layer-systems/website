import { useState } from 'react';
import { MessageSquare, MessageSquareReply, Repeat2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { AuthorLine } from './AuthorLine';
import { NoteContent } from './NoteContent';
import { BookmarkButton } from './BookmarkButton';
import { ModerationMenu } from './ModerationMenu';
import { ZapButton } from './ZapButton';
import { ReactionButton } from './ReactionButton';
import { Button } from '@/components/ui/button';
import { useWindowManager } from '@/os/useWindowManager';
import { useToast } from '@/hooks/useToast';
import { useRelayHints } from '@/hooks/useRelayHints';
import { genUserName } from '@/lib/nostrUtils';
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
}

/**
 * One note in a list. Dense by design: a 44px-ish header, the content, and a
 * thin action row — no oversized card padding.
 */
export function NoteCard({ event, compact, onReply, replyOpen, className }: NoteCardProps) {
  const { openApp } = useWindowManager();
  const { toast } = useToast();
  const hints = useRelayHints();
  // Tracks the same interaction that reveals the action row via CSS
  // (`group-hover`/`focus-within`), so `ZapButton` can defer its relay query
  // until this note is actually looked at instead of firing on every mount.
  const [revealed, setRevealed] = useState(false);

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
              <Repeat2 className="size-3.5" aria-hidden />
              Copy link
            </Button>
            <ZapButton target={event} revealed={revealed} />
            <ReactionButton target={event} />
            <BookmarkButton target={{ type: 'e', value: event.id }} />
            <ModerationMenu pubkey={event.pubkey} event={event} className="ml-auto" />
          </div>
        )}
      </div>
    </article>
  );
}
