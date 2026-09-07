import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  EMPTY_FOLDERS,
  addFolderWithId,
  clearFolderState,
  createFolderId,
  loadFolderState,
  reconcileFolderState,
  removeFolder,
  renameFolder,
  saveFolderState,
  setAppFolder,
  type FolderState,
} from './folders';

const SAVE_DELAY = 250;

/**
 * Folder state for the desktop/home-screen icons. Persists per signed-in
 * user (anonymous key when signed out) so the structure survives sign-in/out
 * cycles for both identities.
 */
export function useFolders(appIds: string[]) {
  const { user } = useCurrentUser();
  const userKey = user?.pubkey ?? null;
  const idsKey = appIds.join('|');
  const stableIds = useMemo(() => (idsKey ? idsKey.split('|') : []), [idsKey]);

  const [state, setState] = useState<FolderState>(() => loadFolderState(userKey, stableIds));
  // Render-phase sync for a key change (sign-in/out): the same pattern
  // useLocalStorage uses for its storageKey argument.
  const [loadedKey, setLoadedKey] = useState(userKey);
  if (loadedKey !== userKey) {
    setLoadedKey(userKey);
    setState(loadFolderState(userKey, stableIds));
  }

  const normalized = useMemo(() => reconcileFolderState(state, stableIds), [state, stableIds]);

  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!dirty.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      dirty.current = false;
      saveFolderState(normalized, userKey);
    }, SAVE_DELAY);
    return () => clearTimeout(saveTimer.current);
  }, [normalized, userKey]);

  // A reset from another consumer (e.g. Settings) reloads the current key.
  useEffect(() => {
    const onReset = () => setState(loadFolderState(userKey, stableIds));
    window.addEventListener('icon-layout-reset', onReset);
    return () => window.removeEventListener('icon-layout-reset', onReset);
  }, [userKey, stableIds]);

  const update = useCallback((updater: (current: FolderState) => FolderState) => {
    dirty.current = true;
    setState((current) => updater(reconcileFolderState(current, stableIds)));
  }, [stableIds]);

  const createFolder = useCallback((name: string): string => {
    // Mint the id up front so the updater stays pure (no side effects, safe
    // to call more than once, e.g. under strict-mode double-invocation).
    const id = createFolderId();
    update((current) => addFolderWithId(current, id, name).state);
    return id;
  }, [update]);

  const rename = useCallback((folderId: string, name: string) => {
    update((current) => renameFolder(current, folderId, name));
  }, [update]);

  const remove = useCallback((folderId: string) => {
    update((current) => removeFolder(current, folderId));
  }, [update]);

  const assign = useCallback((appId: string, folderId: string | null) => {
    update((current) => setAppFolder(current, appId, folderId));
  }, [update]);

  const resetFolders = useCallback(() => {
    clearFolderState(userKey);
    dirty.current = false;
    clearTimeout(saveTimer.current);
    setState(EMPTY_FOLDERS);
    window.dispatchEvent(new Event('icon-layout-reset'));
  }, [userKey]);

  return useMemo(
    () => ({ folderState: normalized, createFolder, renameFolder: rename, removeFolder: remove, setAppFolder: assign, resetFolders }),
    [normalized, createFolder, rename, remove, assign, resetFolders],
  );
}
