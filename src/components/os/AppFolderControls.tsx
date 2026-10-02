import { useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Folder } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppFolders, type AppFolder } from '@/os/appFoldersContext';
import { getApp } from '@/os/registry';
import { NO_TOUCH_CALLOUT } from '@/os/useIconDrag';
import { cn } from '@/lib/utils';

/**
 * Right-click menu for an app icon. It is the keyboard (Shift+F10) and
 * screen reader route for what drag and drop does with the pointer.
 */
export function AppContextMenu({ appId, onOpen, children }: { appId: string; onOpen: () => void; children: ReactNode }) {
  const { folders, moveApp } = useAppFolders();
  const current = folders.find((folder) => folder.appIds.includes(appId));
  const targets = folders.filter((folder) => folder.id !== current?.id);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
        {(targets.length > 0 || current) && <ContextMenuSeparator />}
        {targets.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Move to folder</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {targets.map((folder) => <ContextMenuItem key={folder.id} onSelect={() => moveApp(appId, folder.id)}>{folder.name}</ContextMenuItem>)}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {current && <ContextMenuItem onSelect={() => moveApp(appId, null)}>Remove from {current.name}</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Label under an icon that says what happens on release. */
export function DropHint({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
      {children}
    </span>
  );
}

function FolderPreview({ folder, mobile }: { folder: AppFolder; mobile?: boolean }) {
  const icons = folder.appIds.slice(0, 4).flatMap((id) => {
    const app = getApp(id);
    return app ? [app] : [];
  });
  if (icons.length === 0) return <Folder className={cn('text-primary', mobile ? 'size-7' : 'size-6')} aria-hidden />;
  return (
    <span className="grid grid-cols-2 gap-0.5" aria-hidden>
      {icons.map((app) => <app.icon key={app.id} className={cn('text-primary', mobile ? 'size-5' : 'size-4')} />)}
    </span>
  );
}

/** The icon that follows the pointer while an app or folder is dragged. */
export function DragGhost({ id, x, y, merging, mobile }: { id: string; x: number; y: number; merging: boolean; mobile?: boolean }) {
  const { folders } = useAppFolders();
  const folder = folders.find((item) => item.id === id);
  const app = folder ? undefined : getApp(id);
  if (!folder && !app) return null;
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[60] flex w-20 flex-col items-center gap-1.5"
      style={{ transform: `translate(${x - 40}px, ${y - (mobile ? 36 : 32)}px)` }}
    >
      <span className={cn(
        'flex items-center justify-center rounded-xl border bg-background shadow-xl transition-transform duration-150 motion-reduce:transition-none',
        folder ? 'border-primary/30 bg-primary/10' : 'border-os-window-border',
        mobile ? 'size-14 rounded-2xl' : 'size-12',
        merging ? 'scale-75 opacity-80' : 'scale-110',
      )}>
        {folder ? <FolderPreview folder={folder} mobile={mobile} /> : app && <app.icon className={cn('text-primary', mobile ? 'size-7' : 'size-6')} />}
      </span>
      {!merging && <span className="line-clamp-2 rounded bg-background/80 px-1 text-center text-[11px] font-medium leading-tight">{folder?.name ?? app?.title}</span>}
    </div>,
    document.body,
  );
}

interface FolderTileProps {
  folder: AppFolder;
  onOpen: () => void;
  /** When set, a click only selects and a double click or Enter opens, like desktop app icons. */
  onSelect?: () => void;
  selected?: boolean;
  mobile?: boolean;
  style?: CSSProperties;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  dragging?: boolean;
  pickedUp?: boolean;
  dropTarget?: boolean;
}

export function FolderTile({ folder, onOpen, onSelect, selected, mobile = false, style, onPointerDown, onKeyDown, dragging, pickedUp, dropTarget }: FolderTileProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (!onSelect || event.defaultPrevented || event.key !== 'Enter') return;
    event.preventDefault();
    onOpen();
  };
  return (
    <button type="button" style={style} data-home-icon-id={mobile ? folder.id : undefined} onPointerDown={onPointerDown} onKeyDown={handleKeyDown} onClick={onSelect ?? onOpen} onDoubleClick={onSelect ? onOpen : undefined} onContextMenu={mobile ? (event) => event.preventDefault() : undefined} aria-pressed={pickedUp || undefined} aria-label={`Open ${folder.name} folder, ${folder.appIds.length} apps`} className={cn('group relative flex flex-col items-center rounded-xl text-center transition-[background-color,opacity,box-shadow] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:bg-foreground/5', NO_TOUCH_CALLOUT, mobile ? 'gap-2 p-2' : 'w-20 gap-1.5 p-2', (pickedUp || selected) && 'bg-primary/15', dragging && 'opacity-30', dropTarget && 'bg-primary/10')}>
      <span className={cn('relative flex items-center justify-center rounded-xl border border-primary/30 bg-primary/10 shadow-sm transition-transform duration-150 group-hover:-translate-y-0.5 motion-reduce:transition-none', mobile ? 'size-14 rounded-2xl' : 'size-12', dropTarget && 'scale-115 border-primary ring-2 ring-primary/60')}>
        <FolderPreview folder={folder} mobile={mobile} />
      </span>
      <span className={cn('line-clamp-2 font-medium leading-tight', mobile ? 'text-xs' : 'text-[11px] text-foreground/80')}>{folder.name}</span>
      {dropTarget && <DropHint>Add to {folder.name}</DropHint>}
    </button>
  );
}

interface AppFolderControlsProps {
  openFolderId: string | null;
  onCloseFolder: () => void;
  onOpenApp: (id: string) => void;
  onAppPointerDown: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void;
  /** App currently being dragged out of the folder. */
  draggingId?: string | null;
  mobile?: boolean;
}

/** The open folder plus its rename and delete dialogs. */
export function AppFolderControls({ openFolderId, onCloseFolder, onOpenApp, onAppPointerDown, draggingId, mobile = false }: AppFolderControlsProps) {
  const { folders, error, clearError, renameFolder, deleteFolder } = useAppFolders();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');
  const selected = folders.find((folder) => folder.id === openFolderId);

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !renameFolder(selected.id, name)) { setFormError('Enter a folder name of 1 to 40 characters.'); return; }
    setRenameOpen(false);
    setFormError('');
  };

  return (
    <>
      {error && <Alert className={mobile ? 'mb-3' : 'absolute right-4 top-4 z-2 w-72 bg-background'}><AlertDescription>{error} <button type="button" className="underline" onClick={clearError}>Dismiss</button></AlertDescription></Alert>}
      <Dialog open={Boolean(selected) && !renameOpen && !deleteOpen} onOpenChange={(open) => { if (!open) onCloseFolder(); }}>
        <DialogContent data-folder-dialog className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>Drag an app out of the folder to put it back on the home screen.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {selected?.appIds.map((id) => {
              const app = getApp(id);
              if (!app) return null;
              const tile = (
                <button
                  key={id}
                  type="button"
                  onPointerDown={(event) => onAppPointerDown(id, event)}
                  onClick={() => onOpenApp(id)}
                  onContextMenu={mobile ? (event) => event.preventDefault() : undefined}
                  className={cn('flex flex-col items-center gap-2 rounded-xl p-2 text-center transition-opacity hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none', NO_TOUCH_CALLOUT, draggingId === id && 'opacity-30')}
                >
                  <span className="flex size-12 items-center justify-center rounded-xl border border-os-window-border bg-background shadow-sm"><app.icon className="size-6 text-primary" aria-hidden /></span>
                  <span className="line-clamp-2 text-xs font-medium leading-tight">{app.title}</span>
                </button>
              );
              return mobile ? tile : <AppContextMenu key={id} appId={id} onOpen={() => onOpenApp(id)}>{tile}</AppContextMenu>;
            })}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setName(selected?.name ?? ''); setFormError(''); setRenameOpen(true); }}>Rename</Button><Button variant="destructive" onClick={() => setDeleteOpen(true)}>Delete folder</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent><DialogHeader><DialogTitle>Rename folder</DialogTitle><DialogDescription>Choose a name for this folder.</DialogDescription></DialogHeader><form onSubmit={submitRename} className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label htmlFor="rename-folder-name">Folder name</Label><Input id="rename-folder-name" autoFocus value={name} maxLength={40} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(formError)} /></div>{formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<DialogFooter><Button type="submit">Save name</Button></DialogFooter></form></DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {selected?.name}?</AlertDialogTitle><AlertDialogDescription>Apps in this folder will return to the home screen.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (selected) deleteFolder(selected.id); onCloseFolder(); }}>Delete folder</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}
