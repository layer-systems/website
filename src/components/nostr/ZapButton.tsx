import { useState } from 'react';
import { Zap } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import AuthDialog from '@/components/auth/AuthDialog';
import { ZapDialog } from './ZapDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useZapReceipts, summarizeZapReceipts, formatSats } from '@/hooks/useZaps';
import { cn } from '@/lib/utils';

/**
 * Shows a note's zap total and opens the zap flow (NIP-57), from the feed or
 * a thread.
 *
 * `revealed` gates the zap-receipts query itself, not just the total's
 * visibility: a feed page mounts one of these per note, and firing every
 * one's relay query unconditionally on mount turns a page of notes into a
 * page of concurrent queries before anyone's looked at any of them. Callers
 * in a list (`NoteCard`) pass `revealed` once the row is actually hovered or
 * focused — the same interaction that already reveals the row via CSS — so
 * off-screen or never-looked-at notes never fetch. A caller showing the
 * button on its own (the thread root) can just leave it `true`.
 */
export function ZapButton({ target, className, revealed = true }: { target: NostrEvent; className?: string; revealed?: boolean }) {
  const { user } = useCurrentUser();
  const [authOpen, setAuthOpen] = useState(false);
  const [zapOpen, setZapOpen] = useState(false);
  const receipts = useZapReceipts(target.id, { enabled: revealed || zapOpen });
  const recipient = useAuthor(target.pubkey);

  const { totalSats } = summarizeZapReceipts(receipts.data);

  const handleClick = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setZapOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-7 gap-1.5 px-2 text-xs text-muted-foreground', className)}
        onClick={handleClick}
        aria-label={`Zap${totalSats > 0 ? ` — ${totalSats} sats received` : ''}`}
      >
        <Zap className="size-3.5" aria-hidden />
        <span aria-hidden>{totalSats > 0 ? formatSats(totalSats) : ''}</span>
      </Button>

      <AuthDialog isOpen={authOpen} onClose={() => setAuthOpen(false)} />

      {zapOpen && (
        <ZapDialog
          open={zapOpen}
          onClose={() => setZapOpen(false)}
          target={target}
          recipientMetadata={recipient.data?.event}
          recipientMetadataLoading={recipient.isLoading}
        />
      )}
    </>
  );
}
