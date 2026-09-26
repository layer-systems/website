import { useId, useState, type DragEvent } from 'react';
import { CheckCircle2, CircleAlert, FileUp, Loader2, Upload, X } from 'lucide-react';
import { AppBody, EmptyState } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useBlossomUpload, type BlossomLibrary, type ServerResult, type UploadProgress } from '@/hooks/useBlossom';
import { formatBytes, serverLabel } from '@/lib/blossom';
import { cn } from '@/lib/utils';
import { ServerStatusBadge } from './shared';

type ItemStatus = 'queued' | UploadProgress['phase'] | 'done' | 'error';

interface QueueItem {
  id: string;
  file: File;
  status: ItemStatus;
  fraction: number;
  results?: ServerResult[];
  error?: string;
}

const STATUS_TEXT: Record<ItemStatus, string> = {
  queued: 'Waiting',
  hashing: 'Hashing…',
  signing: 'Waiting for signature…',
  uploading: 'Uploading…',
  mirroring: 'Mirroring to other servers…',
  done: 'Uploaded',
  error: 'Failed',
};

export function UploadPanel({
  library,
  onDone,
  onServers,
}: {
  library: BlossomLibrary;
  onDone: () => void;
  onServers: () => void;
}) {
  const upload = useBlossomUpload();
  const inputId = useId();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);

  const targets = library.servers.filter((server) => !deselected.has(server));
  const pending = queue.filter((item) => item.status === 'queued' || item.status === 'error');
  const finished = queue.length > 0 && queue.every((item) => item.status === 'done');

  const update = (id: string, patch: Partial<QueueItem>) =>
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const addFiles = (files: FileList | File[]) => {
    const items = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      status: 'queued' as const,
      fraction: 0,
    }));
    if (items.length) setQueue((current) => [...current, ...items]);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const start = async () => {
    if (targets.length === 0) return;
    setRunning(true);
    // One at a time, so signers that prompt for each file aren't flooded.
    for (const item of pending) {
      update(item.id, { status: 'hashing', fraction: 0, error: undefined, results: undefined });
      try {
        const { results } = await upload.mutateAsync({
          file: item.file,
          servers: targets,
          onProgress: ({ phase, fraction }) => update(item.id, { status: phase, fraction }),
        });
        update(item.id, { status: 'done', fraction: 1, results });
      } catch (error) {
        update(item.id, { status: 'error', error: error instanceof Error ? error.message : 'Upload failed' });
      }
    }
    setRunning(false);
  };

  const toggleServer = (server: string, checked: boolean) =>
    setDeselected((current) => {
      const next = new Set(current);
      if (checked) next.delete(server);
      else next.add(server);
      return next;
    });

  if (library.servers.length === 0) {
    return (
      <AppBody>
        <EmptyState
          title="No media servers"
          hint="Add a Blossom server before uploading."
          action={<Button size="sm" onClick={onServers}>Add a server</Button>}
        />
      </AppBody>
    );
  }

  return (
    <AppBody>
      <div className="mx-auto max-w-2xl space-y-5 p-4">
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors',
            'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
          )}
        >
          <FileUp className="size-8 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">Drop files here, or click to choose</span>
          <span className="text-xs text-muted-foreground">Images, video, audio or any other file</span>
          <input
            id={inputId}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Upload to</legend>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {library.servers.map((server) => {
              const state = library.states.find((item) => item.url === server);
              const id = `${inputId}-${server}`;
              return (
                <li key={server} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={id}
                    checked={!deselected.has(server)}
                    onCheckedChange={(checked) => toggleServer(server, checked === true)}
                    disabled={running}
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">{serverLabel(server)}</label>
                  <ServerStatusBadge state={state} />
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Files go to the first selected server, then get mirrored to the others for redundancy.
          </p>
        </fieldset>

        {queue.length > 0 && (
          <section className="space-y-2" aria-live="polite">
            <h3 className="text-sm font-semibold">Files</h3>
            <ul className="space-y-2">
              {queue.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onRemove={
                    running || item.status === 'done'
                      ? undefined
                      : () => setQueue((current) => current.filter((entry) => entry.id !== item.id))
                  }
                />
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {queue.some((item) => item.status === 'done') && !running && (
            <Button variant="outline" onClick={() => setQueue((current) => current.filter((item) => item.status !== 'done'))}>
              Clear finished
            </Button>
          )}
          {finished ? (
            <Button onClick={onDone}>View library</Button>
          ) : (
            <Button onClick={() => void start()} disabled={running || pending.length === 0 || targets.length === 0} className="gap-1.5">
              {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              {pending.length > 1 ? `Upload ${pending.length} files` : 'Upload'}
            </Button>
          )}
        </div>
      </div>
    </AppBody>
  );
}

function QueueRow({ item, onRemove }: { item: QueueItem; onRemove?: () => void }) {
  const active = item.status !== 'queued' && item.status !== 'done' && item.status !== 'error';
  const failedServers = item.results?.filter((result) => !result.ok) ?? [];

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        {item.status === 'done' ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : item.status === 'error' ? (
          <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
        ) : active ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <FileUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(item.file.size)}</span>
        {onRemove && (
          <Button variant="ghost" size="icon" className="size-6" onClick={onRemove} aria-label={`Remove ${item.file.name}`}>
            <X className="size-3.5" aria-hidden />
          </Button>
        )}
      </div>
      {(active || item.status === 'done') && (
        <Progress
          value={item.status === 'done' ? 100 : item.status === 'uploading' ? item.fraction * 100 : item.status === 'mirroring' ? 100 : 0}
          className="mt-2 h-1.5"
          aria-label={`${item.file.name} progress`}
        />
      )}
      <p className={cn('mt-1.5 text-xs', item.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
        {item.status === 'error' && item.error ? item.error : STATUS_TEXT[item.status]}
        {item.status === 'done' && item.results && ` to ${item.results.filter((result) => result.ok).length} of ${item.results.length} servers`}
      </p>
      {failedServers.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
          {failedServers.map((result) => (
            <li key={result.server} className="truncate">{serverLabel(result.server)}: {result.error}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
