import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { NUser } from '@nostrify/react/login';
import { useCurrentUser } from './useCurrentUser';
import {
  APP_FOLDERS_D_TAG,
  APP_FOLDERS_KIND,
  parseFolders,
  reconcileFolders,
  type AppFolder,
} from '@/lib/appFolders';
import {
  SIGNED_OUT_OWNER,
  getLocalAppFolders,
  setLocalAppFolders,
  subscribeAppFolders,
} from '@/lib/appFolderStore';

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * The folder structure the home screen renders, reconciled against the
 * current app registry. Edits are written locally right away; when signed in
 * they are marked dirty and `AppFoldersSync` publishes them as an encrypted
 * NIP-78 event.
 */
export function useAppFolders(appIds: string[]) {
  const { user } = useCurrentUser();
  const owner = user?.pubkey ?? SIGNED_OUT_OWNER;
  const local = useSyncExternalStore(
    subscribeAppFolders,
    () => getLocalAppFolders(owner),
    () => getLocalAppFolders(owner),
  );
  const idsKey = appIds.join('|');
  const folders = useMemo(
    () => reconcileFolders(local.folders, idsKey ? idsKey.split('|') : []),
    [idsKey, local.folders],
  );
  const signedIn = Boolean(user);

  const setFolders = useCallback((next: AppFolder[]) => {
    // Never behind the last published event: publishing can stamp an event a
    // second ahead, and an edit must not look older than it.
    const updatedAt = Math.max(nowSeconds(), getLocalAppFolders(owner).updatedAt);
    setLocalAppFolders(owner, { folders: next, updatedAt, dirty: signedIn });
  }, [owner, signedIn]);

  return { folders, setFolders };
}

export type RemoteAppFolders =
  /** No folder event on the user's relays yet. */
  | { status: 'none' }
  | { status: 'ok'; folders: AppFolder[]; createdAt: number }
  /** An event exists but this signer couldn't decrypt it (e.g. a different key or signer). */
  | { status: 'locked'; createdAt: number }
  /** An event exists but the signer has no NIP-44 support at all. */
  | { status: 'unsupported'; createdAt: number };

export function appFoldersFilter(pubkey: string): NostrFilter {
  return { kinds: [APP_FOLDERS_KIND], authors: [pubkey], '#d': [APP_FOLDERS_D_TAG], limit: 1 };
}

/** Relays may return stale revisions or ignore the filter; keep the newest genuine one. */
export function newestFolderEvent(events: NostrEvent[], pubkey: string): NostrEvent | undefined {
  return events
    .filter((event) =>
      event.kind === APP_FOLDERS_KIND
      && event.pubkey === pubkey
      && event.tags.some(([name, value]) => name === 'd' && value === APP_FOLDERS_D_TAG))
    .sort((a, b) => b.created_at - a.created_at)[0];
}

export async function decryptFolderEvent(user: NUser, event: NostrEvent): Promise<RemoteAppFolders> {
  if (!user.signer.nip44) return { status: 'unsupported', createdAt: event.created_at };
  try {
    const plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content);
    return { status: 'ok', folders: parseFolders(plaintext), createdAt: event.created_at };
  } catch {
    return { status: 'locked', createdAt: event.created_at };
  }
}

export function remoteAppFoldersKey(pubkey: string | undefined) {
  return ['nostr', 'app-folders', pubkey ?? ''] as const;
}

/**
 * The user's folder event, decrypted. Not refetched on focus: every fetch can
 * mean a decrypt prompt in an extension or a round trip to a remote signer.
 */
export function useRemoteAppFolders() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<RemoteAppFolders>({
    queryKey: remoteAppFoldersKey(user?.pubkey),
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const events = await nostr.query([appFoldersFilter(user!.pubkey)], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      const event = newestFolderEvent(events, user!.pubkey);
      return event ? decryptFolderEvent(user!, event) : { status: 'none' };
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
