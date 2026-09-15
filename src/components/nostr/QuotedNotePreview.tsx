import { AuthorLine } from './AuthorLine';
import { NoteContent } from './NoteContent';
import { Skeleton } from '@/components/ui/skeleton';
import { useNote } from '@/hooks/useNote';
import { useWindowManager } from '@/os/useWindowManager';
import { encodeRelayHints } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';

interface QuotedNotePreviewProps {
  id: string;
  relays?: string[];
  className?: string;
}

/**
 * The note a NIP-18 `q` tag points at, embedded inline so a quote post reads
 * as a quote rather than a bare link — while staying visually separate from
 * the quoting author's own words above it.
 *
 * The content region (not the author line) is the click target, so opening
 * the profile and opening the quoted note stay independent affordances
 * instead of one interactive element nested inside another.
 */
export function QuotedNotePreview({ id, relays, className }: QuotedNotePreviewProps) {
  const { openApp } = useWindowManager();
  const note = useNote(id, relays);

  const relayHints = encodeRelayHints(relays);
  const open = () => openApp('notes', relayHints ? { id, relays: relayHints } : { id });

  return (
    <div className={cn('mt-2 rounded-lg border border-border p-3', className)}>
      {note.isLoading ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-3 w-full" />
        </div>
      ) : note.data ? (
        <>
          <AuthorLine pubkey={note.data.pubkey} createdAt={note.data.created_at} size="sm" />
          <div
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
              }
            }}
            className="mt-1.5 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <NoteContent content={note.data.content} className="line-clamp-6 text-sm" />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={open}
          className="text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
        >
          Quoted note unavailable here — it may live on another relay. Open it anyway.
        </button>
      )}
    </div>
  );
}
