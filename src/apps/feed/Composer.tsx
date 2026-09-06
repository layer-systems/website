import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { displayName, sanitizeUrl } from '@/lib/nostrUtils';
import { useToast } from '@/hooks/useToast';

interface ComposerProps {
  /** Tags that turn this note into a reply, per NIP-10. */
  replyTags?: string[][];
  placeholder?: string;
  onPublished?: () => void;
}

export function Composer({ replyTags, placeholder = 'What’s happening?', onPublished }: ComposerProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey);
  const publish = useNostrPublish();
  const { toast } = useToast();
  const [content, setContent] = useState('');

  if (!user) return null;

  const name = displayName(user.pubkey, author.data?.metadata);
  const picture = sanitizeUrl(author.data?.metadata?.picture);
  const trimmed = content.trim();

  const submit = async () => {
    if (!trimmed) return;
    try {
      await publish.mutateAsync({ kind: 1, content: trimmed, tags: replyTags ?? [] });
      setContent('');
      toast({ title: replyTags ? 'Reply published' : 'Note published' });
      onPublished?.();
    } catch (error) {
      toast({
        title: 'Could not publish',
        description: error instanceof Error ? error.message : 'No relay accepted the note.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex gap-3 border-b border-border px-4 py-3">
      <Avatar className="size-9 shrink-0">
        {picture && <AvatarImage src={picture} alt="" />}
        <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-2">
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            // ⌘/Ctrl+Enter sends, matching every other desktop composer.
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          rows={2}
          className="min-h-16 resize-none border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">⌘↵ to publish</span>
          <Button size="sm" onClick={submit} disabled={!trimmed || publish.isPending} className="gap-1.5">
            {publish.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="size-3.5" aria-hidden />
            )}
            {replyTags ? 'Reply' : 'Publish'}
          </Button>
        </div>
      </div>
    </div>
  );
}
