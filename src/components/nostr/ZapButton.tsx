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

/** Shows a note's zap total and opens the zap flow (NIP-57), from the feed or a thread. */
export function ZapButton({ target, className }: { target: NostrEvent; className?: string }) {
  const { user } = useCurrentUser();
  const [authOpen, setAuthOpen] = useState(false);
  const [zapOpen, setZapOpen] = useState(false);
  const receipts = useZapReceipts(target.id);
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
