import type { NostrEvent } from '@nostrify/nostrify';
import { tagValue } from '@/lib/nostrUtils';
import type { DocumentAttachment, DocumentMeta, PublicationRecord } from './types';
import { attachmentToImetaTags } from './attachments';

export const ARTICLE_KIND = 30023;

const IDENTIFIER_PATTERN = /^[a-z0-9-]+$/;

/**
 * The NIP-23 `d` identifier is part of the article's permanent address, so it
 * must be a plain slug: lowercase, URL-safe, and — per NIP-01 — free of the
 * characters that would break address parsing.
 */
export function documentIdentifier(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const base = IDENTIFIER_PATTERN.test(slug) && slug.length > 0 ? slug : 'document';
  return `${base}-${id.slice(0, 8)}`;
}

export interface PublishTemplate {
  kind: number;
  content: string;
  tags: string[][];
}

/**
 * Build the kind 30023 snapshot event template. The snapshot is a portable,
 * owner-approved release: it carries the Markdown body, title, summary and
 * NIP-94 attachment metadata, and never replaces the live document.
 */
export function buildPublishTemplate(
  meta: DocumentMeta,
  markdown: string,
  summary: string,
  attachments: DocumentAttachment[],
): PublishTemplate {
  const identifier = meta.publication?.identifier ?? documentIdentifier(meta.title, meta.id);
  const tags: string[][] = [
    ['d', identifier],
    ['title', meta.title],
    ['published_at', String(Math.floor(Date.now() / 1000))],
  ];
  if (summary) tags.push(['summary', summary]);
  for (const attachment of attachments) {
    tags.push(...attachmentToImetaTags(attachment));
  }
  return { kind: ARTICLE_KIND, content: markdown, tags };
}

/** Extract the publication record from the signed, relay-acknowledged event. */
export function publicationFromEvent(event: NostrEvent, title: string): PublicationRecord {
  const identifier = tagValue(event, 'd') ?? '';
  return {
    eventId: event.id,
    identifier,
    address: `${event.kind}:${event.pubkey}:${identifier}`,
    publishedAt: Number(tagValue(event, 'published_at')) || event.created_at,
    title,
  };
}

/** A short plain-text summary derived from the Markdown body. */
export function deriveSummary(markdown: string, maxLength = 160): string {
  const plain = markdown
    .replace(/^[#>\s`-]+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}
