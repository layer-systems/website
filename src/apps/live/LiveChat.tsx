import { useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, EmptyState } from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { NoteContent } from '@/components/nostr/NoteContent';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';

const LIVE_CHAT_KIND = 1311;

function useLiveChat(address: string) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'live-chat', address],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [LIVE_CHAT_KIND], '#a': [address], limit: 200 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      return events
        .filter((event) => event.content.trim().length > 0)
        .sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

/** The chat channel tied to one NIP-53 live event, addressed by its `a` tag. */
export function LiveChat({ address }: { address: string }) {
  const { user } = useCurrentUser();
  const chat = useLiveChat(address);
  const publish = useNostrPublish();
  const { toast } = useToast();
  const [message, setMessage] = useState('');

  const trimmed = message.trim();

  const send = async () => {
    if (!trimmed) return;
    try {
      await publish.mutateAsync({ kind: LIVE_CHAT_KIND, content: trimmed, tags: [['a', address]] });
      setMessage('');
      chat.refetch();
    } catch (error) {
      toast({
        title: 'Could not send',
        description: error instanceof Error ? error.message : 'No relay accepted the message.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppBody>
        {chat.data && chat.data.length > 0 ? (
          <ul className="divide-y divide-border">
            {chat.data.map((event) => (
              <li key={event.id} className="px-4 py-2.5">
                <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} size="sm" />
                <div className="mt-1 pl-9">
                  <NoteContent content={event.content} className="text-[14px]" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No chat messages yet" hint={user ? 'Say hello.' : undefined} />
        )}
      </AppBody>

      {user && (
        <div className="flex shrink-0 items-end gap-2 border-t border-border p-3">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Say something…"
            rows={1}
            className="min-h-9 flex-1 resize-none py-2 text-[14px]"
          />
          <Button size="sm" onClick={send} disabled={!trimmed || publish.isPending} className="shrink-0 gap-1.5">
            {publish.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="size-3.5" aria-hidden />
            )}
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
