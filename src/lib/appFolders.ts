import { z } from 'zod';
import type { AppCategory, AppDefinition } from '@/os/types';

/**
 * App folders: the user's own grouping of home-screen icons, phone style.
 *
 * Stored as a NIP-78 "arbitrary custom app data" event (kind 30078). The whole
 * structure — folder ids, names and the apps inside — is JSON encrypted with
 * NIP-44 to the user's own pubkey, so nothing about it is readable on a relay.
 * See NIP.md.
 */
export const APP_FOLDERS_KIND = 30078;
export const APP_FOLDERS_D_TAG = 'layer-systems:app-folders';
export const APP_FOLDERS_ALT = 'Encrypted app folder layout for LAYER.systems';

/** Every folder id carries this prefix, so it can never collide with an app id. */
export const FOLDER_ID_PREFIX = 'folder:';
export const MAX_FOLDER_NAME_LENGTH = 40;
const PAYLOAD_VERSION = 1;

export interface AppFolder {
  /** `folder:<random>` — also the folder's id in the icon layout. */
  id: string;
  name: string;
  /** App ids, in the order they are shown inside the folder. */
  apps: string[];
}

const FolderSchema = z.object({
  id: z.string().startsWith(FOLDER_ID_PREFIX).max(64),
  name: z.string().max(200),
  apps: z.array(z.string().min(1).max(64)).max(200),
});

export const FoldersSchema = z.array(FolderSchema).max(100);

const PayloadSchema = z.object({
  version: z.literal(PAYLOAD_VERSION),
  folders: FoldersSchema,
});

export function isFolderId(id: string): boolean {
  return id.startsWith(FOLDER_ID_PREFIX);
}

export function newFolderId(): string {
  return `${FOLDER_ID_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
}

/** Trims and collapses whitespace and caps the length; empty input yields `fallback`. */
export function normalizeFolderName(name: string, fallback = 'Folder'): string {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME_LENGTH).trim();
  return clean || fallback;
}

const CATEGORY_NAMES: Record<AppCategory, string> = {
  social: 'Social',
  tools: 'Tools',
  system: 'System',
};

/** Like a phone: two apps from the same category name the folder after it. */
export function suggestFolderName(apps: Pick<AppDefinition, 'category'>[]): string {
  const [first] = apps;
  if (first && apps.every((app) => app.category === first.category)) return CATEGORY_NAMES[first.category];
  return 'Folder';
}

/** The plaintext that gets NIP-44 encrypted into the event's `content`. */
export function serializeFolders(folders: AppFolder[]): string {
  return JSON.stringify({ version: PAYLOAD_VERSION, folders });
}

/** Parses decrypted `content`; throws on anything that isn't a valid payload. */
export function parseFolders(plaintext: string): AppFolder[] {
  return PayloadSchema.parse(JSON.parse(plaintext)).folders;
}

/**
 * Makes a stored structure safe to render against the current app registry:
 * unknown and duplicate apps are dropped (an app lives in one folder at most),
 * duplicate folders are dropped, names are normalized, and any folder left
 * with fewer than two apps dissolves — its app returns to the top level.
 */
export function reconcileFolders(folders: AppFolder[], appIds: string[]): AppFolder[] {
  const known = new Set(appIds);
  const placed = new Set<string>();
  const seenFolders = new Set<string>();
  const result: AppFolder[] = [];

  for (const folder of folders) {
    if (seenFolders.has(folder.id)) continue;
    seenFolders.add(folder.id);
    const apps: string[] = [];
    for (const id of folder.apps) {
      if (known.has(id) && !placed.has(id) && !apps.includes(id)) apps.push(id);
    }
    if (apps.length < 2) continue;
    for (const id of apps) placed.add(id);
    result.push({ id: folder.id, name: normalizeFolderName(folder.name), apps });
  }
  return result;
}

/**
 * The ids shown at the top level of the home screen, in registry order. A
 * folder takes the place of its first app, so a fresh layout keeps folders
 * near the apps they were made from.
 */
export function topLevelItems(folders: AppFolder[], appIds: string[]): string[] {
  const folderOf = new Map<string, string>();
  for (const folder of folders) {
    for (const app of folder.apps) folderOf.set(app, folder.id);
  }
  const items: string[] = [];
  const emitted = new Set<string>();
  for (const id of appIds) {
    const item = folderOf.get(id) ?? id;
    if (emitted.has(item)) continue;
    emitted.add(item);
    items.push(item);
  }
  return items;
}

export function folderContaining(folders: AppFolder[], appId: string): AppFolder | undefined {
  return folders.find((folder) => folder.apps.includes(appId));
}

function withoutApp(folders: AppFolder[], appId: string): AppFolder[] {
  return folders.map((folder) =>
    folder.apps.includes(appId) ? { ...folder, apps: folder.apps.filter((id) => id !== appId) } : folder,
  );
}

/** Drops `targetId`'s app and `draggedId` into a brand-new folder, target first. */
export function createFolder(
  folders: AppFolder[],
  targetId: string,
  draggedId: string,
  folder: Pick<AppFolder, 'id' | 'name'>,
): AppFolder[] {
  const rest = withoutApp(withoutApp(folders, draggedId), targetId);
  return [...rest, { ...folder, apps: [targetId, draggedId] }];
}

/** Moves `appId` into `folderId` (out of any folder it was in), at `index` or the end. */
export function addToFolder(folders: AppFolder[], folderId: string, appId: string, index?: number): AppFolder[] {
  return withoutApp(folders, appId).map((folder) => {
    if (folder.id !== folderId) return folder;
    const apps = [...folder.apps];
    apps.splice(index === undefined ? apps.length : Math.max(0, Math.min(apps.length, index)), 0, appId);
    return { ...folder, apps };
  });
}

export function renameFolder(folders: AppFolder[], folderId: string, name: string): AppFolder[] {
  return folders.map((folder) =>
    folder.id === folderId ? { ...folder, name: normalizeFolderName(name, folder.name) } : folder,
  );
}

/** Moves `appId` to `index` inside its own folder. */
export function moveWithinFolder(folders: AppFolder[], folderId: string, appId: string, index: number): AppFolder[] {
  return folders.map((folder) => {
    if (folder.id !== folderId || !folder.apps.includes(appId)) return folder;
    const apps = folder.apps.filter((id) => id !== appId);
    apps.splice(Math.max(0, Math.min(apps.length, index)), 0, appId);
    return { ...folder, apps };
  });
}

export interface RemoveResult {
  folders: AppFolder[];
  /** Set when the folder dissolved because only one app was left in it. */
  collapsed?: { folderId: string; remainingAppId: string };
}

/**
 * Takes `appId` out of its folder. A folder left with a single app dissolves —
 * there is no delete button; emptying a folder is how it goes away.
 */
export function removeFromFolder(folders: AppFolder[], appId: string): RemoveResult {
  const source = folderContaining(folders, appId);
  if (!source) return { folders };
  const remaining = source.apps.filter((id) => id !== appId);
  if (remaining.length >= 2) {
    return { folders: folders.map((folder) => (folder.id === source.id ? { ...folder, apps: remaining } : folder)) };
  }
  return {
    folders: folders.filter((folder) => folder.id !== source.id),
    collapsed: remaining[0] ? { folderId: source.id, remainingAppId: remaining[0] } : undefined,
  };
}
