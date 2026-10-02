import { useCallback, useState, type ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { desktopApps } from './registry';
import { FolderContext, type AppFolder, type FolderState } from './appFoldersContext';
const STORAGE_PREFIX = 'nostr:app-folders:v1:';
const appIds = new Set(desktopApps().map((app) => app.id));

function readFolders(key: string): FolderState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { folders: [], error: null };
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('Invalid folder data');
    const seen = new Set<string>();
    const folderIds = new Set<string>();
    const folders: AppFolder[] = data.slice(0, 50).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Record<string, unknown>;
      if (typeof value.id !== 'string' || !value.id.startsWith('folder:') || folderIds.has(value.id) ||
          typeof value.name !== 'string' || !value.name.trim() || !Array.isArray(value.appIds)) return [];
      folderIds.add(value.id);
      const ids = value.appIds.filter((id): id is string =>
        typeof id === 'string' && appIds.has(id) && !seen.has(id) && (seen.add(id), true));
      return [{ id: value.id, name: value.name.slice(0, 40), appIds: ids }];
    });
    return { folders, error: null };
  } catch {
    return { folders: [], error: 'Saved folders could not be loaded. You can still create new folders.' };
  }
}

export function AppFoldersProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const storageKey = `${STORAGE_PREFIX}${user?.pubkey ?? 'guest'}`;
  const [state, setState] = useState<FolderState>(() => readFolders(storageKey));
  // Reload in place on account switch. Remounting via `key` would also
  // remount the whole shell below and drop the state of every open window.
  const [loadedKey, setLoadedKey] = useState(storageKey);
  if (loadedKey !== storageKey) {
    setLoadedKey(storageKey);
    setState(readFolders(storageKey));
  }
  const update = useCallback((change: (folders: AppFolder[]) => AppFolder[]) => {
    setState((previous) => {
      const folders = change(previous.folders);
      try {
        localStorage.setItem(storageKey, JSON.stringify(folders));
        return { folders, error: null };
      } catch {
        return { folders, error: 'Folders changed on this device, but could not be saved. Check your browser storage.' };
      }
    });
  }, [storageKey]);
  const createFolder = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40 || state.folders.length >= 50) return null;
    const id = `folder:${crypto.randomUUID()}`;
    update((folders) => [...folders, { id, name: trimmed, appIds: [] }]);
    return id;
  }, [state.folders.length, update]);
  const renameFolder = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40) return false;
    update((folders) => folders.map((folder) => folder.id === id ? { ...folder, name: trimmed } : folder));
    return true;
  }, [update]);
  const deleteFolder = useCallback((id: string) => update((folders) => folders.filter((folder) => folder.id !== id)), [update]);
  const moveApp = useCallback((appId: string, folderId: string | null) => {
    if (!appIds.has(appId)) return;
    update((folders) => folders.map((folder) => ({
      ...folder,
      appIds: folder.id === folderId
        ? [...folder.appIds.filter((id) => id !== appId), appId]
        : folder.appIds.filter((id) => id !== appId),
    })));
  }, [update]);
  return <FolderContext.Provider value={{ ...state, createFolder, renameFolder, deleteFolder, moveApp, clearError: () => setState((current) => ({ ...current, error: null })) }}>{children}</FolderContext.Provider>;
}
