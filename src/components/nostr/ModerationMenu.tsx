import { useState } from 'react';
import { Flag, Loader2, MoreHorizontal, ShieldBan, Volume2, VolumeX } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ReportDialog } from './ReportDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBlockPubkey, useIsPubkeyMuted, useSetPubkeyMuted } from '@/hooks/useMuteList';
import { useToast } from '@/hooks/useToast';
import { displayName } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';

interface ModerationMenuProps {
  pubkey: string;
  /** When set, adds a "Report note" action alongside the account-level ones. */
  event?: NostrEvent;
  className?: string;
}

/** Mute, block, and report actions for an account (and optionally one of its notes). */
export function ModerationMenu({ pubkey, event, className }: ModerationMenuProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(pubkey);
  const name = displayName(pubkey, author.data?.metadata);
  const { toast } = useToast();

  const muted = useIsPubkeyMuted(pubkey);
  const setMuted = useSetPubkeyMuted();
  const block = useBlockPubkey();
  const [reportTarget, setReportTarget] = useState<'note' | 'account' | null>(null);

  // Requires a signer to publish list/report events, and moderating yourself
  // makes no sense — same guard BookmarkButton/FollowButton use elsewhere.
  if (!user || user.pubkey === pubkey) return null;

  const busy = setMuted.isPending || block.isPending;

  const handleMuteToggle = async () => {
    try {
      const result = await setMuted.mutateAsync({ pubkey, muted: !muted });
      toast({
        title: muted ? `Unmuted ${name}` : `Muted ${name}`,
        description: !muted && result.usedPublicFallback
          ? 'Your signer can’t encrypt mutes, so this one is public.'
          : undefined,
      });
    } catch (error) {
      toast({
        title: 'Could not update your mute list',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  const handleBlock = async () => {
    try {
      await block.mutateAsync(pubkey);
      toast({ title: `Blocked ${name}`, description: 'They are muted and removed from your follows.' });
    } catch (error) {
      toast({
        title: 'Could not block this account',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('size-7 text-muted-foreground', className)}
            disabled={busy}
            aria-label={`More actions for ${name}`}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="size-3.5" aria-hidden />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleMuteToggle}>
            {muted ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
            {muted ? 'Unmute' : 'Mute'} {name}
          </DropdownMenuItem>
          {!muted && (
            <DropdownMenuItem onClick={handleBlock} variant="destructive">
              <ShieldBan aria-hidden />
              Block {name}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {event && (
            <DropdownMenuItem onClick={() => setReportTarget('note')} variant="destructive">
              <Flag aria-hidden />
              Report note
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setReportTarget('account')} variant="destructive">
            <Flag aria-hidden />
            Report account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={reportTarget !== null}
        onOpenChange={(open) => setReportTarget(open ? reportTarget : null)}
        pubkey={pubkey}
        event={reportTarget === 'note' ? event : undefined}
        name={name}
      />
    </>
  );
}
