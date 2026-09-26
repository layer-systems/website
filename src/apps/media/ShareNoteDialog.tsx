import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { buildImetaTag, type LibraryBlob } from '@/lib/blossom';
import { BlobThumb } from './shared';

/** Publish a kind 1 note that embeds the blob, with a NIP-92 `imeta` tag. */
export function ShareNoteDialog({
  blob,
  open,
  onOpenChange,
}: {
  blob: LibraryBlob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const publish = useNostrPublish();
  const { toast } = useToast();
  const [caption, setCaption] = useState('');

  const submit = async () => {
    const content = [caption.trim(), blob.url].filter(Boolean).join('\n\n');
    try {
      await publish.mutateAsync({ kind: 1, content, tags: [buildImetaTag(blob)] });
      toast({ title: 'Note published' });
      setCaption('');
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Could not publish',
        description: error instanceof Error ? error.message : 'No relay accepted the note.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share as a note</DialogTitle>
          <DialogDescription>The file’s link is added to the end of your note.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3">
          <div className="size-16 shrink-0 overflow-hidden rounded-md border border-border">
            <BlobThumb blob={blob} />
          </div>
          <Textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Say something about it…"
            aria-label="Note text"
            rows={4}
            className="min-h-24 flex-1 resize-none"
          />
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{blob.url}</p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={publish.isPending} className="gap-1.5">
            {publish.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
