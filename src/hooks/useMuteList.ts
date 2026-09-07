import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { NUser } from '@nostrify/react/login';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

/** NIP-51 "Mute list": pubkeys (and other things) the user doesn't want to see. */
export const MUTE_LIST_KIND = 10000;

function muteListQueryKey(pubkey: string | undefined) {
  return ['nostr', 'mute-list', pubkey ?? ''] as const;
}

async function fetchMuteList(
  nostr: ReturnType<typeof useNostr>['nostr'],
  pubkey: string,
  signal?: AbortSignal,
): Promise<NostrEvent | null> {
  const [event] = await nostr.query(
    [{ kinds: [MUTE_LIST_KIND], authors: [pubkey], limit: 1 }],
    { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)].filter((s): s is AbortSignal => Boolean(s))) },
  );
  return event ?? null;
}

function extractPubkeys(tags: string[][]): string[] {
  return tags.filter(([name, value]) => name === 'p' && Boolean(value)).map(([, value]) => value);
}

/**
 * Decrypts the list's NIP-44 private entries. `ok: false` (rather than an
 * empty result) marks a real decryption failure — ciphertext exists but the
 * current signer couldn't open it — so callers that are about to rewrite the
 * list can refuse instead of silently publishing over private entries they
 * failed to read back.
 */
async function decryptPrivateTags(
  signer: NUser['signer'],
  pubkey: string,
  content: string,
): Promise<{ tags: string[][]; ok: boolean }> {
  if (!content) return { tags: [], ok: true };
  if (!signer.nip44) return { tags: [], ok: false };
  try {
    const plaintext = await signer.nip44.decrypt(pubkey, content);
    const parsed = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) return { tags: [], ok: false };
    return { tags: parsed.filter((tag): tag is string[] => Array.isArray(tag)), ok: true };
  } catch {
    return { tags: [], ok: false };
  }
}

export interface MuteListData {
  event: NostrEvent | null;
  publicPubkeys: string[];
  privatePubkeys: string[];
  /** False when the list has encrypted content this signer could not open. */
  privateEntriesReadable: boolean;
}

/** The current user's mute list, with private entries decrypted when possible. */
export function useMuteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<MuteListData>({
    queryKey: muteListQueryKey(user?.pubkey),
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const event = await fetchMuteList(nostr, user!.pubkey, signal);
      if (!event) return { event: null, publicPubkeys: [], privatePubkeys: [], privateEntriesReadable: true };
      const { tags: privateTags, ok } = await decryptPrivateTags(user!.signer, user!.pubkey, event.content);
      return {
        event,
        publicPubkeys: extractPubkeys(event.tags),
        privatePubkeys: extractPubkeys(privateTags),
        privateEntriesReadable: ok,
      };
    },
    staleTime: 60_000,
  });
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
 * Fetches the list fresh from relays right before writing — kind 10000 is a
 * whole-list replacement, so publishing against a stale cached copy could
 * silently drop entries added from another tab or device in the meantime.
 */
export function useSetPubkeyMuted() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pubkey,
      muted,
    }: {
      pubkey: string;
      muted: boolean;
    }): Promise<{ forPubkey: string; usedPublicFallback: boolean; publicPubkeys: string[]; privatePubkeys: string[] }> => {
      if (!user) throw new Error('Sign in to manage muted accounts');

      const current = await fetchMuteList(nostr, user.pubkey);
      const publicTags = current?.tags ?? [];
      const { tags: privateTags, ok } = await decryptPrivateTags(user.signer, user.pubkey, current?.content ?? '');
      if (!ok) {
        throw new Error('Your signer could not read the private part of your existing mute list. Try again, or use the signer that created it.');
      }

      let nextPublicTags = publicTags;
      let nextPrivateTags = privateTags;
      let usedPublicFallback = false;

      if (!muted) {
        nextPublicTags = publicTags.filter(([name, value]) => !(name === 'p' && value === pubkey));
        nextPrivateTags = privateTags.filter(([name, value]) => !(name === 'p' && value === pubkey));
      } else {
        const already = extractPubkeys(publicTags).includes(pubkey) || extractPubkeys(privateTags).includes(pubkey);
        if (!already) {
          if (user.signer.nip44) {
            nextPrivateTags = [...privateTags, ['p', pubkey]];
          } else {
            nextPublicTags = [...publicTags, ['p', pubkey]];
            usedPublicFallback = true;
          }
        }
      }

      const content = nextPrivateTags.length > 0 && user.signer.nip44
        ? await user.signer.nip44.encrypt(user.pubkey, JSON.stringify(nextPrivateTags))
        : '';

      await publish.mutateAsync({ kind: MUTE_LIST_KIND, content, tags: nextPublicTags });
      return {
        forPubkey: user.pubkey,
        usedPublicFallback,
        publicPubkeys: extractPubkeys(nextPublicTags),
        privatePubkeys: extractPubkeys(nextPrivateTags),
      };
    },
    // Nostr's own eventual consistency rules out an immediate re-query: right
    // after publishing, a read against the pool's default relay can still
    // return the pre-update list. The mutation already computed the
    // authoritative next state, so write it straight into the cache instead —
    // deliberately not `invalidateQueries` here, since that would trigger a
    // background refetch that can race back with the stale list and silently
    // clobber this correct value. The cache reconciles with relays normally
    // the next time the query goes stale.
    //
    // `forPubkey` (captured by mutationFn at call time, not read from `user`
    // here) keys the write: onSuccess runs with this callback's latest
    // closure, so if the account changed or logged out while the publish was
    // in flight, `user` here could point at the wrong session — writing into
    // that query key would leak mutes into another account or a logged-out
    // view.
    onSuccess: ({ forPubkey, publicPubkeys, privatePubkeys }) => {
      queryClient.setQueryData<MuteListData>(muteListQueryKey(forPubkey), (prev) => ({
        event: prev?.event ?? null,
        publicPubkeys,
        privatePubkeys,
        privateEntriesReadable: true,
      }));
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
