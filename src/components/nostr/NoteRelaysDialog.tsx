import { useMemo, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { RelayRows } from './RelayRows';

export function NoteRelaysDialog({ id, hints }: { id: string; hints?: string[] }) {
  const [open, setOpen] = useState(false);
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const candidates = useMemo(() => [...new Set([
    ...config.relayMetadata.relays.map((relay) => relay.url),
    ...(hints ?? []),
  ])].filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'wss:' && !parsed.username && !parsed.password;
    } catch { return false; }
  }), [config.relayMetadata.relays, hints]);

  const found = useQuery({
    queryKey: ['nostr', 'note-relays', id, candidates.join(',')],
    enabled: open,
    queryFn: async ({ signal }) => {
      const results = await Promise.all(candidates.map(async (url) => {
        try {
          const events = await nostr.query([{ ids: [id], limit: 1 }], {
            relays: [url],
            signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
          });
          return events.some((event) => event.id === id) ? url : null;
        } catch { return null; }
      }));
      return results.filter((url): url is string => url !== null);
    },
    staleTime: 60_000,
    retry: false,
  });

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => setOpen(true)}>
        <Radio className="size-3.5" aria-hidden />
        Relays
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(85vh,36rem)] w-[calc(100%-2rem)] overflow-hidden p-4 sm:max-w-md sm:p-6">
          <DialogHeader className="pr-6 text-left">
            <DialogTitle>Seen on relays</DialogTitle>
            <DialogDescription>Relays that returned this note when checked. Checked {candidates.length} from your list and the note’s hints.</DialogDescription>
          </DialogHeader>
          {found.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
          ) : found.data?.length ? (
            <RelayRows relays={found.data.map((url) => ({ url }))} />
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No checked relay returned this note. It may be on other relays.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
