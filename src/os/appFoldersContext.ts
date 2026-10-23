import { createContext, useContext } from 'react';

export interface AppFolder { id: string; name: string; appIds: string[] }
export interface FolderState { folders: AppFolder[]; error: string | null }
export interface FolderContextValue extends FolderState {
  /** Puts both apps into a new folder and returns it, or null if that is not possible. */
  groupApps: (targetAppId: string, appId: string) => AppFolder | null;
  renameFolder: (id: string, name: string) => boolean;
  deleteFolder: (id: string) => void;
  moveApp: (appId: string, folderId: string | null) => void;
  clearError: () => void;
}

export const FolderContext = createContext<FolderContextValue | null>(null);

export function useAppFolders() {
  const context = useContext(FolderContext);
  if (!context) throw new Error('AppFoldersProvider is missing');
  return context;
}
