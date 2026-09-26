import type { NostrEvent } from '@nostrify/nostrify';
import { replyReference, rootReference } from './nostrUtils';

/** Where clicking a notification should take the reader in the Notes app. */
export interface NotificationTarget {
  /** The note to open. */
  id: string;
  /** A note inside that thread to scroll to and highlight. */
  highlight?: string;
}

/** The note a reply notification is answering, per NIP-10. */
export function notificationParentId(notification: { event: NostrEvent; kind: string }): string | undefined {
  return notification.kind === 'reply' ? replyReference(notification.event) : undefined;
}

/**
 * Resolves the note a notification opens. Replies open their parent with the
 * reply highlighted underneath it, so the reader sees what is being answered.
 * `parents` is the set of parent notes fetched so far: while it is still
 * `undefined` (loading) the parent is assumed to exist; once it has settled,
 * a parent missing from it falls back to opening the reply itself. Mentions
 * open the event itself, and reactions, reposts and zaps open the note they
 * point at. `undefined` means there is no note to open (e.g. a profile zap).
 */
export function notificationTarget(
  notification: { event: NostrEvent; kind: string },
  parents?: ReadonlyMap<string, NostrEvent>,
): NotificationTarget | undefined {
  const { event } = notification;
  if (notification.kind === 'mention') return { id: event.id };

  if (notification.kind === 'reply') {
    const parentId = notificationParentId(notification);
    if (parentId && (!parents || parents.has(parentId))) {
      return { id: parentId, highlight: event.id };
    }
    return { id: event.id };
  }

  const root = rootReference(event);
  return root ? { id: root } : undefined;
}
