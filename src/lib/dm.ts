import { generateSecretKey, getEventHash, nip19 } from 'nostr-tools';
import { NSecSigner, type NostrEvent, type NostrSigner } from '@nostrify/nostrify';

/**
 * Direct messages follow NIP-17: the plaintext lives in an unsigned kind 14
 * "chat message", which is NIP-44-encrypted into a kind 13 seal signed by the
 * sender, which in turn is encrypted to the recipient and wrapped in a kind
 * 1059 gift wrap signed by a throwaway key. Relays only ever see the gift
 * wrap, so sender identity and conversation membership stay off the wire.
 *
 * NIP-04 (kind 4) is the deprecated predecessor: weaker crypto, and sender +
 * recipient are public in the event tags. It is kept for reading old messages
 * and as an explicitly-labelled send fallback for signers without NIP-44 —
 * never silently, see `useSendDirectMessage`.
 */

export const DM_CHAT_KIND = 14;
export const DM_SEAL_KIND = 13;
export const DM_GIFT_WRAP_KIND = 1059;
export const DM_INBOX_RELAYS_KIND = 10050;
export const LEGACY_DM_KIND = 4;

const HEX_64_RE = /^[0-9a-f]{64}$/i;
const NIP05_RE = /^(?:[a-z0-9._-]+)@(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

/** NIP-59 timestamps are randomized up to two days into the past. */
const TWO_DAYS_S = 2 * 24 * 60 * 60;

function randomizeTimestamp(now = Date.now()): number {
  return Math.floor(now / 1000 - Math.random() * TWO_DAYS_S);
}

/** The encryption a signer can offer for direct messages. */
export type DmCapability = 'nip17' | 'nip04' | 'none';

/**
 * NIP-44 is required for gift-wrapped messages; without any encryption method
 * (a barebones extension or remote signer) DMs are impossible. Capability is
 * probed once per session in the hook and never silently downgraded.
 */
export function dmCapability(signer: NostrSigner | undefined): DmCapability {
  if (signer?.nip44) return 'nip17';
  if (signer?.nip04) return 'nip04';
  return 'none';
}

/** Why a signer cannot use NIP-17, for the notice in the Messages window. */
export function dmCapabilityHint(capability: DmCapability): string {
  switch (capability) {
    case 'nip17':
      return '';
    case 'nip04':
      return 'Your signer cannot do modern NIP-17 encryption, so sending uses legacy NIP-04: it reveals who messaged whom and when. Use a signer with NIP-44 support (e.g. Alby or a native key) to keep that metadata private.';
    case 'none':
      return 'Your signer cannot encrypt messages at all, so sending is unavailable. Use a signer with NIP-44 support to send direct messages.';
  }
}

export type DmRecipient =
  | { type: 'pubkey'; pubkey: string; relays?: string[] }
  | { type: 'nip05'; value: string }
  | { type: 'invalid'; value: string };

/** Accepts hex, npub, nprofile or a NIP-05 address — everything else is rejected. */
export function parseRecipient(input: string): DmRecipient {
  const value = input.trim();
  if (!value) return { type: 'invalid', value };

  if (HEX_64_RE.test(value)) return { type: 'pubkey', pubkey: value.toLowerCase() };

  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return { type: 'pubkey', pubkey: decoded.data };
    if (decoded.type === 'nprofile') {
      return { type: 'pubkey', pubkey: decoded.data.pubkey, relays: decoded.data.relays };
    }
    // note/nevent/naddr point at events, not people; nsec is a secret that
    // must never be typed into a recipient field.
    return { type: 'invalid', value };
  } catch {
    // Not bech32 — maybe a NIP-05 address.
  }

  if (NIP05_RE.test(value)) return { type: 'nip05', value: value.toLowerCase() };
  return { type: 'invalid', value };
}

/** A NIP-17 chat message is only renderable with content and a recipient tag. */
export function isValidChatMessage(event: NostrEvent): boolean {
  return event.kind === DM_CHAT_KIND && event.content.trim().length > 0 && hasRecipientTag(event);
}

function hasRecipientTag(event: NostrEvent): boolean {
  return event.tags.some(([name, value]) => name === 'p' && HEX_64_RE.test(value ?? ''));
}

/** The other party of a chat message, from the perspective of `viewer`. */
export function dmPeer(event: NostrEvent, viewer: string): string | undefined {
  if (event.pubkey === viewer) {
    const recipients = event.tags
      .filter(([name, value]) => name === 'p' && HEX_64_RE.test(value ?? ''))
      .map(([, value]) => value.toLowerCase());
    // A self-DM (own pubkey as the only p tag) has no "other party" — and no
    // one to reach anyway — so it is not a conversation.
    return recipients.find((pubkey) => pubkey !== viewer);
  }
  return event.pubkey;
}

export interface GiftWrapResult {
  /** Kind 1059 events: one per receiver, the sender's own copy last. */
  wraps: NostrEvent[];
  /** Id of the kind 14 rumor inside — the message's stable identity. */
  rumorId: string;
}

