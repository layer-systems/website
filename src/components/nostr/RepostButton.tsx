import { useState } from 'react';
import { Loader2, Quote, Repeat2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AuthDialog from '@/components/auth/AuthDialog';
import { QuoteDialog } from './QuoteDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useReposts, summarizeReposts, useToggleRepost } from '@/hooks/useReposts';
import { cn } from '@/lib/utils';

interface RepostButtonProps {
  target: NostrEvent;
  className?: string;
}

/**
 * Reposts or quote-posts `target` per NIP-18, from the feed or a thread. A
 * plain repost re-shares the note verbatim without losing its context; a
 * quote post opens a composer for the user's own commentary alongside a
 * clear, navigable reference back to the original.
 */
export function RepostButton({ target, className }: RepostButtonProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [authOpen, setAuthOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const reposts = useReposts(target.id);
  const toggle = useToggleRepost();

  const { count, byAuthor } = summarizeReposts(reposts.data);
  const own = user ? byAuthor.get(user.pubkey) : undefined;
  const reposted = Boolean(own);
  // Kind 6/16 isn't replaceable, so un-reposting needs to clear every one of
  // the viewer's own repost events on this note, not just the latest.
  const ownReposts = user ? (reposts.data ?? []).filter((event) => event.pubkey === user.pubkey) : [];

  const requiresAuth = () => {
    if (!user) {
      setAuthOpen(true);
      return true;
    }
    return false;
  };

  const handleRepost = () => {
    if (requiresAuth()) return;
    toggle.mutate(
      { target, ownReposts: reposted ? ownReposts : undefined },
      {
        onError: (error) => {
          toast({
            title: reposted ? 'Could not undo repost' : 'Could not repost',
            description: error instanceof Error ? error.message : 'No relay accepted the update.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleQuote = () => {
    if (requiresAuth()) return;
    setQuoteOpen(true);
  };

  const label = reposted
    ? `Reposted${count > 0 ? ` — ${count} ${count === 1 ? 'repost' : 'reposts'}` : ''}`
    : `Repost${count > 0 ? ` — ${count} ${count === 1 ? 'repost' : 'reposts'}` : ''}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-7 gap-1.5 px-2 text-xs text-muted-foreground', reposted && 'text-emerald-500', className)}
            disabled={toggle.isPending}
            aria-pressed={reposted}
            aria-label={label}
          >
            {toggle.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Repeat2 className="size-3.5" aria-hidden />
            )}
            <span aria-hidden>{count > 0 ? count : ''}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={handleRepost}>
            <Repeat2 className="size-3.5" aria-hidden />
            {reposted ? 'Undo repost' : 'Repost'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleQuote}>
            <Quote className="size-3.5" aria-hidden />
            Quote post
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AuthDialog isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      <QuoteDialog target={target} isOpen={quoteOpen} onClose={() => setQuoteOpen(false)} />
    </>
  );
}
