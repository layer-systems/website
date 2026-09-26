import { useMemo, useState } from 'react';
import { LayoutGrid, List, Loader2, RotateCw, Upload } from 'lucide-react';
import { AppBody, EmptyState } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { BlossomLibrary } from '@/hooks/useBlossom';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { blobMimeType, formatBytes, mediaCategory, serverLabel, type LibraryBlob, type MediaCategory } from '@/lib/blossom';
import { cn } from '@/lib/utils';
import { BlobDialog } from './BlobDialog';
import { blobDisplayName, formatUploaded } from './format';
import { BlobThumb } from './shared';

type View = 'grid' | 'list';
type TypeFilter = 'all' | MediaCategory;

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'other', label: 'Other' },
];

export function Library({
  library,
  onUpload,
  onServers,
}: {
  library: BlossomLibrary;
  onUpload: () => void;
  onServers: () => void;
}) {
  const [view, setView] = useLocalStorage<View>('media:view', 'grid');
  const [server, setServer] = useState('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [openHash, setOpenHash] = useState<string | null>(null);

  const selectedServer = server !== 'all' && library.servers.includes(server) ? server : 'all';

  const blobs = useMemo(
    () =>
      library.blobs.filter(
        (blob) =>
          (selectedServer === 'all' || blob.locations.has(selectedServer)) &&
          (type === 'all' || mediaCategory(blobMimeType(blob)) === type),
      ),
    [library.blobs, selectedServer, type],
  );

  const openBlob = library.blobs.find((blob) => blob.sha256 === openHash);
  const selectedState = library.states.find((state) => state.url === selectedServer);
  const probed = library.states.filter((state) => state.status === 'probed');
  const allFailed = library.states.length > 0 && library.states.every((state) => state.status === 'offline');

  let body: React.ReactNode;
  if (library.servers.length === 0) {
    body = (
      <EmptyState
        title="No media servers"
        hint="Add a Blossom server to start uploading and managing your media."
        action={<Button size="sm" onClick={onServers}>Add a server</Button>}
      />
    );
  } else if (library.isLoading) {
    body = <LibrarySkeleton view={view} />;
  } else if (selectedState?.status === 'offline') {
    body = (
      <EmptyState
        title="Server unreachable"
        hint={selectedState.error ?? 'Try again later, or pick another server.'}
        action={<RetryButton onClick={() => void library.refetch()} />}
      />
    );
  } else if (library.blobs.length === 0 && allFailed) {
    body = (
      <EmptyState
        title="Couldn’t list your media"
        hint="None of your servers returned a list. Check your server settings or try again."
        action={<RetryButton onClick={() => void library.refetch()} />}
      />
    );
  } else if (blobs.length === 0) {
    body = (
      <div className="p-4">
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            title={library.blobs.length === 0 ? 'No media yet' : 'Nothing matches these filters'}
            hint={library.blobs.length === 0 ? 'Files you upload to your Blossom servers appear here.' : 'Try another server or type.'}
            action={
              library.blobs.length === 0 && (
                <Button size="sm" className="gap-1.5" onClick={onUpload}>
                  <Upload className="size-3.5" aria-hidden /> Upload files
                </Button>
              )
            }
          />
        </div>
      </div>
    );
  } else if (view === 'grid') {
    body = (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 p-3">
        {blobs.map((blob) => (
          <li key={blob.sha256}>
            <GridItem blob={blob} serverCount={library.servers.length} onOpen={() => setOpenHash(blob.sha256)} />
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <ul className="divide-y divide-border">
        {blobs.map((blob) => (
          <li key={blob.sha256}>
            <ListItem blob={blob} serverCount={library.servers.length} onOpen={() => setOpenHash(blob.sha256)} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <AppBody>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <Select value={selectedServer} onValueChange={setServer}>
          <SelectTrigger size="sm" className="h-8 w-40 min-w-0 text-xs" aria-label="Server">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All servers</SelectItem>
            {library.servers.map((url) => (
              <SelectItem key={url} value={url}>{serverLabel(url)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(value) => setType(value as TypeFilter)}>
          <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void library.refetch()}
            disabled={library.isFetching}
            aria-label="Refresh"
          >
            {library.isFetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
          </Button>
          <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="View">
            <ViewButton active={view === 'grid'} onClick={() => setView('grid')} label="Grid view">
              <LayoutGrid className="size-3.5" aria-hidden />
            </ViewButton>
            <ViewButton active={view === 'list'} onClick={() => setView('list')} label="List view">
              <List className="size-3.5" aria-hidden />
            </ViewButton>
          </div>
        </div>
      </div>

      {probed.length > 0 && library.servers.length > 0 && (
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {probed.map((state) => serverLabel(state.url)).join(', ')} {probed.length === 1 ? 'doesn’t' : 'don’t'} list files, so
          only files you’ve posted in notes or uploaded from this browser show up there.
        </p>
      )}

      {body}

      {openBlob && (
        <BlobDialog
          blob={openBlob}
          library={library}
          open
          onOpenChange={(open) => !open && setOpenHash(null)}
        />
      )}
    </AppBody>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className="gap-1.5" onClick={onClick}>
      <RotateCw className="size-3.5" aria-hidden /> Try again
    </Button>
  );
}

function ViewButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'grid size-7 place-items-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function Redundancy({ blob, serverCount }: { blob: LibraryBlob; serverCount: number }) {
  const count = blob.locations.size;
  return (
    <span className={cn('text-xs', count < serverCount ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
      {count}/{serverCount} {serverCount === 1 ? 'server' : 'servers'}
    </span>
  );
}

function GridItem({ blob, serverCount, onOpen }: { blob: LibraryBlob; serverCount: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full overflow-hidden rounded-lg border border-border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`Open ${blobDisplayName(blob)}`}
    >
      <div className="aspect-square overflow-hidden">
        <BlobThumb blob={blob} className="transition-transform motion-safe:group-hover:scale-105" />
      </div>
      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <span className="truncate text-xs font-medium">{formatBytes(blob.size)}</span>
        <Redundancy blob={blob} serverCount={serverCount} />
      </div>
    </button>
  );
}

function ListItem({ blob, serverCount, onOpen }: { blob: LibraryBlob; serverCount: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <div className="size-10 shrink-0 overflow-hidden rounded-md">
        <BlobThumb blob={blob} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs">{blobDisplayName(blob)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[blobMimeType(blob) ?? 'Unknown type', formatBytes(blob.size), formatUploaded(blob.uploaded)].join(' · ')}
        </p>
      </div>
      <Redundancy blob={blob} serverCount={serverCount} />
    </button>
  );
}

function LibrarySkeleton({ view }: { view: View }) {
  if (view === 'list') {
    return (
      <div className="divide-y divide-border" aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-10 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 p-3" aria-hidden>
      {Array.from({ length: 12 }, (_, index) => (
        <Skeleton key={index} className="aspect-square rounded-lg" />
      ))}
    </div>
  );
}
