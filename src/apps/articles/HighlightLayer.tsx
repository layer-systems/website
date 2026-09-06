import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Highlighter } from 'lucide-react';
import { AppSectionTitle } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { useCreateHighlight, useHighlights } from '@/hooks/useHighlights';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

interface SelectionState {
  text: string;
  top: number;
  left: number;
}

/**
 * Wraps article content with NIP-84 highlighting: selecting text shows a
 * floating "Highlight" button (à la Medium/Kindle), and existing highlights
 * from the network are listed underneath the article.
 */
export function HighlightLayer({
  address,
  authorPubkey,
  children,
}: {
  /** `kind:pubkey:d-identifier` of the article being read. */
  address: string;
  authorPubkey: string;
  children: ReactNode;
}) {
  const { user } = useCurrentUser();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const create = useCreateHighlight();
  const { toast } = useToast();

  useEffect(() => {
    // No point tracking selection at all when highlighting can't happen —
    // signed out, or the article has no usable address to attach one to.
    // (Stale selection state from before either went missing is harmless:
    // the button below also requires `user && address` to render.)
    if (!user || !address) return;

    function handleSelectionChange() {
      const sel = window.getSelection();
      const container = containerRef.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // commonAncestorContainer, not anchorNode: anchorNode is only where the
      // selection *started*, so a selection that starts inside the article
      // and is dragged out past its boundary would otherwise still pass.
      if (!container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelection({ text, top: rect.top, left: rect.left + rect.width / 2 });
    }

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [user, address]);

  const handleHighlight = async () => {
    if (!selection || !address) return;
    const { text } = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    try {
      await create.mutateAsync({ text, address, authorPubkey });
      toast({ title: 'Highlighted' });
    } catch (error) {
      toast({
        title: 'Could not save highlight',
        description: error instanceof Error ? error.message : 'No relay accepted it.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div ref={containerRef} className="relative">
        {children}

        {user && address && selection && (
          <button
            type="button"
            // Selection collapses on mousedown before onClick fires unless
            // that default is prevented — the button would otherwise vanish
            // the instant it's pressed.
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleHighlight}
            style={{
              position: 'fixed',
              // Clamped so a selection near the top of the viewport doesn't
              // push the button off-screen and out of reach.
              top: Math.max(8, selection.top - 40),
              left: selection.left,
              transform: 'translateX(-50%)',
            }}
            className="z-50 flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg"
          >
            <Highlighter className="size-3.5" aria-hidden />
            Highlight
          </button>
        )}
      </div>

      <HighlightsList address={address} />
    </>
  );
}

function HighlightsList({ address }: { address: string }) {
  const highlights = useHighlights(address);

  if (!highlights.data || highlights.data.length === 0) return null;

  return (
    <section className="mt-10 border-t border-border pt-6">
      <AppSectionTitle>
        {highlights.data.length} {highlights.data.length === 1 ? 'Highlight' : 'Highlights'}
      </AppSectionTitle>
      <ul className="space-y-4">
        {highlights.data.map((event) => (
          <li key={event.id} className="border-l-2 border-primary/40 pl-3">
            <blockquote className="text-[14px] italic leading-relaxed">“{event.content}”</blockquote>
            <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} size="sm" className="mt-1.5" />
          </li>
        ))}
      </ul>
    </section>
  );
}
