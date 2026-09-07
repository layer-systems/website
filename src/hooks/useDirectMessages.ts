import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nip05 } from 'nostr-tools';
import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';
import {
  buildGiftWraps,
  decryptLegacyDm,
  dmCapability,
  dmPeer,
  unwrapGiftWrap,
  DM_GIFT_WRAP_KIND,
  DM_INBOX_RELAYS_KIND,
  LEGACY_DM_KIND,
  type DmMessage,
  type DmRecipient,
} from '@/lib/dm';
import { useCurrentUser } from './useCurrentUser';
import { useLocalStorage } from './useLocalStorage';
import { useNostrPublish } from './useNostrPublish';

const QUERY_LIMIT = 300;

function dmsQueryKey(pubkey: string | undefined) {
  return ['nostr', 'dms', pubkey ?? ''] as const;
}

export interface DmConversation {
  /** The other party's pubkey. */
  peer: string;
  /** Newest message first. */
  messages: DmMessage[];
  /** Unix timestamp of the newest message, for list ordering. */
  lastAt: number;
}

/**
 * A conversation exists once at least one message decrypts successfully — an
 * event that does not decrypt does not create an entry, so tampered or
 * mistargeted ciphertexts never surface as ghost conversations.
 */
export function groupIntoConversations(messages: DmMessage[]): DmConversation[] {
  const byPeer = new Map<string, DmMessage[]>();
  for (const message of messages) {
    const list = byPeer.get(message.peer) ?? [];
    list.push(message);
    byPeer.set(message.peer, list);
  }
  return [...byPeer.entries()]
    .map(([peer, peerMessages]) => ({
      peer,
      messages: peerMessages.sort((a, b) => b.created_at - a.created_at),
      lastAt: Math.max(...peerMessages.map((m) => m.created_at)),
    }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

/**
 * Fetches gift-wrapped and legacy DMs involving the current user and decrypts
 * them. The pool subscribes to kind 1059, so messages that arrive after the
 * first fetch (relay delay) are added to the result as they come in; relays
 * deduplicate by event id per NIP-01, and the rumor-id dedupe below collapses
 * the rare re-wrap of the same message.
 *
 * Plaintexts are intentionally **not** persisted to localStorage or the query
 * cache's storage — they live in memory only, so a device with the key is
 * required to re-read history.
 */
export function useDmConversations() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<DmConversation[]>({
    queryKey: dmsQueryKey(user?.pubkey),
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const events = await nostr.query(
        [
          { kinds: [DM_GIFT_WRAP_KIND], '#p': [user.pubkey], limit: QUERY_LIMIT },
          { kinds: [LEGACY_DM_KIND], authors: [user.pubkey], limit: QUERY_LIMIT },
          { kinds: [LEGACY_DM_KIND], '#p': [user.pubkey], limit: QUERY_LIMIT },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      const messages = await decryptDmEvents(user, events);
      return groupIntoConversations(messages);
    },
    // Fresh on mount and kept live by the pool's subscription; a short stale
    // time keeps opening the app snappy without hammering relays.
    staleTime: 15_000,
  });
}

/**
 * Decrypts every DM event for the viewer, dropping anything undecryptable or
 * malformed. Rumors re-wrapped under different gift wraps collapse onto one
 * message by rumor id.
 */
async function decryptDmEvents(
  user: { pubkey: string; signer: NostrSigner },
  events: NostrEvent[],
): Promise<DmMessage[]> {
  const messages: DmMessage[] = [];
  const seenRumors = new Set<string>();

  for (const event of events) {
    if (event.kind === DM_GIFT_WRAP_KIND) {
      const rumor = await unwrapGiftWrap(user.signer, event, user.pubkey);
      if (!rumor || seenRumors.has(rumor.id)) continue;
      const peer = dmPeer(rumor, user.pubkey);
      if (!peer) continue;
      seenRumors.add(rumor.id);
      messages.push({
        id: rumor.id,
        pubkey: rumor.pubkey,
        created_at: rumor.created_at,
        content: rumor.content,
        peer,
        protocol: 'nip17',
        mine: rumor.pubkey === user.pubkey,
        eventId: event.id,
      });
    } else if (event.kind === LEGACY_DM_KIND) {
      const peer = dmPeer(event, user.pubkey);
      if (!peer) continue;
      const content = await decryptLegacyDm(user.signer, event, user.pubkey);
      if (content === null) continue;
      messages.push({
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        content,
        peer,
        protocol: 'nip04',
        mine: event.pubkey === user.pubkey,
        eventId: event.id,
      });
    }
  }
  return messages;
}

/** All messages in one conversation, oldest first. */
export function useDmMessages(peer: string | undefined) {
  const conversations = useDmConversations();
  const conversation = peer
    ? conversations.data?.find((entry) => entry.peer === peer)
    : undefined;
  return {
    ...conversations,
    conversation,
    messages: conversation ? [...conversation.messages].reverse() : [],
  };
}

/** What a send attempt is currently doing, for the bubble state. */
export type DmSendStatus = 'pending' | 'failed' | 'sent';

export interface SendDirectMessageInput {
  peer: string;
  content: string;
}

/**
 * The recipient's kind 10050 inbox relays. NIP-17 says to publish only to
 * those; when none are advertised we fall back to the sender's own relays so
 * the sender copy still lands somewhere, and the UI explains that the
 * recipient may not be reachable.
 */
async function fetchInboxRelays(
  nostr: ReturnType<typeof useNostr>['nostr'],
  pubkey: string,
): Promise<string[]> {
  try {
    const [event] = await nostr.query(
      [{ kinds: [DM_INBOX_RELAYS_KIND], authors: [pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(3000) },
    );
    if (!event) return [];
    return event.tags
      .filter(([name, value]) => name === 'relay' && /^wss?:\/\//.test(value ?? ''))
      .map(([, value]) => value)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/** Error thrown when the recipient advertises no inbox relays, so the UI can give recovery guidance. */
export class DmRecipientUnreachableError extends Error {
  constructor(peer: string) {
    super(
      `This user has not announced where they receive private messages (no kind ${DM_INBOX_RELAYS_KIND} inbox relay list). The message was stored on your relays only — they may not see it until their client checks your relays. Ask them which client they use, or send a public note pointing them here.`,
    );
    this.name = 'DmRecipientUnreachableError';
    this.peer = peer;
  }
  peer: string;
}

/**
 * Sends a direct message. NIP-17 is used whenever the signer supports NIP-44;
 * a signer without it falls back to legacy NIP-04 — visibly, never silently:
 * the caller reads `capability` to show the notice and the sent bubble is
 * labelled. If neither is available the mutation throws instead of sending
 * something the user did not agree to.
 */
export function useSendDirectMessage() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const capability = user ? dmCapability(user.signer) : 'none';

  const mutation = useMutation({
    mutationFn: async ({ peer, content }: SendDirectMessageInput) => {
      if (!user) throw new Error('You must be logged in to send messages');
      const trimmed = content.trim();
      if (!trimmed) throw new Error('Cannot send an empty message');

      if (dmCapability(user.signer) === 'nip17') {
        const inboxRelays = await fetchInboxRelays(nostr, peer);
        const { wraps } = await buildGiftWraps(user.signer, peer, trimmed, inboxRelays);
        if (inboxRelays.length > 0) {
          // NIP-17: recipient copy to their inbox relays, sender copy to ours.
          await nostr.event(wraps[0], {
            signal: AbortSignal.timeout(5000),
            relays: inboxRelays,
          });
          await nostr.event(wraps[1], { signal: AbortSignal.timeout(5000) });
        } else {
          // No inbox list: keep both copies on our own relays so the sender
          // at least has a recoverable history, then say so.
          for (const wrap of wraps) {
            await nostr.event(wrap, { signal: AbortSignal.timeout(5000) });
          }
          throw new DmRecipientUnreachableError(peer);
        }
        return { protocol: 'nip17' as const };
      }

      if (user.signer.nip04) {
        const ciphertext = await user.signer.nip04.encrypt(peer, trimmed);
        const event = await user.signer.signEvent({
          kind: LEGACY_DM_KIND,
          content: ciphertext,
          tags: [['p', peer]],
          created_at: Math.floor(Date.now() / 1000),
        });
        await nostr.event(event, { signal: AbortSignal.timeout(5000) });
        return { protocol: 'nip04' as const };
      }

      throw new Error('This signer cannot encrypt messages');
    },
    onSettled: () => {
      // Re-decrypt so the sent message appears from the same pipeline as
      // received ones — the sender copy is another event the pool returns.
      void queryClient.invalidateQueries({ queryKey: dmsQueryKey(user?.pubkey) });
    },
  });

  return { ...mutation, capability };
}

/**
 * Resolves a recipient field to a hex pubkey: hex / npub / nprofile decode
 * locally; a NIP-05 address goes to the network and can fail, which the
 * caller turns into recovery guidance.
 */
export async function resolveRecipient(recipient: DmRecipient): Promise<string | null> {
  if (recipient.type === 'pubkey') return recipient.pubkey;
  if (recipient.type === 'nip05') {
    try {
      const pointer = await nip05.queryProfile(recipient.value);
      return pointer && /^[0-9a-f]{64}$/.test(pointer.pubkey) ? pointer.pubkey : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Hides a conversation from the list. Relays are asked to delete the copies
 * we published (NIP-09 kind 5, best-effort — relays may refuse, and nothing
 * can recall a message the recipient already has). Received gift wraps belong
 * to throwaway keys and cannot be deletion-requested, so the conversation is
 * additionally hidden locally on this device.
 */
export function useHideDmConversation() {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useLocalStorage<string[]>(
    `nostr:dm-hidden:${user?.pubkey ?? 'anonymous'}`,
    [],
  );

  const mutation = useMutation({
    mutationFn: async (conversation: DmConversation) => {
      const deletable = conversation.messages
        .filter((message) => message.mine)
        .map((message) => message.eventId);
      if (deletable.length > 0) {
        await publish.mutateAsync({
          kind: 5,
          content: 'Conversation hidden',
          tags: deletable.map((id) => ['e', id]),
        });
      }
    },
    onSuccess: (_data, conversation) => {
      if (!hidden.includes(conversation.peer)) setHidden([...hidden, conversation.peer]);
      void queryClient.invalidateQueries({ queryKey: dmsQueryKey(user?.pubkey) });
    },
  });

  return { ...mutation, hidden };
}

/** Per-conversation "read up to" timestamps, on this device only. */
export function useDmReadState() {
  const { user } = useCurrentUser();
  const [readAt, setReadAt] = useLocalStorage<Record<string, number>>(
    `nostr:dm-read:${user?.pubkey ?? 'anonymous'}`,
    {},
  );

  return {
    isUnread: (conversation: DmConversation) =>
      conversation.messages.some(
        (message) => !message.mine && message.created_at > (readAt[conversation.peer] ?? 0),
      ),
    markRead: (peer: string, at: number) => setReadAt({ ...readAt, [peer]: at }),
  };
}
