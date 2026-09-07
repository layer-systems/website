import { useMutation } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from './useNostrPublish';

/** NIP-56 "Reporting": a signed event flagging an account or note as objectionable. */
export const REPORT_KIND = 1984;

export const REPORT_TYPES = ['nudity', 'malware', 'profanity', 'illegal', 'spam', 'impersonation', 'other'] as const;
export type ReportType = typeof REPORT_TYPES[number];

export interface ReportInput {
  pubkey: string;
  /** When set, reports this note rather than just the account. */
  event?: NostrEvent;
  type: ReportType;
  /** Freeform context the reporter chose to add. Never auto-filled. */
  comment?: string;
}

/**
 * Publishes a NIP-56 report event. Only what the reporter explicitly typed
 * goes in `content` — nothing else is attached, per NIP-56's guidance that
 * `content` MAY carry additional information but never must.
 */
export function useReport() {
  const publish = useNostrPublish();

  return useMutation({
    mutationFn: async ({ pubkey, event, type, comment }: ReportInput) => {
      // Reporting a note: the `e` tag carries the report type (it's the thing
      // being reported), and the `p` tag just identifies its author.
      const tags: string[][] = event ? [['e', event.id, type], ['p', pubkey]] : [['p', pubkey, type]];

      return publish.mutateAsync({ kind: REPORT_KIND, content: comment ?? '', tags });
    },
  });
}
