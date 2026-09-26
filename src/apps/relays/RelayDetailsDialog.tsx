import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchRelayInfo } from '@/lib/nip86';
import { relayInfoUrl, relayLabel } from '@/lib/relayList';

/** snake_case NIP-11 keys read better as words. */
function humanize(key: string): string {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The relay's NIP-11 information document. Everything in it is untrusted,
 * relay-supplied text, so it is only ever rendered as plain text.
 */
export function RelayDetailsDialog({ url, onClose }: { url: string | undefined; onClose: () => void }) {
  const info = useQuery({
    queryKey: ['relay-info', url],
    queryFn: ({ signal }) => fetchRelayInfo(relayInfoUrl(url ?? ''), { signal }),
    enabled: Boolean(url),
    staleTime: 5 * 60_000,
  });

  const data = info.data;
  const software = [data?.software, data?.version].filter(Boolean).join(' ');
  const limitation = Object.entries(data?.limitation ?? {});

  return (
    <Dialog open={Boolean(url)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">{data?.name || (url ? relayLabel(url) : '')}</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">{url}</DialogDescription>
        </DialogHeader>

        {info.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : !data ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            This relay does not publish a NIP-11 information document, or it could not be reached.
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            {data.description && <p className="whitespace-pre-wrap break-words">{data.description}</p>}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              {software && (
                <>
                  <dt className="text-muted-foreground">Software</dt>
                  <dd className="break-all">{software}</dd>
                </>
              )}
              {data.contact && (
                <>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="break-all">{data.contact}</dd>
                </>
              )}
              {data.pubkey && (
                <>
                  <dt className="text-muted-foreground">Operator</dt>
                  <dd className="break-all font-mono">{data.pubkey}</dd>
                </>
              )}
            </dl>

            {data.supported_nips && data.supported_nips.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold">Supported NIPs</h3>
                <ul className="flex flex-wrap gap-1">
                  {data.supported_nips.map((nip) => (
                    <li key={nip}>
                      <Badge variant="secondary" className="font-mono tabular-nums">
                        {String(nip).padStart(2, '0')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {limitation.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold">Limitations</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  {limitation.map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-muted-foreground">{humanize(key)}</dt>
                      <dd className="tabular-nums">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
