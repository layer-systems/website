import { useCallback, useEffect, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NPool, NRelay1 } from '@nostrify/nostrify';
import { Loader2, Plus, RotateCcw, Timer, Trash2 } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToastAction } from '@/components/ui/toast';
import { useRelayList } from '@/hooks/useRelayList';
import { useRelayStatus, type RelayConnectionState, type RelayStatus } from '@/hooks/useRelayStatus';
import { useToast } from '@/hooks/useToast';
import { relayLabel, type RelayMode } from '@/lib/relayList';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';
import { AddRelayForm } from './AddRelayForm';
import { RelayDetailsDialog } from './RelayDetailsDialog';
import { measureLatency } from './latency';

const STATE_LABEL: Record<RelayConnectionState, string> = {
  open: 'Connected',
  connecting: 'Connecting',
  closing: 'Closing',
  closed: 'Idle',
  idle: 'Not opened',
};

/*
 * A closed socket is the normal resting state: relays are opened on demand and
 * dropped again after a while, so painting that red would cry wolf. Only a
 * connection that keeps trying to establish itself is worth an amber dot.
 */
const STATE_TONE: Record<RelayConnectionState, string> = {
  open: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  closing: 'bg-warning',
  closed: 'bg-muted-foreground/40',
  idle: 'bg-muted-foreground/40',
};

export default function RelaysApp({ setTitle }: AppProps) {
  const { nostr } = useNostr();
  const { relays, connected } = useRelayStatus();
  const relayList = useRelayList();
  const { toast } = useToast();
  const [latency, setLatency] = useState<Record<string, number | null>>({});
  const [measuring, setMeasuring] = useState(false);
  const [details, setDetails] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setTitle(`Relays — ${connected}/${relays.length} connected`);
  }, [connected, relays.length, setTitle]);

  const runMeasurement = useCallback(async () => {
    const pool = nostr as NPool<NRelay1>;
    setMeasuring(true);
    try {
      const results = await Promise.all(
        relays.map(async (row) => {
          const relay = pool.relay(row.url);
          return [row.url, await measureLatency(relay)] as const;
        }),
      );
      setLatency(Object.fromEntries(results));
    } finally {
      setMeasuring(false);
    }
  }, [nostr, relays]);

  const refuse = (error: string) => toast({ title: 'Not changed', description: error, variant: 'destructive' });

  const remove = (url: string) => {
    const index = relayList.relays.findIndex((r) => r.url === url);
    const entry = relayList.relays[index];
    const result = relayList.remove(url);
    if (!result.ok) return refuse(result.error);
    toast({
      title: 'Relay removed',
      description: relayLabel(url),
      action: (
        <ToastAction altText={`Undo removing ${relayLabel(url)}`} onClick={() => relayList.restore(entry, index)}>
          Undo
        </ToastAction>
      ),
    });
  };

  const setMode = (url: string, mode: RelayMode) => {
    const result = relayList.setMode(url, mode);
    if (!result.ok) refuse(result.error);
  };

  const addHint = (url: string) => {
    const result = relayList.add(url);
    if (!result.ok) refuse(result.error);
  };

  return (
    <AppLayout className="@container">
      <AppToolbar>
        <span className="truncate text-[13px] font-medium">
          {connected} of {relays.length} connected
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 gap-1.5 px-2 text-xs"
          onClick={runMeasurement}
          disabled={measuring || relays.length === 0}
        >
          {measuring ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Timer className="size-3.5" aria-hidden />
          )}
          <span className="@max-md:sr-only">Measure latency</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setConfirmReset(true)}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          <span className="@max-md:sr-only">Reset to defaults</span>
        </Button>
      </AppToolbar>

      <AppBody>
        <AddRelayForm onAdd={relayList.add} existing={relayList.relays.map((r) => r.url)} />

        {relays.length === 0 ? (
          <EmptyState title="No relays configured" hint="Add a relay above to start receiving events." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Relay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden text-right @xl:table-cell">Subs</TableHead>
                <TableHead className="hidden text-right @md:table-cell">Latency</TableHead>
                <TableHead className="w-12 text-center">Read</TableHead>
                <TableHead className="w-12 text-center">Write</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relays.map((relay) => (
                <RelayRow
                  key={relay.url}
                  relay={relay}
                  configured={relayList.relays.some((r) => r.url === relay.url)}
                  latency={latency[relay.url]}
                  onDetails={() => setDetails(relay.url)}
                  onMode={(mode) => setMode(relay.url, mode)}
                  onRemove={() => remove(relay.url)}
                  onAdd={() => addHint(relay.url)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </AppBody>

      <RelayDetailsDialog url={details} onClose={() => setDetails(undefined)} />

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset relays to the defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              Your relay list is replaced with this app's default relays. When you are signed in, the new list is
              published to Nostr as well.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                relayList.resetToDefaults();
                toast({ title: 'Relays reset to defaults' });
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function RelayRow({
  relay,
  configured,
  latency,
  onDetails,
  onMode,
  onRemove,
  onAdd,
}: {
  relay: RelayStatus;
  configured: boolean;
  latency: number | null | undefined;
  onDetails: () => void;
  onMode: (mode: RelayMode) => void;
  onRemove: () => void;
  onAdd: () => void;
}) {
  const label = relayLabel(relay.url);

  return (
    <TableRow>
      <TableCell className="max-w-0 w-full">
        <button
          type="button"
          onClick={onDetails}
          className="block max-w-full truncate rounded-sm text-left font-mono text-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          title={`Show details for ${label}`}
        >
          {label}
        </button>
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2 text-xs">
          <span className={cn('size-2 shrink-0 rounded-full', STATE_TONE[relay.state])} aria-hidden />
          <span className="sr-only @sm:not-sr-only">{STATE_LABEL[relay.state]}</span>
        </span>
      </TableCell>
      <TableCell className="hidden text-right tabular-nums text-xs @xl:table-cell">{relay.subscriptions}</TableCell>
      <TableCell className="hidden text-right tabular-nums text-xs @md:table-cell">
        {latency === undefined ? '—' : latency === null ? 'timeout' : `${latency} ms`}
      </TableCell>
      {configured ? (
        <>
          <TableCell className="text-center">
            <Switch
              checked={relay.read}
              onCheckedChange={(checked) => onMode({ read: checked })}
              aria-label={`Read from ${label}`}
            />
          </TableCell>
          <TableCell className="text-center">
            <Switch
              checked={relay.write}
              onCheckedChange={(checked) => onMode({ write: checked })}
              aria-label={`Write to ${label}`}
            />
          </TableCell>
          <TableCell>
            <Button variant="ghost" size="icon" className="size-7" onClick={onRemove} aria-label={`Remove ${label}`}>
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </TableCell>
        </>
      ) : (
        <>
          <TableCell colSpan={2} className="text-center text-xs text-muted-foreground">
            hint
          </TableCell>
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onAdd}
              aria-label={`Add ${label} to your relays`}
            >
              <Plus className="size-3.5" aria-hidden />
            </Button>
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
