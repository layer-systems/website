import { useMutation } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { buildPublishTemplate, publicationFromEvent } from '@/lib/documents/publish';
import type { DocumentAttachment, DocumentMeta, PublicationRecord } from '@/lib/documents/types';

export interface PublishInput {
  meta: DocumentMeta;
  markdown: string;
  summary: string;
  attachments: DocumentAttachment[];
}

export interface PublishResult {
  event: NostrEvent;
  publication: PublicationRecord;
}

/**
 * Publishes the owner-approved Markdown snapshot as a NIP-23 kind 30023
 * event. The mutation stays idle until the owner explicitly confirms, so a
 * published snapshot can never silently replace live collaborative work.
 */
export function useDocumentPublish() {
  const { mutateAsync } = useNostrPublish();

  return useMutation<PublishResult, Error, PublishInput>({
    mutationFn: async ({ meta, markdown, summary, attachments }) => {
      const template = buildPublishTemplate(meta, markdown, summary, attachments);
      const event = await mutateAsync(template);
      return { event, publication: publicationFromEvent(event, meta.title) };
    },
  });
}
