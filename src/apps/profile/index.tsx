import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Globe, Loader2, UserMinus, UserPlus } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { ModerationMenu } from '@/components/nostr/ModerationMenu';
import { NoteCard } from '@/components/nostr/NoteCard';
import { NoteContent } from '@/components/nostr/NoteContent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMyFollows, useToggleFollow } from '@/hooks/useFollows';
import { useToast } from '@/hooks/useToast';
import { decodeRelayHints, displayName, isReply, npubOf, sanitizeUrl } from '@/lib/nostrUtils';
import type { AppProps } from '@/os/types';

/**
 * Replies are excluded here for the same reason as the Feed: without their
 * parent for context, a reply on a profile's timeline reads as an orphaned
 * root post rather than what it is.
 */
function useAuthorNotes(pubkey: string | undefined, relays: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'author-notes', pubkey ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1], authors: [pubkey!], limit: 40 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]), relays },
      );
      return events
        .filter((event) => event.content.trim().length > 0 && !isReply(event))
        .sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 60_000,
  });
}

export default function ProfileApp({ params, setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const pubkey = params.pubkey || user?.pubkey;

  const author = useAuthor(pubkey);
  const notes = useAuthorNotes(pubkey, decodeRelayHints(params.relays));
  const name = pubkey ? displayName(pubkey, author.data?.metadata) : '';

  useEffect(() => {
    setTitle(name ? `Profile — ${name}` : 'Profile');
  }, [name, setTitle]);

  if (!pubkey) {
    return (
      <EmptyState
        title="No profile selected"
        hint="Open a profile from a note, or sign in to see your own."
      />
    );
  }

  const metadata = author.data?.metadata;
  const banner = sanitizeUrl(metadata?.banner);
  const picture = sanitizeUrl(metadata?.picture);
  const website = sanitizeUrl(metadata?.website);

  return (
    <AppLayout>
      <AppToolbar>
        <span className="truncate text-[13px] font-medium">{name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <CopyNpubButton pubkey={pubkey} />
          <FollowButton pubkey={pubkey} />
          <ModerationMenu pubkey={pubkey} />
        </div>
      </AppToolbar>

      <AppBody>
        <div
          className="h-28 w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent bg-cover bg-center"
          style={banner ? { backgroundImage: `url(${JSON.stringify(banner)})` } : undefined}
          aria-hidden
        />

        <div className="px-4 pb-4">
          <Avatar className="-mt-9 size-18 border-4 border-background">
            {picture && <AvatarImage src={picture} alt="" />}
            <AvatarFallback className="text-lg">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>

          <div className="mt-3 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
            {metadata?.nip05 && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="size-3.5 text-primary" aria-hidden />
                {metadata.nip05}
              </p>
            )}
            <p className="font-mono text-xs text-muted-foreground break-all">{npubOf(pubkey)}</p>
          </div>

          {metadata?.about && (
            <div className="mt-3">
              <NoteContent content={metadata.about} className="text-sm" />
            </div>
          )}

          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Globe className="size-3.5" aria-hidden />
              {website.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>

        <div className="border-t border-border">
          <h2 className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Notes
          </h2>
          {notes.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : notes.data && notes.data.length > 0 ? (
            notes.data.map((event) => <NoteCard key={event.id} event={event} />)
          ) : (
            <EmptyState title="No notes found" hint="This person has not posted, or your relays do not carry them." />
          )}
        </div>
      </AppBody>
    </AppLayout>
  );
}

function CopyNpubButton({ pubkey }: { pubkey: string }) {
  const { toast } = useToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(npubOf(pubkey));
          toast({ title: 'npub copied' });
        } catch {
          toast({ title: 'Could not copy', variant: 'destructive' });
        }
      }}
    >
      <Copy className="size-3.5" aria-hidden />
      npub
    </Button>
  );
}

/**
 * Follows are a whole-list replacement (kind 3). The toggle itself lives in
 * `useToggleFollow`; this button only reflects the cached list and toasts.
 */
function FollowButton({ pubkey }: { pubkey: string }) {
  const { user } = useCurrentUser();
  const { data: follows } = useMyFollows();
  const toggleFollow = useToggleFollow();
  const { toast } = useToast();

  const isFollowing = (follows ?? []).includes(pubkey);
  const isSelf = user?.pubkey === pubkey;

  if (!user || isSelf) return null;

  const toggle = async () => {
    try {
      await toggleFollow.mutateAsync(pubkey);
      toast({ title: isFollowing ? 'Unfollowed' : 'Following' });
    } catch (error) {
      toast({
        title: 'Could not update your follow list',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      size="sm"
      variant={isFollowing ? 'outline' : 'default'}
      className="h-7 gap-1.5 px-2.5 text-xs"
      onClick={toggle}
      disabled={toggleFollow.isPending}
    >
      {toggleFollow.isPending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : isFollowing ? (
        <UserMinus className="size-3.5" aria-hidden />
      ) : (
        <UserPlus className="size-3.5" aria-hidden />
      )}
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  );
}
