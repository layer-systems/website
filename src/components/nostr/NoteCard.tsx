import { MessageSquare, Repeat2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { AuthorLine } from './AuthorLine';
import { NoteContent } from './NoteContent';
import { BookmarkButton } from './BookmarkButton';
import { Button } from '@/components/ui/button';
import { useWindowManager } from '@/os/useWindowManager';
import { useToast } from '@/hooks/useToast';
import { useRelayHints } from '@/hooks/useRelayHints';
import { cn } from '@/lib/utils';

interface NoteCardProps {
  event: NostrEvent;
  /** Hides the reply affordance when the note is already the open thread root. */
  compact?: boolean;
  className?: string;
}

/**
 * One note in a list. Dense by design: a 44px-ish header, the content, and a
 * thin action row — no oversized card padding.
 */
export function NoteCard({ event, compact, className }: NoteCardProps) {
  const { openApp } = useWindowManager();
  const { toast } = useToast();
  const hints = useRelayHints();

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
      className={cn(
        'group border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40',
        className,
      )}
    >
      <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} />

      <div className="mt-2 pl-11">
        <NoteContent content={event.content} />

        {!compact && (
          <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={() => openApp('notes', { id: event.id })}
            >
              <MessageSquare className="size-3.5" aria-hidden />
              Open thread
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={copyLink}
            >
              <Repeat2 className="size-3.5" aria-hidden />
              Copy link
            </Button>
            <BookmarkButton target={{ type: 'e', value: event.id }} />
          </div>
        )}
      </div>
    </article>
  );
}
