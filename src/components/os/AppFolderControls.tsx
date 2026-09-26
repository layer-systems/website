import { useState, type CSSProperties } from 'react';
import { Folder, FolderPlus, MoreHorizontal } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppFolders, type AppFolder } from '@/os/appFoldersContext';
import { getApp } from '@/os/registry';
import { cn } from '@/lib/utils';

export function MoveAppMenu({ appId, appTitle }: { appId: string; appTitle: string }) {
  const { folders, moveApp } = useAppFolders();
  const current = folders.find((folder) => folder.appIds.includes(appId));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Move ${appTitle}`} onPointerDown={(event) => event.stopPropagation()} className="rounded-md bg-background/90 p-1 text-foreground shadow-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Move {appTitle} to</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={!current} onSelect={() => moveApp(appId, null)}>Home screen</DropdownMenuItem>
          {folders.map((folder) => <DropdownMenuItem key={folder.id} disabled={current?.id === folder.id} onSelect={() => moveApp(appId, folder.id)}>{folder.name}</DropdownMenuItem>)}
        </DropdownMenuGroup>
        {folders.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Create a folder first.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FolderTile({ folder, onOpen, mobile = false, style }: { folder: AppFolder; onOpen: () => void; mobile?: boolean; style?: CSSProperties }) {
  return (
    <button type="button" style={style} data-home-icon-id={mobile ? folder.id : undefined} onClick={onOpen} aria-label={`Open ${folder.name} folder, ${folder.appIds.length} apps`} className={cn('group flex flex-col items-center rounded-xl text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:bg-foreground/5', mobile ? 'gap-2 p-2' : 'w-20 gap-1.5 p-2')}>
      <span className={cn('relative flex items-center justify-center rounded-xl border border-primary/30 bg-primary/10 shadow-sm transition-transform group-hover:-translate-y-0.5', mobile ? 'size-14' : 'size-12')}>
        <Folder className={cn('text-primary', mobile ? 'size-7' : 'size-6')} aria-hidden />
        {folder.appIds.length > 0 && <span className="absolute -bottom-1 -right-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{folder.appIds.length}</span>}
      </span>
      <span className={cn('line-clamp-2 font-medium leading-tight', mobile ? 'text-xs' : 'text-[11px] text-foreground/80')}>{folder.name}</span>
    </button>
  );
}

export function AppFolderControls({ onOpenApp, mobile = false, openFolderId, onCloseFolder }: { onOpenApp: (id: string) => void; mobile?: boolean; openFolderId: string | null; onCloseFolder: () => void }) {
  const { folders, error, clearError, createFolder, renameFolder, deleteFolder } = useAppFolders();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');
  const selected = folders.find((folder) => folder.id === openFolderId);

  const submitCreate = (event: React.FormEvent) => {
    event.preventDefault();
    const id = createFolder(name);
    if (!id) { setFormError('Enter a folder name of 1 to 40 characters, or remove an existing folder.'); return; }
    setCreateOpen(false);
    onCloseFolder();
    // The new folder appears on the home screen and can be opened there.
    setName('');
    setFormError('');
  };
  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !renameFolder(selected.id, name)) { setFormError('Enter a folder name of 1 to 40 characters.'); return; }
    setRenameOpen(false);
    setFormError('');
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className={mobile ? '' : 'absolute right-4 top-4 z-2 bg-background/90 shadow-sm'} onClick={() => { setName(''); setFormError(''); setCreateOpen(true); }}>
        <FolderPlus aria-hidden /> New folder
      </Button>
      {error && <Alert className={mobile ? 'mt-3' : 'absolute right-4 top-14 z-2 w-72 bg-background'}><AlertDescription>{error} <button type="button" className="underline" onClick={clearError}>Dismiss</button></AlertDescription></Alert>}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New folder</DialogTitle><DialogDescription>Group apps together on your home screen.</DialogDescription></DialogHeader>
          <form onSubmit={submitCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2"><Label htmlFor="new-folder-name">Folder name</Label><Input id="new-folder-name" autoFocus value={name} maxLength={40} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(formError)} /></div>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <DialogFooter><Button type="submit">Create folder</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(selected) && !renameOpen && !deleteOpen} onOpenChange={(open) => { if (!open) onCloseFolder(); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.appIds.length ?? 0} apps in this folder.</DialogDescription></DialogHeader>
          {selected?.appIds.length ? (
            <div className="flex flex-col gap-1">
              {selected.appIds.map((id) => {
                const app = getApp(id);
                if (!app) return null;
                return <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted"><button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-2 text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={() => { onCloseFolder(); onOpenApp(id); }}><app.icon className="size-5 shrink-0 text-primary" aria-hidden /><span className="truncate">{app.title}</span></button><MoveAppMenu appId={id} appTitle={app.title} /></div>;
              })}
            </div>
          ) : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">This folder is empty. Use an app’s Move menu to add it.</p>}
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
