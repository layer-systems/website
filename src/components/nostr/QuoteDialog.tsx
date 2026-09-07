import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AuthorLine } from './AuthorLine';
import { NoteContent } from './NoteContent';
import { useCreateQuotePost } from '@/hooks/useReposts';
import { useToast } from '@/hooks/useToast';

interface QuoteDialogProps {
  target: NostrEvent;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Composes a NIP-18 quote post: the user's own commentary plus a clear,
 * embedded reference back to the note being quoted — never a copy of its
 * text, which would lose attribution to the original author.
 */
export function QuoteDialog({ target, isOpen, onClose }: QuoteDialogProps) {
  const [content, setContent] = useState('');
  const createQuote = useCreateQuotePost();
  const { toast } = useToast();

  const handleOpenChange = (open: boolean) => {
    if (open || createQuote.isPending) return;
    onClose();
  };

  const submit = async () => {
    try {
      await createQuote.mutateAsync({ target, content });
      toast({ title: 'Quote post published' });
      setContent('');
      onClose();
    } catch (error) {
      toast({
        title: 'Could not publish quote post',
        description: error instanceof Error ? error.message : 'No relay accepted the note.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quote post</DialogTitle>
        </DialogHeader>

        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Add your commentary… (optional)"
          autoFocus
          rows={3}
          className="resize-none"
        />

        <div className="rounded-lg border border-border p-3">
          <AuthorLine pubkey={target.pubkey} createdAt={target.created_at} size="sm" />
          <NoteContent content={target.content} className="mt-1.5 line-clamp-6 text-sm" />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={createQuote.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={createQuote.isPending} className="gap-1.5">
            {createQuote.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="size-3.5" aria-hidden />
            )}
            Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
