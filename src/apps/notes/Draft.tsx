import { useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';

const DRAFT_KEY = 'layer-os:draft-note';

/**
 * A blank note kept as a local draft — not published until you say so, and
 * not lost between sessions or windows in the meantime. This is the "open a
 * new note" entry point (reachable from the Go menu, the command palette,
 * and the Feed toolbar) for writing something before deciding it is worth
 * publishing.
 */
export function DraftNote({ onPublished }: { onPublished: (id: string) => void }) {
  const { user } = useCurrentUser();
  const [draft, setDraft] = useLocalStorage(DRAFT_KEY, '');
  const publish = useNostrPublish();
  const { toast } = useToast();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const trimmed = draft.trim();

  const handlePublish = async () => {
    if (!trimmed) return;
    try {
      const event = await publish.mutateAsync({ kind: 1, content: trimmed, tags: [] });
      setDraft('');
      toast({ title: 'Note published' });
      onPublished(event.id);
    } catch (error) {
      toast({
        title: 'Could not publish',
        description: error instanceof Error ? error.message : 'No relay accepted the note.',
        variant: 'destructive',
      });
    }
  };

  const handleDiscard = () => {
    if (!confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    setDraft('');
    setConfirmingDiscard(false);
  };

  return (
    <AppLayout>
      <AppToolbar>
        <span className="text-[13px] font-medium">New Note</span>
        <div className="ml-auto flex items-center gap-2">
          {draft && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={handleDiscard}
              onBlur={() => setConfirmingDiscard(false)}
            >
              <Trash2 className="size-3.5" aria-hidden />
              {confirmingDiscard ? 'Click again to discard' : 'Discard draft'}
            </Button>
          )}
          {user && (
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={handlePublish}
              disabled={!trimmed || publish.isPending}
            >
              {publish.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Send className="size-3.5" aria-hidden />
              )}
              Publish
            </Button>
          )}
        </div>
      </AppToolbar>

      <AppBody className="flex flex-col p-4">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            user
              ? 'Write something… it’s kept as a local draft until you publish it.'
              : 'Write something… it’s kept as a local draft on this device. Sign in to publish it.'
          }
          autoFocus
          className="min-h-40 flex-1 resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
        />
      </AppBody>
    </AppLayout>
  );
}
