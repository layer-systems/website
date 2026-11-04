import { useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { MAX_FOLDER_NAME_LENGTH, normalizeFolderName, type AppFolder } from '@/lib/appFolders';
import { menuJustOpened } from '@/os/menuTiming';
import { useIconDrag, type DragPoint } from '@/os/useIconDrag';
import type { HomeScreen } from '@/hooks/useHomeScreen';
import { AppGlyph, type GlyphSize } from './HomeGlyph';
import { HomeIconMenu } from './HomeIconMenu';

interface FolderViewProps {
  /** The open folder; nothing is shown while undefined. */
  folder: AppFolder | undefined;
  home: HomeScreen;
  size: GlyphSize;
  /** Put the cursor in the name field on open (the "Rename" menu item). */
  renaming: boolean;
  onClose: () => void;
  onOpenApp: (appId: string) => void;
  /** An app was dragged past the folder's edge and released at `point`. */
  onDropOutside: (appId: string, point: DragPoint) => void;
}

/**
 * An open folder, phone style: the apps float in a panel over the dimmed home
 * screen. Tap an app to open it, tap the name to rename the folder, drag an
 * app to reorder it, or drag it past the panel's edge to take it out. There is
 * no close or delete button — tapping outside closes, and a folder emptied
 * down to one app dissolves on its own.
 */
export function FolderView({ folder, onClose, ...rest }: FolderViewProps) {
  return (
    <DialogPrimitive.Root open={Boolean(folder)} onOpenChange={(open) => { if (!open) onClose(); }}>
      {folder && <FolderPanel key={folder.id} folder={folder} {...rest} />}
    </DialogPrimitive.Root>
  );
}

function FolderPanel({
  folder,
  home,
  size,
  renaming,
  onOpenApp,
  onDropOutside,
}: Omit<FolderViewProps, 'onClose'> & { folder: AppFolder }) {
  const { appsById, labelOf } = home;
  const columns = size === 'mobile' ? 3 : 4;
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const firstAppRef = useRef<HTMLButtonElement>(null);
  const discardDraft = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ id: string; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const isOutside = (point: DragPoint) => {
    const rect = panelRef.current?.getBoundingClientRect();
    return !rect || point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom;
  };
  const appAt = (point: DragPoint) =>
    document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-folder-app-id]')?.dataset.folderAppId ?? null;

  const drag = useIconDrag({
    onMove: (_id, point) => {
      const out = isOutside(point);
      setOutside(out);
      setTarget(out ? null : appAt(point));
    },
    onDrop: (id, point) => {
      setOutside(false);
      setTarget(null);
      if (isOutside(point)) {
        onDropOutside(id, point);
        return;
      }
      const over = appAt(point);
      if (!over || over === id) return;
      const index = folder.apps.indexOf(over);
      home.reorderInFolder(folder.id, id, index);
      setAnnouncement(`${labelOf(id)} moved to position ${index + 1} of ${folder.apps.length}.`);
    },
    onCancel: () => {
      setOutside(false);
      setTarget(null);
    },
  });

  const commitName = () => {
    const next = draft;
    setDraft(null);
    if (discardDraft.current || next === null) {
      discardDraft.current = false;
      return;
    }
    const name = normalizeFolderName(next, folder.name);
    if (name === folder.name) return;
    home.rename(folder.id, name);
    setAnnouncement(`Folder renamed to ${name}.`);
  };

  const onAppKeyDown = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = folder.apps.indexOf(id);
    if (event.key === 'Escape' && picked) {
      event.preventDefault();
      home.reorderInFolder(folder.id, picked.id, picked.index);
      setPicked(null);
      setAnnouncement('Move cancelled and original position restored.');
      return;
    }
    if (event.key === ' ' || (event.key === 'Enter' && picked?.id === id)) {
      event.preventDefault();
      if (picked?.id === id) {
        setPicked(null);
        setAnnouncement(`${labelOf(id)} dropped at position ${index + 1}.`);
      } else {
        setPicked({ id, index });
        setAnnouncement(`${labelOf(id)} picked up. Use the arrow keys to move it, Enter to drop, Escape to cancel. To take it out of the folder, open its menu with Shift+F10.`);
      }
      return;
    }
    if (picked?.id !== id) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(folder.apps.length - 1, index + step));
    home.reorderInFolder(folder.id, id, next);
    setAnnouncement(`${labelOf(id)} moved to position ${next + 1} of ${folder.apps.length}.`);
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 backdrop-blur-sm transition-colors motion-reduce:transition-none data-[state=open]:animate-in data-[state=open]:fade-in-0',
          outside ? 'bg-black/10' : 'bg-black/40',
        )}
      />
      <DialogPrimitive.Content
        aria-describedby="folder-view-help"
        onOpenAutoFocus={(event) => {
          // Focus an app, not the name field: on a phone that would pop up
          // the keyboard every time a folder opens.
          event.preventDefault();
          (renaming ? nameRef.current : firstAppRef.current)?.focus();
        }}
        onEscapeKeyDown={(event) => {
          // Escape first cancels a keyboard move or a rename in progress.
          if (picked || document.activeElement === nameRef.current) event.preventDefault();
        }}
        className="fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 motion-reduce:animate-none"
      >
        <div
          ref={panelRef}
          className={cn(
            'rounded-3xl border border-os-window-border bg-background/85 p-4 shadow-xl backdrop-blur-xl transition-opacity motion-reduce:transition-none',
            outside && 'opacity-60',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{folder.name}</DialogPrimitive.Title>
          <p id="folder-view-help" className="sr-only">
            Folder with {folder.apps.length} apps. Press Space on an app to pick it up and the arrow keys to move it.
            Open an app’s menu with Shift+F10 to move it out of the folder.
          </p>
          <input
            ref={nameRef}
            value={draft ?? folder.name}
            maxLength={MAX_FOLDER_NAME_LENGTH}
            aria-label="Folder name"
            enterKeyHint="done"
            spellCheck={false}
            onFocus={(event) => {
              setDraft(folder.name);
              event.currentTarget.select();
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                discardDraft.current = true;
                event.currentTarget.blur();
              }
            }}
            className="mb-4 block w-full truncate rounded-lg bg-transparent px-2 py-1 text-center text-2xl font-semibold tracking-tight transition-colors hover:bg-foreground/5 focus:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />

          <div
            role="list"
            aria-label={`Apps in ${folder.name}`}
            className={cn('grid gap-2', columns === 3 ? 'grid-cols-3' : 'grid-cols-4')}
          >
            {folder.apps.map((id, index) => {
              const app = appsById.get(id);
              if (!app) return null;
              const isDragging = drag.dragging === id;
              return (
                <div role="listitem" key={id}>
                  <HomeIconMenu id={id} home={home} onOpen={() => onOpenApp(id)} announce={setAnnouncement}>
                    <button
                      ref={index === 0 ? firstAppRef : undefined}
                      type="button"
                      data-folder-app-id={id}
                      aria-label={`${app.title} — ${app.description}`}
                      aria-pressed={picked?.id === id || undefined}
                      aria-describedby={picked?.id === id ? 'folder-view-status' : undefined}
                      onPointerDown={(event) => drag.startDrag(id, event)}
                      onClick={() => {
                        if (drag.consumeClick(id) || menuJustOpened()) return;
                        onOpenApp(id);
                      }}
                      onKeyDown={(event) => onAppKeyDown(id, event)}
                      style={isDragging ? { transform: `translate(${drag.offset.dx}px, ${drag.offset.dy}px)` } : undefined}
                      className={cn(
                        'flex w-full touch-manipulation flex-col items-center gap-1.5 rounded-xl p-2 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        !isDragging && 'transition-[transform,background-color] active:scale-95 motion-reduce:transition-none',
                        isDragging && 'pointer-events-none relative z-10 scale-105',
                        target === id && !isDragging && 'bg-primary/10 ring-2 ring-primary/50',
                        picked?.id === id && 'bg-primary/15',
                      )}
                    >
                      <AppGlyph app={app} size={size} className={isDragging ? 'shadow-lg' : undefined} />
                      <span className="line-clamp-2 text-center text-xs font-medium leading-tight">{app.title}</span>
                    </button>
                  </HomeIconMenu>
                </div>
              );
            })}
          </div>

          <p
            aria-hidden
            className={cn(
              'mt-3 text-center text-xs text-muted-foreground transition-opacity motion-reduce:transition-none',
              outside ? 'opacity-100' : 'opacity-0',
            )}
          >
            Release to take it out of the folder
          </p>
          <span id="folder-view-status" className="sr-only" aria-live="polite">{announcement}</span>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
