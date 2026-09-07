import { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import AuthDialog from '@/components/auth/AuthDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useReactions, summarizeReactions, useToggleReaction } from '@/hooks/useReactions';
import { cn } from '@/lib/utils';

/** Likes `target` (a note or reply) via NIP-25 reactions, from the feed or a thread. */
export function ReactionButton({ target, className }: { target: NostrEvent; className?: string }) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [authOpen, setAuthOpen] = useState(false);
  const reactions = useReactions(target.id);
  const toggle = useToggleReaction();

  const { count, byAuthor } = summarizeReactions(reactions.data);
  const own = user ? byAuthor.get(user.pubkey) : undefined;
  const reacted = Boolean(own && own.content !== '-');
  // Kind 7 isn't replaceable, so the viewer may have more than one reaction
  // event on this note; un-reacting needs to clear all of them, not just the
  // one `summarizeReactions` picked as "latest".
  const ownReactions = user ? (reactions.data ?? []).filter((event) => event.pubkey === user.pubkey) : [];

  const handleClick = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    toggle.mutate(
      { target, ownReactions: reacted ? ownReactions : undefined },
      {
        onError: (error) => {
          toast({
            title: reacted ? 'Could not remove like' : 'Could not like',
            description: error instanceof Error ? error.message : 'No relay accepted the update.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const label = reacted
    ? `Remove your like${count > 0 ? ` — ${count} ${count === 1 ? 'like' : 'likes'}` : ''}`
    : `Like${count > 0 ? ` — ${count} ${count === 1 ? 'like' : 'likes'}` : ''}`;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-7 gap-1.5 px-2 text-xs text-muted-foreground', reacted && 'text-rose-500', className)}
        onClick={handleClick}
        disabled={toggle.isPending}
        aria-pressed={reacted}
        aria-label={label}
      >
        {toggle.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Heart className={cn('size-3.5', reacted && 'fill-current')} aria-hidden />
        )}
        <span aria-hidden>{count > 0 ? count : ''}</span>
      </Button>

      <AuthDialog isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
