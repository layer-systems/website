import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { isReply } from '@/lib/nostrUtils';
import { useCurrentUser } from './useCurrentUser';
import { useLocalStorage } from './useLocalStorage';

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

  return useQuery<Notification[]>({
    queryKey: ['nostr', 'notifications', user?.pubkey ?? ''],
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const events = await nostr.query(
        [{ kinds: [...NOTIFICATION_KINDS], '#p': [user.pubkey], limit: 100 }],
        {
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(6000),
          ]),
        },
      );

      const seen = new Set<string>();
      return events
        .filter((event) => {
          // Kind 3 is no longer queried, but guard anyway: a stale cache entry
          // or a misbehaving relay must not classify a contact-list snapshot
          // as a notification.
          if (event.kind === 3) return false;
          if (event.pubkey === user.pubkey || seen.has(event.id)) return false;
          seen.add(event.id);
          return true;
        })
        .sort((left, right) => right.created_at - left.created_at)
        .map((event) => ({ event, kind: notificationKind(event) }));
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
