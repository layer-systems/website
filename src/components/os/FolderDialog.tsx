import { useId, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { folderNameTaken, normalizeFolderName, type Folder } from '@/os/folders';

interface FolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing folder names, for the duplicate check. */
  folders: Folder[];
  /** Set when renaming; omitted when creating. */
  folder?: Folder;
  onSubmit: (name: string) => void;
}

/** Small create/rename dialog with an inline duplicate-name error. */
export function FolderDialog({ open, onOpenChange, folders, folder, onSubmit }: FolderDialogProps) {
  const errorId = useId();
  // Keyed remount resets the input; this only seeds the initial value.
  const [name, setName] = useState(() => folder?.name ?? '');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizeFolderName(name);
    if (!normalized) {
      setError('Give the folder a name.');
      return;
    }
    if (folderNameTaken(folders, normalized, folder?.id)) {
      setError(`A folder named “${normalized}” already exists.`);
      return;
    }
    onSubmit(normalized);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{folder ? 'Rename folder' : 'New folder'}</DialogTitle>
            <DialogDescription>
              {folder
                ? 'Apps inside stay put when you rename it.'
                : 'Group apps together on the desktop and the home screen.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-4">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              value={name}
              autoFocus
              autoComplete="off"
              placeholder="e.g. Social"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError('');
              }}
            />
            {error && (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{folder ? 'Rename' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
