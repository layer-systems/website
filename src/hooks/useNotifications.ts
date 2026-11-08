import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { isReply } from '@/lib/nostrUtils';
import { notificationParentId } from '@/lib/notifications';
import { validateZapReceipt, ZAP_RECEIPT_KIND } from '@/lib/zapReceipts';
import { useCurrentUser } from './useCurrentUser';
import { useLocalStorage } from './useLocalStorage';
import { fetchZapperPubkey } from './useZapperPubkey';

/**
 * Nostr event kinds that commonly represent activity directed at a person.
 *
 * Kind 3 is deliberately excluded: a contact list is a replaceable whole-list
 * snapshot, so any later edit that keeps the recipient's `p` tag would resurface
 * as a false "followed you" notification. Relays usually only retain the latest
 * version of a replaceable event, so there is no reliable per-author delta to
 * tell a genuine new follow apart from an unrelated list edit.
 */
const NOTIFICATION_KINDS = [1, 6, 7, 16, 9735] as const;

export type NotificationKind = 'mention' | 'reply' | 'reaction' | 'repost' | 'zap';

export interface Notification {
  event: NostrEvent;
  kind: NotificationKind;
  /**
   * Who performed the action. For most kinds that's the event author, but a
   * zap receipt is signed by the recipient's LNURL server, so for zaps it's
   * the signer of the embedded (signature-verified) zap request instead.
   * Display and mute filtering must use this, never `event.pubkey`.
   */
  actor: string;
  /** Present only on zap notifications, from the validated receipt. */
  zap?: { amountSats: number; comment: string };
}

function notificationKind(event: NostrEvent): NotificationKind {
  switch (event.kind) {
    case 7:
      return 'reaction';
    case 6:
    case 16:
      return 'repost';
    case 9735:
      return 'zap';
    case 1:
      return isReply(event) ? 'reply' : 'mention';
    default:
      return 'mention';
  }
}

/**
 * Fetches activity that explicitly tags the current user. Relays index the
 * single-letter `p` tag, so this stays a narrow query instead of downloading a
 * general timeline and filtering it in the browser.
 */
export function useNotifications() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useQuery<Notification[]>({
    queryKey: ['nostr', 'notifications', user?.pubkey ?? ''],
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      if (!user) return [];
      // The user's own LNURL server key is resolved alongside the query: only
      // receipts it signed can be real zaps to them (NIP-57 Appendix F).
      const [events, zapperPubkey] = await Promise.all([
        nostr.query(
          [{ kinds: [...NOTIFICATION_KINDS], '#p': [user.pubkey], limit: 100 }],
          {
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(6000),
            ]),
          },
        ),
        fetchZapperPubkey(nostr, queryClient, user.pubkey),
      ]);

      const seen = new Set<string>();
      const notifications = await Promise.all(events.map(async (event): Promise<Notification | null> => {
        // Kind 3 is no longer queried, but guard anyway: a stale cache entry
        // or a misbehaving relay must not classify a contact-list snapshot
        // as a notification.
        if (event.kind === 3 || seen.has(event.id)) return null;
        seen.add(event.id);

        if (event.kind === ZAP_RECEIPT_KIND) {
          if (!zapperPubkey) return null;
          const zap = await validateZapReceipt(event, { zapperPubkey, recipientPubkey: user.pubkey }).catch(() => null);
          if (!zap) return null;
          return { event, kind: 'zap', actor: zap.sender, zap: { amountSats: zap.amountSats, comment: zap.comment } };
        }

        return { event, kind: notificationKind(event), actor: event.pubkey };
      }));

      return notifications
        .filter((notification): notification is Notification => Boolean(notification) && notification!.actor !== user.pubkey)
        .sort((left, right) => right.event.created_at - left.event.created_at);
    },
    staleTime: 30_000,
  });
}

/** Persists the most recent timestamp the account has explicitly acknowledged. */
export function useNotificationReadState() {
  const { user } = useCurrentUser();
  const [lastReadAt, setLastReadAt] = useLocalStorage<number>(
    `nostr:notifications:last-read:${user?.pubkey ?? 'anonymous'}`,
    0,
  );

  return {
    lastReadAt,
    markAllRead: () => setLastReadAt(Math.floor(Date.now() / 1000)),
  };
}

/**
 * Fetches the notes that reply notifications are answering, in one batched
 * `ids` query rather than one request per row. Resolves to a map keyed by id;
 * parents no relay returned are simply absent from it.
 */
export function useNotificationParents(notifications: Notification[]) {
  const { nostr } = useNostr();
  const ids = [...new Set(notifications.map(notificationParentId).filter((id): id is string => Boolean(id)))].sort();

  return useQuery<Map<string, NostrEvent>>({
    queryKey: ['nostr', 'notification-parents', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ ids, limit: ids.length }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      const wanted = new Set(ids);
      // Only keep events we actually asked for, so a misbehaving relay can't
      // attach unrelated content to a notification.
      return new Map(events.filter((event) => wanted.has(event.id)).map((event) => [event.id, event]));
    },
    staleTime: 5 * 60 * 1000,
  });
}
