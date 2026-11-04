import type { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { folderContaining, isFolderId } from '@/lib/appFolders';
import { markMenuOpened } from '@/os/menuTiming';
import type { HomeScreen } from '@/hooks/useHomeScreen';

interface HomeIconMenuProps {
  id: string;
  home: HomeScreen;
  children: ReactNode;
  onOpen: () => void;
  /** Folders only: open the folder with its name ready to edit. */
  onRename?: () => void;
  /** Reports what changed, for the screen reader live region. */
  announce: (message: string) => void;
}

/**
 * The long-press / right-click menu on a home-screen icon — the phone's
 * "hold an icon" menu, and the keyboard route (Shift+F10 or the menu key) to
 * everything dragging does. Apps inside a folder get "move out" instead of
 * "group with".
 */
export function HomeIconMenu({ id, home, children, onOpen, onRename, announce }: HomeIconMenuProps) {
  const { folders, items, labelOf } = home;
  const isFolder = isFolderId(id);
  const parent = isFolder ? undefined : folderContaining(folders, id);
  const otherFolders = folders.filter((folder) => folder.id !== parent?.id);
  const groupable = items.filter((item) => item !== id && !isFolderId(item));

  return (
    <ContextMenu onOpenChange={(open) => { if (open) markMenuOpened(); }}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
        {isFolder && onRename && <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>}

        {parent && (
          <ContextMenuItem
            onSelect={() => {
              home.moveOut(id);
              announce(`${labelOf(id)} moved out of ${parent.name}.`);
            }}
          >
            Move out of “{parent.name}”
          </ContextMenuItem>
        )}

        {!isFolder && otherFolders.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{parent ? 'Move to folder' : 'Add to folder'}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-80 w-48 overflow-y-auto">
              {otherFolders.map((folder) => (
                <ContextMenuItem
                  key={folder.id}
                  onSelect={() => {
                    home.moveToFolder(id, folder.id);
                    announce(`${labelOf(id)} added to ${folder.name}.`);
                  }}
                >
                  {folder.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {!isFolder && !parent && groupable.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>New folder with</ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-80 w-48 overflow-y-auto">
                {groupable.map((other) => (
                  <ContextMenuItem
                    key={other}
                    onSelect={() => {
                      const folder = home.merge(id, other);
                      if (folder) announce(`New folder ${folder.name} with ${labelOf(other)} and ${labelOf(id)}.`);
                    }}
                  >
                    {labelOf(other)}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
