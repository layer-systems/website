import { FolderOpen, Folder as FolderGlyph, LogOut, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getApp } from '@/os/registry';
import type { Folder } from '@/os/folders';

interface FolderWindowProps {
  folder: Folder;
  /** App ids inside this folder, in registry order. */
  appIds: string[];
  onOpenApp: (appId: string) => void;
  onRemoveApp: (appId: string) => void;
  onRename: () => void;
  onDelete: () => void;
}

/**
 * The contents of a desktop folder, shown as a floating panel below the
 * folder icon while it is open. Not an OS window — folders are lightweight.
 */
export function FolderWindow({ folder, appIds, onOpenApp, onRemoveApp, onRename, onDelete }: FolderWindowProps) {
  const apps = appIds
    .map((id) => getApp(id))
    .filter((app): app is NonNullable<typeof app> => Boolean(app));

  return (
    <div
      role="dialog"
      aria-label={`Folder ${folder.name}`}
      className="w-64 rounded-xl border border-os-window-border bg-popover shadow-xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FolderGlyph className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate text-[13px] font-semibold">{folder.name}</span>
        <div className="ml-auto flex shrink-0 items-center">
          <Button variant="ghost" size="icon-sm" aria-label={`Rename folder ${folder.name}`} onClick={onRename}>
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete folder ${folder.name}`} onClick={onDelete}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {apps.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          This folder is empty. Drag an app onto the folder, or use its context menu to move it here.
        </p>
      ) : (
        <ul className="os-scroll max-h-64 overflow-y-auto p-1.5">
          {apps.map((app) => (
            <li key={app.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
              <button
                type="button"
                onClick={() => onOpenApp(app.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <app.icon className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate text-[13px]">{app.title}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${app.title} from ${folder.name}`}
                onClick={() => onRemoveApp(app.id)}
              >
                <LogOut className="size-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <FolderOpen className="size-3" aria-hidden />
        {apps.length} {apps.length === 1 ? 'app' : 'apps'}
      </div>
    </div>
  );
}
