import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  appFoldersFilter,
  decryptFolderEvent,
  newestFolderEvent,
  nowSeconds,
  remoteAppFoldersKey,
  useRemoteAppFolders,
  type RemoteAppFolders,
} from '@/hooks/useAppFolders';
import { APP_FOLDERS_ALT, APP_FOLDERS_D_TAG, APP_FOLDERS_KIND, serializeFolders } from '@/lib/appFolders';
import {
  SIGNED_OUT_OWNER,
  getLocalAppFolders,
  setLocalAppFolders,
  subscribeAppFolders,
} from '@/lib/appFolderStore';

const PUBLISH_DELAY = 1500;

const WARNINGS = {
  locked: {
    title: 'Folders couldn’t be decrypted',
    description: 'Your folders were saved with a key this signer can’t read. Changes you make stay on this device.',
  },
  unsupported: {
    title: 'Folders can’t be synced',
    description: 'Your signer doesn’t support NIP-44 encryption, so folders are saved on this device only.',
  },
} as const;

/** These would otherwise repeat on every edit, so each shows once per account and session. */
const warned = new Set<string>();

/**
 * Keeps the device-local folder structure and the user's encrypted NIP-78
 * event in step. Renders nothing; mounted once by the OS shell.
 *
 * - A decrypted remote event replaces the local copy unless the local copy has
 *   unpublished edits at least as new (last writer wins, by timestamp).
 * - Local edits are published after a short pause, so a burst of drags costs
 *   one signature. Right before writing, the latest event is re-read so an
 *   edit saved from another device in the meantime is adopted, not clobbered.
 * - Nothing is ever published in plaintext, and an event this signer cannot
 *   decrypt is never overwritten — both cases keep the folders on this device
 *   and tell the user why.
 */
export function AppFoldersSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const remote = useRemoteAppFolders();
  const owner = user?.pubkey ?? SIGNED_OUT_OWNER;
  const local = useSyncExternalStore(subscribeAppFolders, () => getLocalAppFolders(owner), () => getLocalAppFolders(owner));
  const publishing = useRef(false);

  const warn = useCallback((pubkey: string, kind: keyof typeof WARNINGS) => {
    if (warned.has(`${pubkey}:${kind}`)) return;
    warned.add(`${pubkey}:${kind}`);
    toast({ variant: 'destructive', ...WARNINGS[kind] });
  }, [toast]);

  // Remote → local.
  useEffect(() => {
    if (!user || !remote.data) return;
    const data = remote.data;
    if (data.status === 'locked' || data.status === 'unsupported') {
      warn(user.pubkey, data.status);
      return;
    }
    if (data.status !== 'ok') return;
    const current = getLocalAppFolders(user.pubkey);
    if (current.dirty && current.updatedAt >= data.createdAt) return;
    if (!current.dirty && current.updatedAt === data.createdAt) return;
    setLocalAppFolders(user.pubkey, { folders: data.folders, updatedAt: data.createdAt, dirty: false });
  }, [remote.data, user, warn]);

  // Local → remote.
  const remoteSettled = !remote.isPending;
  const remoteLocked = remote.data?.status === 'locked';
  useEffect(() => {
    if (!user || !local.dirty || !remoteSettled || remoteLocked) return;
    const nip44 = user.signer.nip44;
    if (!nip44) {
      warn(user.pubkey, 'unsupported');
      return;
    }

    const timer = setTimeout(async () => {
      // A change made mid-publish re-runs this effect; the finishing publish
      // then re-queues it (see below), so skipping here loses nothing.
      if (publishing.current) return;
      const snapshot = getLocalAppFolders(user.pubkey);
      if (!snapshot.dirty) return;
      const pubkey = user.pubkey;
      publishing.current = true;
      try {
        // Re-read right before writing: another device may have saved since.
        const events = await nostr.query([appFoldersFilter(pubkey)], { signal: AbortSignal.timeout(6000) });
        const latest = newestFolderEvent(events, pubkey);
        if (latest) {
          const decrypted = await decryptFolderEvent(user, latest);
          if (latest.created_at > snapshot.updatedAt || decrypted.status !== 'ok') {
            // Newer elsewhere (adopted by the effect above), or unreadable
            // (which must not be overwritten): either way, don't publish.
            queryClient.setQueryData<RemoteAppFolders>(remoteAppFoldersKey(pubkey), decrypted);
            return;
          }
        }

        const content = await nip44.encrypt(pubkey, serializeFolders(snapshot.folders));
        const event = await user.signer.signEvent({
          kind: APP_FOLDERS_KIND,
          content,
          // Only what addressing needs; everything else is inside `content`.
          tags: [['d', APP_FOLDERS_D_TAG], ['alt', APP_FOLDERS_ALT]],
          created_at: Math.max(nowSeconds(), (latest?.created_at ?? 0) + 1),
        });
        await nostr.event(event, { signal: AbortSignal.timeout(6000) });

        const current = getLocalAppFolders(pubkey);
        // Still dirty if the user kept editing while this was in flight; the
        // timestamp moves up so our own event doesn't count as "newer elsewhere".
        setLocalAppFolders(pubkey, {
          ...current,
          updatedAt: Math.max(current.updatedAt, event.created_at),
          dirty: current !== snapshot,
        });
        queryClient.setQueryData<RemoteAppFolders>(remoteAppFoldersKey(pubkey), {
          status: 'ok',
          folders: snapshot.folders,
          createdAt: event.created_at,
        });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Folders weren’t saved to your relays',
          description: `${error instanceof Error ? error.message : 'Unknown error'}. They’re kept on this device and saved again with your next change.`,
        });
      } finally {
        publishing.current = false;
      }
    }, PUBLISH_DELAY);
    return () => clearTimeout(timer);
  }, [local, nostr, queryClient, remoteLocked, remoteSettled, toast, user, warn]);

  return null;
}
