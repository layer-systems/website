import { useState } from 'react';
import { Loader2, Repeat2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import AuthDialog from '@/components/auth/AuthDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { countReposters, useReposts, useToggleRepost } from '@/hooks/useReposts';
import { cn } from '@/lib/utils';

/** Reposts `target` via NIP-18 (kind 6 for notes, kind 16 for everything else). */
export function RepostButton({ target, className }: { target: NostrEvent; className?: string }) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [authOpen, setAuthOpen] = useState(false);
  const reposts = useReposts(target);
  const toggle = useToggleRepost();

  const count = countReposters(reposts.data);
  const ownReposts = user ? (reposts.data ?? []).filter((event) => event.pubkey === user.pubkey) : [];
  const reposted = ownReposts.length > 0;

  const handleClick = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    toggle.mutate(
      { target, ownReposts: reposted ? ownReposts : undefined },
      {
        onSuccess: () => toast({ title: reposted ? 'Repost removed' : 'Reposted' }),
        onError: (error) => {
          toast({
            title: reposted ? 'Could not remove repost' : 'Could not repost',
            description: error instanceof Error ? error.message : 'No relay accepted the update.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const countLabel = count > 0 ? ` — ${count} ${count === 1 ? 'repost' : 'reposts'}` : '';

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-7 gap-1.5 px-2 text-xs text-muted-foreground', reposted && 'text-emerald-600 dark:text-emerald-400', className)}
        onClick={handleClick}
        disabled={toggle.isPending}
        aria-pressed={reposted}
        aria-label={`${reposted ? 'Undo repost' : 'Repost'}${countLabel}`}
      >
        {toggle.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Repeat2 className="size-3.5" aria-hidden />
        )}
        <span aria-hidden>{count > 0 ? count : ''}</span>
      </Button>

      <AuthDialog isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
