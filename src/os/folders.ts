import { z } from 'zod';

// Separate from the icon positions key: folders persist per user, while the
// anonymous positions layout keeps its pre-folders key for compatibility.
const BASE_STORAGE_KEY = 'nostr:folders';
const VERSION = 1;

export const MAX_FOLDERS = 32;
export const MAX_FOLDER_NAME = 40;

export interface Folder {
  id: string;
  name: string;
}

export interface FolderState {
  /** Every folder, in creation order. */
  folders: Folder[];
  /** `appId -> folderId`; apps without an entry live at the top level. */
  membership: Record<string, string>;
}

export const EMPTY_FOLDERS: FolderState = { folders: [], membership: {} };

const FolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(MAX_FOLDER_NAME),
});

const FolderStateSchema = z.object({
  version: z.literal(VERSION),
  folders: z.array(FolderSchema).max(MAX_FOLDERS),
  membership: z.record(z.string().min(1), z.string().min(1)).refine(
    (membership) => Object.keys(membership).length <= 500,
    { message: 'too many folder assignments' },
  ),
});

/** Per-user key when signed in, the shared anonymous key otherwise. */
export function folderStorageKey(userKey?: string | null): string {
  return userKey ? `${BASE_STORAGE_KEY}:${userKey}` : BASE_STORAGE_KEY;
}

export function normalizeFolderName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_FOLDER_NAME);
}

/** Case-insensitive duplicate check used by the create/rename dialog. */
export function folderNameTaken(folders: Folder[], name: string, excludeId?: string): boolean {
  const needle = name.toLowerCase();
  return folders.some((folder) => folder.id !== excludeId && folder.name.toLowerCase() === needle);
}

const MAX_MEMBERSHIP = 500;

/** Drops assignments to folders/apps that no longer exist and dedupes folder ids. */
export function reconcileFolderState(state: FolderState, appIds: string[]): FolderState {
  const seen = new Set<string>();
  const folders: Folder[] = [];
  for (const folder of state.folders) {
    if (folders.length >= MAX_FOLDERS) break;
    if (seen.has(folder.id)) continue;
    const name = normalizeFolderName(folder.name);
    if (!name) continue;
    seen.add(folder.id);
    folders.push({ id: folder.id, name });
  }
  const eligible = new Set(folders.map((folder) => folder.id));
  const knownApps = new Set(appIds);
  const membership: Record<string, string> = {};
  for (const [appId, folderId] of Object.entries(state.membership)) {
    if (Object.keys(membership).length >= MAX_MEMBERSHIP) break;
    if (eligible.has(folderId) && knownApps.has(appId)) membership[appId] = folderId;
  }
  return { folders, membership };
}

let counter = 0;

export function createFolderId(): string {
  counter = (counter + 1) % 36 ** 4;
  return `f${Date.now().toString(36)}${counter.toString(36)}`;
}

export function addFolder(state: FolderState, name: string): { state: FolderState; folder: Folder } {
  return addFolderWithId(state, createFolderId(), name);
}

/** Pure variant of {@link addFolder} for callers that must mint the id up front. */
export function addFolderWithId(state: FolderState, id: string, name: string): { state: FolderState; folder: Folder } {
  const folder = { id, name };
  return { state: { ...state, folders: [...state.folders, folder] }, folder };
}

export function renameFolder(state: FolderState, folderId: string, name: string): FolderState {
  return {
    ...state,
    folders: state.folders.map((folder) => (folder.id === folderId ? { ...folder, name } : folder)),
  };
}

/** Removes the folder; its apps return to the top level. */
export function removeFolder(state: FolderState, folderId: string): FolderState {
  const membership: Record<string, string> = {};
  for (const [appId, assigned] of Object.entries(state.membership)) {
    if (assigned !== folderId) membership[appId] = assigned;
  }
  return { folders: state.folders.filter((folder) => folder.id !== folderId), membership };
}

/** Assigns an app to a folder, or back to the top level with `folderId: null`. */
export function setAppFolder(state: FolderState, appId: string, folderId: string | null): FolderState {
  const membership = { ...state.membership };
  if (folderId && state.folders.some((folder) => folder.id === folderId)) membership[appId] = folderId;
  else delete membership[appId];
  return { ...state, membership };
}

export function appsInFolder(state: FolderState, folderId: string): string[] {
  return Object.entries(state.membership)
    .filter(([, assigned]) => assigned === folderId)
    .map(([appId]) => appId);
}

export function loadFolderState(userKey: string | null | undefined, appIds: string[]): FolderState {
  try {
    const raw = localStorage.getItem(folderStorageKey(userKey));
    if (!raw) return EMPTY_FOLDERS;
    return reconcileFolderState(FolderStateSchema.parse(JSON.parse(raw)), appIds);
  } catch {
    return EMPTY_FOLDERS;
  }
}

export function saveFolderState(state: FolderState, userKey: string | null | undefined): void {
  try {
    localStorage.setItem(folderStorageKey(userKey), JSON.stringify({ version: VERSION, ...state }));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory state remains usable.
  }
}

export function clearFolderState(userKey: string | null | undefined): void {
  try {
    localStorage.removeItem(folderStorageKey(userKey));
  } catch {
    // The caller still resets its in-memory state.
  }
}
