import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, Lock, MessageSquarePlus, RotateCcw, Send, TriangleAlert, X } from 'lucide-react';
import {
  AppBody,
  AppLayout,
  AppSectionTitle,
  AppSidebar,
  AppSplit,
  AppToolbar,
  EmptyState,
} from '@/components/os/AppChrome';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { NoteContent } from '@/components/nostr/NoteContent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  resolveRecipient,
  useDmConversations,
  useDmMessages,
  useDmReadState,
  useHideDmConversation,
  useSendDirectMessage,
  type DmConversation,
} from '@/hooks/useDirectMessages';
import { useToast } from '@/hooks/useToast';
import { dmCapabilityHint, parseRecipient, type DmMessage } from '@/lib/dm';
import { displayName, relativeTime, sanitizeUrl } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';

/**
 * A message composed locally but not yet confirmed by a relay. Tracking it
 * here — instead of pretending it was sent — is what gives the conversation
 * honest pending/failed states: only a relay round-trip moves it to "sent",
 * and nothing here claims the recipient ever received it.
 */
interface PendingMessage {
  localId: number;
  peer: string;
  content: string;
  created_at: number;
  status: 'pending' | 'failed';
}

export default function MessagesApp({ params, setTitle, setParams }: AppProps) {
  const { user } = useCurrentUser();
  const isMobile = useIsMobile();
  const conversations = useDmConversations();
  const hide = useHideDmConversation();
  const readState = useDmReadState();
  const [composeOpen, setComposeOpen] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [nextId, setNextId] = useState(1);

  const selected = params.peer ?? null;

  useEffect(() => setTitle('Messages'), [setTitle]);

  if (!user) {
    return <LoginRequired action="read and send direct messages" />;
  }

  const visible = (conversations.data ?? []).filter(
    (conversation) => !hide.hidden.includes(conversation.peer),
  );
  const unreadPeers = new Set(visible.filter((c) => readState.isUnread(c)).map((c) => c.peer));

  const openConversation = (peer: string) => {
    setParams({ peer });
    const conversation = visible.find((entry) => entry.peer === peer);
    if (conversation) readState.markRead(peer, conversation.lastAt);
  };

  const addPending = (content: string): PendingMessage | null => {
    if (!selected) return null;
    const entry: PendingMessage = {
      localId: nextId,
      peer: selected,
      content,
      created_at: Math.floor(Date.now() / 1000),
      status: 'pending',
    };
    setNextId(nextId + 1);
    setPending([...pending, entry]);
    return entry;
  };

  const settlePending = (entry: PendingMessage, status: 'sent' | 'failed') => {
    setPending((list) =>
      status === 'sent'
        ? list.filter((item) => item.localId !== entry.localId)
        : list.map((item) => (item.localId === entry.localId ? { ...item, status } : item)),
    );
  };

  const retryPending = (entry: PendingMessage) => {
    setPending((list) =>
      list.map((item) => (item.localId === entry.localId ? { ...item, status: 'pending' as const } : item)),
    );
  };

  const removePending = (entry: PendingMessage) => {
    setPending((list) => list.filter((item) => item.localId !== entry.localId));
  };

  const listPane = (
    <ConversationList
      query={conversations}
      conversations={visible}
      unreadPeers={unreadPeers}
      selected={selected}
      onSelect={openConversation}
    />
  );

  const detailPane = !selected ? (
    <EmptyState title="Pick a conversation" hint="Choose one from the list, or start a new one." />
  ) : (
    <ConversationView
      key={selected}
      peer={selected}
      pending={pending.filter((entry) => entry.peer === selected)}
      onAddPending={addPending}
      onSettlePending={settlePending}
      onRetryPending={retryPending}
      onRemovePending={removePending}
      onHide={() => {
        const conversation = visible.find((entry) => entry.peer === selected);
        if (!conversation) return;
        hide.mutate(conversation, {
          onSuccess: () => setParams({}),
        });
      }}
      hiding={hide.isPending}
    />
  );

  if (isMobile) {
    return (
      <AppLayout>
        <AppToolbar>
          {selected ? (
            <>
              <button
                type="button"
                onClick={() => setParams({})}
                className="-ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Messages
              </button>
              <PeerName pubkey={selected} className="truncate text-[13px] text-muted-foreground" />
            </>
          ) : (
            <>
              <span className="text-[13px] font-medium">Messages</span>
              <NewMessageButton className="ml-auto" onClick={() => setComposeOpen(true)} />
            </>
          )}
        </AppToolbar>
        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col">{detailPane}</div>
        ) : (
          <AppBody>{listPane}</AppBody>
        )}
        <NewConversationDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          onResolved={openConversation}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppToolbar>
        <span className="text-[13px] font-medium">Messages</span>
        <NewMessageButton className="ml-auto" onClick={() => setComposeOpen(true)} />
      </AppToolbar>
      <AppSplit>
        <AppSidebar className="w-64 p-0">{listPane}</AppSidebar>
        <div className="flex min-w-0 flex-1 flex-col">{detailPane}</div>
      </AppSplit>
      <NewConversationDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onResolved={openConversation}
      />
    </AppLayout>
  );
}

function NewMessageButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={cn('h-7 gap-1.5 px-2 text-xs', className)}
      onClick={onClick}
    >
      <MessageSquarePlus className="size-3.5" aria-hidden />
      New message
    </Button>
  );
}

/** Conversation list, with the privacy-preserving preview rules applied. */
function ConversationList({
  query,
  conversations,
  unreadPeers,
  selected,
  onSelect,
}: {
  query: ReturnType<typeof useDmConversations>;
  conversations: DmConversation[];
  unreadPeers: Set<string>;
  selected: string | null;
  onSelect: (peer: string) => void;
}) {
  if (query.isLoading) {
    return (
      <div className="space-y-3 p-3" aria-label="Loading conversations">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-3">
        <EmptyState
          title="Couldn't load messages"
          hint="None of your relays responded. Check the Relays app, or try again — gift-wrapped messages can take a moment to arrive."
          action={
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-3">
        <EmptyState
          title="No conversations yet"
          hint="Start a new message to someone’s npub, nprofile, or NIP-05 address. Message history is recoverable on any client with your keys."
        />
      </div>
    );
  }

  return (
    <>
      <AppSectionTitle>Conversations</AppSectionTitle>
      <ul className="pb-2">
        {conversations.map((conversation) => (
          <li key={conversation.peer}>
            <ConversationRow
              conversation={conversation}
              active={selected === conversation.peer}
              unread={unreadPeers.has(conversation.peer)}
              onSelect={() => onSelect(conversation.peer)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function ConversationRow({
  conversation,
  active,
  unread,
  onSelect,
}: {
  conversation: DmConversation;
  active: boolean;
  unread: boolean;
  onSelect: () => void;
}) {
  const author = useAuthor(conversation.peer);
  const name = displayName(conversation.peer, author.data?.metadata);
  const picture = sanitizeUrl(author.data?.metadata?.picture);
  const latest = conversation.messages[0];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring',
        active && 'bg-muted/60',
      )}
    >
      <Avatar className="size-9 shrink-0">
        <AvatarImage src={picture} alt="" />
        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-[13px]', unread ? 'font-semibold' : 'font-medium')}>
            {name}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {relativeTime(conversation.lastAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-xs text-muted-foreground">
            {previewFor(latest)}
          </span>
          {unread && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
        </span>
      </span>
    </button>
  );
}

/**
 * The list preview deliberately does not leak plaintext: the sender's own
 * message previews as "You: …" (the device owner typed it), while a received
 * message shows only that one arrived. Protocol and time are not sensitive;
 * content is.
 */
function previewFor(latest: DmMessage): string {
  const legacy = latest.protocol === 'nip04';
  if (latest.mine) {
    return `You: ${latest.content}${legacy ? ' · legacy' : ''}`;
  }
  return legacy ? 'New message · legacy encryption' : 'New message';
}

function PeerName({ pubkey, className }: { pubkey: string; className?: string }) {
  const author = useAuthor(pubkey);
  return <span className={className}>{displayName(pubkey, author.data?.metadata)}</span>;
}

/** One conversation thread with its composer. */
function ConversationView({
  peer,
  pending,
  onAddPending,
  onSettlePending,
  onRetryPending,
  onRemovePending,
  onHide,
  hiding,
}: {
  peer: string;
  pending: PendingMessage[];
  onAddPending: (content: string) => PendingMessage | null;
  onSettlePending: (entry: PendingMessage, status: 'sent' | 'failed') => void;
  onRetryPending: (entry: PendingMessage) => void;
  onRemovePending: (entry: PendingMessage) => void;
  onHide: () => void;
  hiding: boolean;
}) {
  const { user } = useCurrentUser();
  const { messages, isLoading, isError, refetch } = useDmMessages(peer);
  const send = useSendDirectMessage();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');

  const capability = send.capability;
  const trimmed = draft.trim();
  const canSend = Boolean(user) && capability !== 'none' && trimmed.length > 0;

  const deliver = async (entry: PendingMessage) => {
    try {
      await send.mutateAsync({ peer: entry.peer, content: entry.content });
      onSettlePending(entry, 'sent');
    } catch (error) {
      onSettlePending(entry, 'failed');
      toast({
        title: 'Message not sent',
        description:
          error instanceof Error
            ? error.message
            : 'No relay accepted the message. Check the Relays app and try again.',
        variant: 'destructive',
      });
    }
  };

  const submit = () => {
    if (!canSend) return;
    const entry = onAddPending(trimmed);
    setDraft('');
    if (entry) void deliver(entry);
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <PeerName pubkey={peer} className="truncate text-[13px] font-medium" />
        <EncryptionBadge
          protocol={
            messages.some((m) => m.protocol === 'nip04') || capability === 'nip04' ? 'nip04' : 'nip17'
          }
        />
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={onHide}
          disabled={hiding}
        >
          <X className="size-3.5" aria-hidden />
          Hide
        </Button>
      </div>

      {capability !== 'nip17' && (
        <p
          role="status"
          className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground"
        >
          {dmCapabilityHint(capability)}
        </p>
      )}

      <div className="os-scroll min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-4" aria-label="Loading messages">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={index}
                className={cn('h-10 w-2/3 rounded-2xl', index % 2 === 1 && 'ml-auto')}
              />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            title="Couldn't load this conversation"
            hint="The relays did not respond. Delayed gift wraps may still arrive — try again in a moment."
            action={
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : messages.length === 0 && pending.length === 0 ? (
          <EmptyState
            title="No messages yet"
            hint="Say hello. Your message is encrypted for the recipient before it leaves this device."
          />
        ) : (
          <ol className="flex flex-col gap-1.5 px-4 py-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {pending.map((entry) => (
              <PendingBubble
                key={entry.localId}
                entry={entry}
                onRetry={() => {
                  onRetryPending(entry);
                  void deliver({ ...entry, status: 'pending' });
                }}
                onDiscard={() => onRemovePending(entry)}
              />
            ))}
          </ol>
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-border p-3">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          aria-label="Message"
          placeholder={capability === 'none' ? 'Sending unavailable with this signer' : 'Write a message…'}
          rows={1}
          disabled={capability === 'none'}
          className="min-h-9 flex-1 resize-none py-2 text-[14px]"
        />
        <Button size="sm" onClick={submit} disabled={!canSend} className="shrink-0 gap-1.5">
          {send.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="size-3.5" aria-hidden />
          )}
          Send
        </Button>
      </div>
    </>
  );
}

function EncryptionBadge({ protocol }: { protocol: 'nip17' | 'nip04' }) {
  if (protocol === 'nip17') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        NIP-17
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning-foreground">
      <TriangleAlert className="size-3" aria-hidden />
      Legacy NIP-04
    </span>
  );
}

function MessageBubble({ message }: { message: DmMessage }) {
  return (
    <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3.5 py-2',
          message.mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted',
        )}
      >
        <NoteContent content={message.content} className="text-[14px]" />
        <span
          className={cn(
            'mt-1 flex items-center justify-end gap-1.5 text-[10px]',
            message.mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {message.protocol === 'nip04' && <span>legacy</span>}
          <span>
            Sent {relativeTime(message.created_at)}
            {message.mine ? ' · received when their client fetches it' : ''}
          </span>
        </span>
      </div>
    </li>
  );
}

function PendingBubble({
  entry,
  onRetry,
  onDiscard,
}: {
  entry: PendingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <li className="flex justify-end">
      <div
        className={cn(
          'max-w-[75%] rounded-2xl rounded-br-md px-3.5 py-2',
          entry.status === 'pending'
            ? 'bg-primary/60 text-primary-foreground'
            : 'border border-destructive/40 bg-transparent',
        )}
        aria-live="polite"
      >
        <NoteContent content={entry.content} className="text-[14px]" />
        <span className="mt-1 flex items-center justify-end gap-2 text-[10px]">
          {entry.status === 'pending' ? (
            <span className="flex items-center gap-1 text-primary-foreground/80">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Sending…
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              Not sent
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline"
              >
                <RotateCcw className="size-3" aria-hidden />
                Retry
              </button>
              <button type="button" onClick={onDiscard} className="underline-offset-2 hover:underline">
                Discard
              </button>
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

/** Start a conversation with a npub, nprofile, hex key or NIP-05 address. */
function NewConversationDialog({
  open,
  onOpenChange,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: (peer: string) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseRecipient(value);
    if (parsed.type === 'invalid') {
      setError(
        'That is not a supported identifier. Try an npub, nprofile, hex pubkey, or a NIP-05 address like name@example.com.',
      );
      return;
    }
    setResolving(true);
    try {
      const pubkey = await resolveRecipient(parsed);
      if (!pubkey) {
        setError(
          'That NIP-05 address could not be resolved. Check the spelling, or ask the person for their npub instead.',
        );
        return;
      }
      setValue('');
      setError(null);
      onOpenChange(false);
      onResolved(pubkey);
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>
            Start a conversation with any Nostr user. The first message is sent when you write it in
            the conversation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            aria-label="Recipient"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            placeholder="npub1…, nprofile1…, or name@example.com"
            autoFocus
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={!value.trim() || resolving}>
              {resolving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              Open conversation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
