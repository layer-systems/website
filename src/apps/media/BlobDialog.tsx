import { useState } from 'react';
import { Braces, Check, Copy, ExternalLink, Loader2, Share2, Trash2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBlossomDelete, useBlossomMirror, type BlossomLibrary, type ServerResult } from '@/hooks/useBlossom';
import { useToast } from '@/hooks/useToast';
import { blobMimeType, buildImetaTag, formatBytes, mediaCategory, serverLabel, type LibraryBlob } from '@/lib/blossom';
import { sanitizeUrl } from '@/lib/nostrUtils';
import { blobDisplayName, formatUploaded } from './format';
import { BlobThumb, ServerStatusBadge } from './shared';
import { ShareNoteDialog } from './ShareNoteDialog';

type PendingDelete = { servers: string[]; label: string } | null;

export function BlobDialog({
  blob,
  library,
  open,
  onOpenChange,
}: {
  blob: LibraryBlob;
  library: BlossomLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const mirror = useBlossomMirror();
  const remove = useBlossomDelete();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [mirroringTo, setMirroringTo] = useState<string[]>([]);

  const url = sanitizeUrl(blob.url);
  const mime = blobMimeType(blob);
  const category = mediaCategory(mime);
  const holders = library.servers.filter((server) => blob.locations.has(server));
  const missing = library.servers.filter(
    (server) => !blob.locations.has(server) && library.states.find((state) => state.url === server)?.status !== 'offline',
  );

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: 'Couldn’t copy to the clipboard', variant: 'destructive' });
    }
  };

  const report = (results: ServerResult[], done: string, failedTitle: string) => {
    const failed = results.filter((result) => !result.ok);
    if (failed.length === 0) {
      toast({ title: `${done} ${results.length === 1 ? serverLabel(results[0].server) : `${results.length} servers`}` });
    } else {
      toast({
        title: failed.length === results.length ? failedTitle : 'Only some servers succeeded',
        description: failed.map((result) => `${serverLabel(result.server)}: ${result.error}`).join('\n'),
        variant: 'destructive',
      });
    }
  };

  const mirrorTo = async (servers: string[]) => {
    setMirroringTo(servers);
    try {
      report(await mirror.mutateAsync({ blob, servers }), 'Mirrored to', 'Mirror failed');
    } catch (error) {
      toast({ title: 'Mirror failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setMirroringTo([]);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { servers } = pendingDelete;
    setPendingDelete(null);
    try {
      const results = await remove.mutateAsync({ sha256: blob.sha256, servers, everywhere: servers.length >= holders.length });
      report(results, 'Deleted from', 'Delete failed');
      if (results.every((result) => result.ok) && servers.length >= holders.length) onOpenChange(false);
    } catch (error) {
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 font-mono text-sm">{blobDisplayName(blob)}</DialogTitle>
            <DialogDescription>
              {[mime ?? 'Unknown type', formatBytes(blob.size)].join(' · ')}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-hidden rounded-lg border border-border bg-muted">
            {url && category === 'image' ? (
              <img src={url} alt="" referrerPolicy="no-referrer" className="mx-auto max-h-[50dvh] w-auto object-contain" />
            ) : url && category === 'video' ? (
              <video src={url} controls preload="metadata" className="mx-auto max-h-[50dvh] w-full" />
            ) : url && category === 'audio' ? (
              <div className="p-4">
                <audio src={url} controls preload="metadata" className="w-full" />
              </div>
            ) : (
              <div className="mx-auto aspect-video max-h-48">
                <BlobThumb blob={blob} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {url && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" aria-hidden /> Open
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copy(blob.url, 'URL')}>
              <Copy className="size-3.5" aria-hidden /> Copy URL
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void copy(JSON.stringify(buildImetaTag(blob)), 'imeta tag')}
            >
              <Braces className="size-3.5" aria-hidden /> Copy imeta
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShareOpen(true)}>
              <Share2 className="size-3.5" aria-hidden /> Share as note
            </Button>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">SHA-256</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-xs">{blob.sha256}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => void copy(blob.sha256, 'Hash')}
                aria-label="Copy hash"
              >
                <Copy className="size-3" aria-hidden />
              </Button>
            </dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd>{formatBytes(blob.size)} <span className="text-muted-foreground">({blob.size.toLocaleString()} bytes)</span></dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="truncate">{mime ?? 'Unknown'}</dd>
            <dt className="text-muted-foreground">Uploaded</dt>
            <dd>{formatUploaded(blob.uploaded)}</dd>
          </dl>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Stored on {holders.length} of {library.servers.length} {library.servers.length === 1 ? 'server' : 'servers'}
              </h3>
              {missing.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void mirrorTo(missing)}
                  disabled={mirror.isPending}
                >
                  Mirror to all
                </Button>
              )}
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {library.servers.map((server) => {
                const stored = blob.locations.has(server);
                const state = library.states.find((item) => item.url === server);
                const busy = mirroringTo.includes(server);
                return (
                  <li key={server} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{serverLabel(server)}</p>
                      {stored ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <Check className="size-3" aria-hidden /> Stored
                        </span>
                      ) : (
                        <ServerStatusBadge state={state} />
                      )}
                    </div>
                    {stored ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setPendingDelete({ servers: [server], label: serverLabel(server) })}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="size-3.5" aria-hidden /> Delete
                      </Button>
                    ) : state?.status !== 'offline' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => void mirrorTo([server])}
                        disabled={mirror.isPending}
                      >
                        {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                        Mirror here
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {holders.length > 1 && (
            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setPendingDelete({ servers: holders, label: `all ${holders.length} servers` })}
                disabled={remove.isPending}
              >
                {remove.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
                Delete from all servers
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete from {pendingDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.servers.length >= holders.length
                ? 'This removes your only stored copies. Notes that link to this file will show a broken link.'
                : 'Other servers keep their copy, so links using those servers keep working.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareNoteDialog blob={blob} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}
