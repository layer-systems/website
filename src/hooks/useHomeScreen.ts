import { useCallback, useMemo } from 'react';
import { useAppFolders } from '@/hooks/useAppFolders';
import {
  addToFolder,
  createFolder,
  folderContaining,
  isFolderId,
  moveWithinFolder,
  newFolderId,
  removeFromFolder,
  renameFolder,
  suggestFolderName,
  topLevelItems,
  type AppFolder,
} from '@/lib/appFolders';
import { desktopApps } from '@/os/registry';
import { useIconLayout } from '@/os/useIconLayout';
import type { DesktopSlot, GridGeometry } from '@/os/iconLayout';

/** Where an app taken out of a folder lands on the home screen. */
export interface Placement {
  /** Desktop grid cell. Occupied or missing: the first free cell. */
  cell?: { col: number; row: number };
  /** Mobile order: insert before this item. Missing: right after the folder. */
  before?: string | null;
}

function renameSlot(slots: DesktopSlot[], from: string, to: string): DesktopSlot[] {
  return slots.map((slot) => (slot.id === from ? { ...slot, id: to } : slot));
}

function renameItem(order: string[], from: string, to: string): string[] {
  return order.map((id) => (id === from ? to : id));
}

function insertAt(order: string[], id: string, before: string | null | undefined, after: string | undefined): string[] {
  const without = order.filter((item) => item !== id);
  let index = without.length;
  if (before) index = without.indexOf(before);
  else if (after && without.includes(after)) index = without.indexOf(after) + 1;
  if (index < 0) index = without.length;
  without.splice(index, 0, id);
  return without;
}

/**
 * Everything the home screens (desktop grid and mobile) need: the top-level
 * items — apps and folders — with their positions, plus the folder operations.
 *
 * Each operation edits the folder structure and the icon layout together, so
 * a new folder takes the exact spot of the icon it was dropped on and a folder
 * that dissolves leaves its last app where the folder was.
 */
export function useHomeScreen(geometry: GridGeometry) {
  // The registry is static; memoizing keeps every derived value stable.
  const apps = useMemo(() => desktopApps(), []);
  const appIds = useMemo(() => apps.map((app) => app.id), [apps]);
  const appsById = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const { folders, setFolders } = useAppFolders(appIds);
  const foldersById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const items = useMemo(() => topLevelItems(folders, appIds), [appIds, folders]);
  const { layout, setDesktop, setMobile, reset } = useIconLayout(items, geometry);

  /*
   * Each operation makes exactly one `setDesktop` and one `setMobile` call.
   * Their updaters see the layout reconciled against the item ids of *this*
   * render, so a second call in the same event would drop ids the first one
   * just introduced (a dissolved folder's last app, a new folder).
   */

  const moveToFolder = useCallback((appId: string, folderId: string, index?: number): AppFolder | undefined => {
    const target = foldersById.get(folderId);
    if (!target || isFolderId(appId)) return undefined;
    const source = folderContaining(folders, appId);
    if (source?.id === folderId) {
      if (index !== undefined) setFolders(moveWithinFolder(folders, folderId, appId, index));
      return target;
    }
    const removal = removeFromFolder(folders, appId);
    setFolders(addToFolder(removal.folders, folderId, appId, index));
    const { collapsed } = removal;
    if (collapsed) {
      setDesktop((slots) => renameSlot(slots, collapsed.folderId, collapsed.remainingAppId));
      setMobile((order) => renameItem(order, collapsed.folderId, collapsed.remainingAppId));
    }
    return target;
  }, [folders, foldersById, setDesktop, setFolders, setMobile]);

  /**
   * Drops `draggedId` onto `targetId`. Onto a folder: the app joins it. Onto an
   * app: both become a new folder in the target's place. Folders don't nest,
   * so dragging a folder onto anything is not a merge.
   */
  const merge = useCallback((draggedId: string, targetId: string): AppFolder | undefined => {
    if (draggedId === targetId || isFolderId(draggedId)) return undefined;
    if (isFolderId(targetId)) return moveToFolder(draggedId, targetId);
    const target = appsById.get(targetId);
    const dragged = appsById.get(draggedId);
    if (!target || !dragged) return undefined;

    const { folders: rest, collapsed } = removeFromFolder(folders, draggedId);
    const folder = { id: newFolderId(), name: suggestFolderName([target, dragged]) };
    setFolders(createFolder(rest, targetId, draggedId, folder));
    // A dissolving source folder first hands its spot to its last app — which
    // may itself be the target.
    setDesktop((slots) => {
      const next = collapsed ? renameSlot(slots, collapsed.folderId, collapsed.remainingAppId) : slots;
      return renameSlot(next, targetId, folder.id);
    });
    setMobile((order) => {
      const next = collapsed ? renameItem(order, collapsed.folderId, collapsed.remainingAppId) : order;
      return renameItem(next, targetId, folder.id);
    });
    return { ...folder, apps: [targetId, draggedId] };
  }, [appsById, folders, moveToFolder, setDesktop, setFolders, setMobile]);

  const moveOut = useCallback((appId: string, placement: Placement = {}) => {
    const source = folderContaining(folders, appId);
    if (!source) return;
    const { folders: rest, collapsed } = removeFromFolder(folders, appId);
    setFolders(rest);
    const anchor = collapsed?.remainingAppId ?? source.id;
    setDesktop((slots) => {
      const next = collapsed ? renameSlot(slots, collapsed.folderId, collapsed.remainingAppId) : slots;
      const cell = placement.cell;
      return cell ? [...next.filter((slot) => slot.id !== appId), { id: appId, ...cell }] : next;
    });
    setMobile((order) => {
      const next = collapsed ? renameItem(order, collapsed.folderId, collapsed.remainingAppId) : order;
      return insertAt(next, appId, placement.before, anchor);
    });
  }, [folders, setDesktop, setFolders, setMobile]);

  const rename = useCallback((folderId: string, name: string) => {
    setFolders(renameFolder(folders, folderId, name));
  }, [folders, setFolders]);

  const reorderInFolder = useCallback((folderId: string, appId: string, index: number) => {
    setFolders(moveWithinFolder(folders, folderId, appId, index));
  }, [folders, setFolders]);

  const labelOf = useCallback((id: string) => foldersById.get(id)?.name ?? appsById.get(id)?.title ?? id, [appsById, foldersById]);

  return {
    apps,
    appsById,
    folders,
    foldersById,
    items,
    layout,
    setDesktop,
    setMobile,
    reset,
    merge,
    moveToFolder,
    moveOut,
    rename,
    reorderInFolder,
    labelOf,
  };
}

export type HomeScreen = ReturnType<typeof useHomeScreen>;
