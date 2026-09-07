import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_FOLDERS,
  MAX_FOLDER_NAME,
  addFolder,
  appsInFolder,
  clearFolderState,
  folderNameTaken,
  folderStorageKey,
  loadFolderState,
  normalizeFolderName,
  reconcileFolderState,
  removeFolder,
  renameFolder,
  saveFolderState,
  setAppFolder,
  type FolderState,
} from './folders';

const stateWithFolder = (): { state: FolderState; folderId: string } => {
  const { state, folder } = addFolder(EMPTY_FOLDERS, 'Tools');
  return { state, folderId: folder.id };
};

describe('normalizeFolderName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeFolderName('  My   Folder  ')).toBe('My Folder');
  });

  it('caps the length', () => {
    expect(normalizeFolderName('x'.repeat(100))).toHaveLength(MAX_FOLDER_NAME);
  });
});

describe('folderNameTaken', () => {
  it('matches case-insensitively and ignores the excluded folder', () => {
    const { state, folderId } = stateWithFolder();
    expect(folderNameTaken(state.folders, 'tools')).toBe(true);
    expect(folderNameTaken(state.folders, 'TOOLS')).toBe(true);
    expect(folderNameTaken(state.folders, 'Tools', folderId)).toBe(false);
    expect(folderNameTaken(state.folders, 'Other')).toBe(false);
  });
});

describe('folder operations', () => {
  it('creates folders with unique ids', () => {
    const first = addFolder(EMPTY_FOLDERS, 'One');
    const second = addFolder(first.state, 'Two');
    expect(second.state.folders).toHaveLength(2);
    expect(second.state.folders[0].id).not.toBe(second.state.folders[1].id);
  });

  it('renames a folder without touching the others', () => {
    const { state, folderId } = stateWithFolder();
    const renamed = renameFolder(state, folderId, 'Utilities');
    expect(renamed.folders[0].name).toBe('Utilities');
  });

  it('assigns an app to a folder and lists it', () => {
    const { state, folderId } = stateWithFolder();
    const assigned = setAppFolder(state, 'feed', folderId);
    expect(appsInFolder(assigned, folderId)).toEqual(['feed']);
  });

  it('moves an app between folders', () => {
    const { state, folderId } = stateWithFolder();
    const { state: withTwo, folder: other } = addFolder(state, 'More');
    const assigned = setAppFolder(setAppFolder(withTwo, 'feed', folderId), 'feed', other.id);
    expect(appsInFolder(assigned, folderId)).toEqual([]);
    expect(appsInFolder(assigned, other.id)).toEqual(['feed']);
  });

  it('returns an app to the top level with null', () => {
    const { state, folderId } = stateWithFolder();
    const assigned = setAppFolder(state, 'feed', folderId);
    const cleared = setAppFolder(assigned, 'feed', null);
    expect(cleared.membership).toEqual({});
  });

  it('ignores assignments to unknown folders', () => {
    const { state } = stateWithFolder();
    const assigned = setAppFolder(state, 'feed', 'no-such-folder');
    expect(assigned.membership).toEqual({});
  });

  it('deleting a folder returns its apps to the top level', () => {
    const { state, folderId } = stateWithFolder();
    const assigned = setAppFolder(state, 'feed', folderId);
    const removed = removeFolder(assigned, folderId);
    expect(removed.folders).toEqual([]);
    expect(removed.membership).toEqual({});
  });
});

describe('reconcileFolderState', () => {
  it('drops membership for unknown folders and apps', () => {
    const { state, folderId } = stateWithFolder();
    const dirty: FolderState = {
      folders: state.folders,
      membership: { feed: folderId, ghost: folderId, settings: 'unknown-folder' },
    };
    const clean = reconcileFolderState(dirty, ['feed', 'settings']);
    expect(clean.membership).toEqual({ feed: folderId });
  });

  it('drops duplicate folder ids and empty names', () => {
    const { folderId } = stateWithFolder();
    const dirty: FolderState = {
      folders: [
        { id: folderId, name: 'One' },
        { id: folderId, name: 'Duplicate' },
        { id: 'blank', name: '   ' },
      ],
      membership: { feed: folderId, notes: 'blank' },
    };
    const clean = reconcileFolderState(dirty, ['feed', 'notes']);
    expect(clean.folders).toEqual([{ id: folderId, name: 'One' }]);
    expect(clean.membership).toEqual({ feed: folderId });
  });
});

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('scopes the storage key per user with an anonymous fallback', () => {
    expect(folderStorageKey(null)).toBe('nostr:folders');
    expect(folderStorageKey(undefined)).toBe('nostr:folders');
    expect(folderStorageKey('abc123')).toBe('nostr:folders:abc123');
  });

  it('round-trips a folder state through localStorage', () => {
    const { state, folderId } = stateWithFolder();
    const assigned = setAppFolder(state, 'feed', folderId);
    saveFolderState(assigned, 'user-a');
    expect(loadFolderState('user-a', ['feed'])).toEqual(assigned);
    // A different user must not see it.
    expect(loadFolderState('user-b', ['feed'])).toEqual(EMPTY_FOLDERS);
  });

  it('returns an empty state for corrupt payloads', () => {
    localStorage.setItem(folderStorageKey(null), '{not json');
    expect(loadFolderState(null, ['feed'])).toEqual(EMPTY_FOLDERS);
    localStorage.setItem(folderStorageKey(null), JSON.stringify({ version: 99, folders: [] }));
    expect(loadFolderState(null, ['feed'])).toEqual(EMPTY_FOLDERS);
  });

  it('clears only the requested user key', () => {
    const { state } = stateWithFolder();
    saveFolderState(state, 'user-a');
    saveFolderState(state, null);
    clearFolderState('user-a');
    expect(loadFolderState('user-a', [])).toEqual(EMPTY_FOLDERS);
    expect(loadFolderState(null, [])).toEqual(state);
  });
});
