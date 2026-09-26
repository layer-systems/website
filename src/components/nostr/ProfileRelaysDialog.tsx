import { useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RelayRows } from './RelayRows';

export function ProfileRelaysDialog({ pubkey }: { pubkey: string }) {
  const [open, setOpen] = useState(false);
  const { nostr } = useNostr();
  const list = useQuery({
    queryKey: ['nostr', 'profile-relays', pubkey],
    enabled: open,
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [10002], authors: [pubkey], limit: 5 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      const latest = events.filter((event) => event.pubkey === pubkey && event.kind === 10002)
        .sort((a, b) => b.created_at - a.created_at)[0];
      const entries = new Map<string, { url: string; read: boolean; write: boolean }>();
      for (const [tag, url, marker] of latest?.tags ?? []) {
        if (tag !== 'r' || !url) continue;
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'wss:' || parsed.username || parsed.password) continue;
          const entry = entries.get(parsed.href) ?? { url: parsed.href, read: false, write: false };
          entry.read ||= !marker || marker === 'read';
          entry.write ||= !marker || marker === 'write';
          entries.set(parsed.href, entry);
        } catch { /* Ignore malformed event tags. */ }
      }
      return [...entries.values()];
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setOpen(true)}>
        <Radio className="size-3.5" aria-hidden />
        Relays
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(85vh,36rem)] w-[calc(100%-2rem)] overflow-hidden p-4 sm:max-w-md sm:p-6">
          <DialogHeader className="pr-6 text-left">
            <DialogTitle>Profile relays</DialogTitle>
            <DialogDescription>Read and write relays this person published in their NIP-65 list.</DialogDescription>
          </DialogHeader>
          {list.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
          ) : list.isError ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Couldn’t load this relay list. Try opening it again.</p>
          ) : list.data?.length ? (
            <RelayRows relays={list.data.map((relay) => ({
              url: relay.url,
              detail: relay.read && relay.write ? 'Read & write' : relay.read ? 'Read' : 'Write',
            }))} />
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No published relay list was found on your relays.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
