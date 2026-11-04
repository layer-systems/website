import { z } from 'zod';
import { FoldersSchema, type AppFolder } from '@/lib/appFolders';

/**
 * The device-local copy of the app folder structure, one per account (plus one
 * for signed-out use). It is the source the UI renders from: edits land here
 * first and `AppFoldersSync` publishes them to Nostr afterwards, so folders
 * stay instant to use and keep working offline or with a slow signer.
 */
export interface LocalAppFolders {
  folders: AppFolder[];
  /** Unix seconds of the last local edit, or of the Nostr event it came from. */
  updatedAt: number;
  /** True while there are local edits not yet published to Nostr. */
  dirty: boolean;
}

const STORAGE_PREFIX = 'nostr:app-folders:';
const VERSION = 1;
export const SIGNED_OUT_OWNER = 'signed-out';

const StoredSchema = z.object({
  version: z.literal(VERSION),
  folders: FoldersSchema,
  updatedAt: z.number().int().min(0),
  dirty: z.boolean(),
});

const EMPTY: LocalAppFolders = { folders: [], updatedAt: 0, dirty: false };

const cache = new Map<string, LocalAppFolders>();
const listeners = new Set<() => void>();

function storageKey(owner: string): string {
  return `${STORAGE_PREFIX}${owner}`;
}

function read(owner: string): LocalAppFolders {
  try {
    const raw = localStorage.getItem(storageKey(owner));
    if (!raw) return EMPTY;
    const { folders, updatedAt, dirty } = StoredSchema.parse(JSON.parse(raw));
    return { folders, updatedAt, dirty };
  } catch {
    // A corrupt entry must never keep the home screen from rendering.
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

let listeningToStorage = false;
function listenToOtherTabs() {
  if (listeningToStorage || typeof window === 'undefined') return;
  listeningToStorage = true;
  window.addEventListener('storage', (event) => {
    if (!event.key?.startsWith(STORAGE_PREFIX)) return;
    cache.delete(event.key.slice(STORAGE_PREFIX.length));
    emit();
  });
}

export function subscribeAppFolders(listener: () => void): () => void {
  listenToOtherTabs();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Referentially stable between writes, as `useSyncExternalStore` requires. */
export function getLocalAppFolders(owner: string): LocalAppFolders {
  let value = cache.get(owner);
  if (!value) {
    value = read(owner);
    cache.set(owner, value);
  }
  return value;
}

export function setLocalAppFolders(owner: string, value: LocalAppFolders): void {
  cache.set(owner, value);
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify({ version: VERSION, ...value }));
  } catch {
    // Private mode or a full quota: the in-memory copy still works this session.
  }
  emit();
}
