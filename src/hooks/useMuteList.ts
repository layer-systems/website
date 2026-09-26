import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNip51List, useNip51ListMutation } from './useNip51Lists';
import { useNostrPublish } from './useNostrPublish';
import { itemKey, type Nip51List } from '@/lib/nip51';

/** NIP-51 "Mute list": pubkeys (and other things) the user doesn't want to see. */
export const MUTE_LIST_KIND = 10000;

function extractPubkeys(tags: string[][]): string[] {
  return tags.filter(([name, value]) => name === 'p' && Boolean(value)).map(([, value]) => value);
}

export interface MuteListData {
  publicPubkeys: string[];
  privatePubkeys: string[];
  /** False when the list has encrypted content this signer could not open. */
  privateEntriesReadable: boolean;
}

function toMuteListData(list: Nip51List): MuteListData {
  return {
    publicPubkeys: extractPubkeys(list.publicItems),
    privatePubkeys: extractPubkeys(list.privateItems),
    privateEntriesReadable: list.privateStatus !== 'locked',
  };
}

/**
 * The current user's mute list, with private entries decrypted when possible.
 * Shares its cache with the Lists app, so edits there filter feeds right away.
 */
export function useMuteList() {
  const { user } = useCurrentUser();
  return useNip51List(user?.pubkey, MUTE_LIST_KIND, undefined, toMuteListData);
}

/** Merged public + private muted pubkeys, for filtering feeds and other surfaces. */
export function useMutedPubkeys(): string[] {
  const { data } = useMuteList();
  return useMemo(() => {
    if (!data) return [];
    return [...new Set([...data.publicPubkeys, ...data.privatePubkeys])];
  }, [data]);
}

export function useIsPubkeyMuted(pubkey: string): boolean {
  const muted = useMutedPubkeys();
  return muted.includes(pubkey);
}

/**
 * Adds or removes `pubkey` from the mute list. New mutes prefer the NIP-44
 * encrypted side, so muting someone stays a private choice by default; a
 * signer without NIP-44 support (some NIP-07 extensions) falls back to a
 * public entry rather than failing outright, and the resolved value reports
 * that so the caller can warn the user.
 *
 * The shared list mutation re-fetches the list right before writing and
 * refuses to overwrite private entries it couldn't decrypt.
 */
export function useSetPubkeyMuted() {
  const { user } = useCurrentUser();
  const mutation = useNip51ListMutation();

  return useMutation({
    mutationFn: async ({ pubkey, muted }: { pubkey: string; muted: boolean }): Promise<{ usedPublicFallback: boolean }> => {
      if (!user) throw new Error('Sign in to manage muted accounts');
      const usePrivate = Boolean(user.signer.nip44);
      await mutation.mutateAsync({
        kind: MUTE_LIST_KIND,
        ops: muted
          ? [{ type: 'add', tag: ['p', pubkey], private: usePrivate }]
          : [{ type: 'remove', key: itemKey(['p', pubkey]) }],
      });
      return { usedPublicFallback: muted && !usePrivate };
    },
  });
}

/**
 * Mutes `pubkey` (if not already) and, if the current user follows them,
 * removes them from the kind 3 follow list too — the extra step that
 * distinguishes "block" from a plain mute.
 */
export function useBlockPubkey() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();
  const setMuted = useSetPubkeyMuted();

  return useMutation({
    mutationFn: async (pubkey: string) => {
      if (!user) throw new Error('Sign in to block accounts');

      await setMuted.mutateAsync({ pubkey, muted: true });

      const [followEvent] = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(6000) },
      );
      const followTags = followEvent?.tags ?? [];
      const isFollowing = followTags.some(([name, value]) => name === 'p' && value === pubkey);

      if (isFollowing) {
        await publish.mutateAsync({
          kind: 3,
          content: followEvent?.content ?? '',
          tags: followTags.filter(([name, value]) => !(name === 'p' && value === pubkey)),
        });
        await queryClient.invalidateQueries({ queryKey: ['nostr', 'follows'] });
      }
    },
  });
}