/**
 * Seals and gift-wraps a kind 14 chat message, then wraps one copy for the
 * recipient and one for the sender (NIP-17 requires both: the sender copy is
 * what makes history recoverable on another device). Each wrap is signed by a
 * fresh throwaway key, so relays cannot link sender and receiver copies.
 *
 * `receiverRelays` (the recipient's kind 10050 inbox relays, when known) is
 * attached as relay hints on the rumor's `p` tag.
 */
export async function buildGiftWraps(
  senderSigner: NostrSigner,
  recipientPubkey: string,
  plaintext: string,
  receiverRelays: string[] = [],
): Promise<GiftWrapResult> {
  if (!senderSigner.nip44) {
    throw new Error('Signer has no NIP-44 encryption');
  }
  const senderPubkey = await senderSigner.getPublicKey();

  const rumor: NostrEvent = {
    kind: DM_CHAT_KIND,
    pubkey: senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey, ...receiverRelays.slice(0, 1)]],
    content: plaintext,
    id: '',
    sig: '',
  };

  const wrapFor = async (receiverPubkey: string): Promise<NostrEvent> => {
    const seal = await senderSigner.signEvent({
      kind: DM_SEAL_KIND,
      content: await senderSigner.nip44!.encrypt(receiverPubkey, JSON.stringify(rumor)),
      tags: [],
      created_at: randomizeTimestamp(),
    });

    // A one-time key signs the wrap, so relays cannot tell who sent it.
    const wrapSigner = new NSecSigner(generateSecretKey());
    return wrapSigner.signEvent({
      kind: DM_GIFT_WRAP_KIND,
      content: await wrapSigner.nip44.encrypt(receiverPubkey, JSON.stringify(seal)),
      tags: [['p', receiverPubkey]],
      created_at: randomizeTimestamp(),
    });
  };

  const wraps = [await wrapFor(recipientPubkey), await wrapFor(senderPubkey)];
  return { wraps, rumorId: rumorId(rumor) };
}

/**
 * A rumor is unsigned; its id is recomputed as the sha256 of the serialized
 * event per NIP-01, so both sender and recipient refer to the same message.
 */
function rumorId(rumor: NostrEvent): string {
  return getEventHash({
    pubkey: rumor.pubkey,
    created_at: rumor.created_at,
    kind: rumor.kind,
    tags: rumor.tags,
    content: rumor.content,
  });
}

/** A decrypted conversation message, provenance included. */
export interface DmMessage {
  id: string;
  /** Author of the (rumor/legacy) event. */
  pubkey: string;
  created_at: number;
  content: string;
  /** The other party's pubkey, from the viewer's perspective. */
  peer: string;
  /** Encryption the message arrived with. */
  protocol: 'nip17' | 'nip04';
  /** True for our own outgoing messages. */
  mine: boolean;
  /** Id of the enclosing gift wrap / kind 4 event, for deletion requests. */
  eventId: string;
}

/** Unwraps a kind 1059 gift wrap into its kind 14 rumor, or null when malformed. */
export async function unwrapGiftWrap(
  signer: NostrSigner,
  wrap: NostrEvent,
  viewer: string,
): Promise<NostrEvent | null> {
  if (!signer.nip44) return null;
  try {
    const sealJson = await signer.nip44.decrypt(wrap.pubkey, wrap.content);
    const seal = JSON.parse(sealJson) as NostrEvent;
    if (seal.kind !== DM_SEAL_KIND || typeof seal.content !== 'string') return null;

    const rumorJson = await signer.nip44.decrypt(seal.pubkey, seal.content);
    const rumor = JSON.parse(rumorJson) as NostrEvent;
    if (rumor.kind !== DM_CHAT_KIND) return null;
    // NIP-17: the rumor's pubkey must match the seal's, otherwise anyone
    // could impersonate anyone by rewriting the unsigned rumor.
    if (rumor.pubkey !== seal.pubkey) return null;
    if (!isValidChatMessage(rumor)) return null;
    // The rumor's room (author + p tags) must contain the viewer — otherwise
    // a wrap addressed to us would render a conversation between third
    // parties as if it were ours.
    if (!isRoomMember(rumor, viewer)) return null;
    rumor.id = rumorId(rumor);
    return rumor;
  } catch {
    return null;
  }
}

function isRoomMember(rumor: NostrEvent, pubkey: string): boolean {
  if (rumor.pubkey === pubkey) return true;
  return rumor.tags.some(([name, value]) => name === 'p' && value?.toLowerCase() === pubkey);
}

/** Decrypts a legacy NIP-04 message; `peer` is the other party's pubkey. */
export async function decryptLegacyDm(
  signer: NostrSigner,
  event: NostrEvent,
  viewer: string,
): Promise<string | null> {
  if (!signer.nip04) return null;
  const peer = dmPeer(event, viewer);
  if (!peer) return null;
  try {
    return await signer.nip04.decrypt(peer, event.content);
  } catch {
    return null;
  }
}

export { HEX_64_RE as DM_PUBKEY_RE };
