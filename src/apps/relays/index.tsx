import { useCallback, useEffect, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NPool, NRelay1 } from '@nostrify/nostrify';
import { Loader2, Timer } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRelayStatus, type RelayConnectionState } from '@/hooks/useRelayStatus';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';

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

/**
 * Round-trip time for a trivial query. This is the only honest latency number
 * available from the browser: a WebSocket gives us no ping, so we time a real
 * REQ/EOSE cycle instead.
 */
async function measureLatency(relay: NRelay1): Promise<number | null> {
  const started = performance.now();
  try {
    await relay.query([{ kinds: [1], limit: 1 }], { signal: AbortSignal.timeout(5000) });
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}

export default function RelaysApp({ setTitle }: AppProps) {
  const { nostr } = useNostr();
  const { relays, connected } = useRelayStatus();
  const [latency, setLatency] = useState<Record<string, number | null>>({});
  const [measuring, setMeasuring] = useState(false);

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

  return (
    <AppLayout>
      <AppToolbar>
        <span className="text-[13px] font-medium">
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
          Measure latency
        </Button>
      </AppToolbar>

      <AppBody>
        {relays.length === 0 ? (
          <EmptyState
            title="No relays configured"
            hint="Add relays in Settings to start receiving events."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[46%]">Relay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Subs</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead className="text-right">Mode</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relays.map((relay) => (
                <TableRow key={relay.url}>
                  <TableCell className="max-w-0 truncate font-mono text-xs">
                    {relay.url.replace(/^wss:\/\//, '').replace(/\/$/, '')}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-xs">
                      <span
                        className={cn('size-2 shrink-0 rounded-full', STATE_TONE[relay.state])}
                        aria-hidden
                      />
                      {STATE_LABEL[relay.state]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {relay.subscriptions}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {latency[relay.url] === undefined
                      ? '—'
                      : latency[relay.url] === null
                        ? 'timeout'
                        : `${latency[relay.url]} ms`}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {[relay.read && 'read', relay.write && 'write'].filter(Boolean).join(' + ') ||
                      'hint'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AppBody>
    </AppLayout>
  );
}
