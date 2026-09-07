import { sanitizeUrl } from '@/lib/nostrUtils';
import type { DocumentAttachment } from './types';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Turn raw Blossom uploader tags (NIP-94 `imeta` triplets) into validated
 * attachment metadata. Anything untrusted — non-https URLs, malformed hashes,
 * negative sizes — is dropped rather than passed through.
 */
export function attachmentFromImetaTags(tags: string[][]): DocumentAttachment | null {
  const flat = new Map<string, string>();
  for (const tag of tags) {
    const [name, ...values] = tag;
    if (!name || values.length === 0) continue;
    if (name === 'imeta') {
      // Each remaining entry is one `key value` pair.
      for (const entry of values) {
        const space = entry.indexOf(' ');
        if (space <= 0) continue;
        const key = entry.slice(0, space);
        const val = entry.slice(space + 1);
        if (!flat.has(key)) flat.set(key, val);
      }
      continue;
    }
    // Bare NIP-94 tags: `url`, `m`, `x`, `size`.
    if (!flat.has(name)) flat.set(name, values[0]);
  }

  const url = sanitizeUrl(flat.get('url'));
  if (!url || !url.startsWith('https:')) return null;

  const attachment: DocumentAttachment = { url };

  const mimeType = flat.get('m');
  if (mimeType && /^[\w.+-]+\/[\w.+-]+$/.test(mimeType)) attachment.mimeType = mimeType;

  const sha256 = flat.get('x');
  if (sha256 && SHA256_PATTERN.test(sha256)) attachment.sha256 = sha256;

  const size = Number(flat.get('size'));
  if (Number.isFinite(size) && size >= 0) attachment.size = size;

  return attachment;
}

/** Serialize an attachment back into NIP-94 tags for the publish event. */
export function attachmentToImetaTags(attachment: DocumentAttachment): string[][] {
  const imeta = [
    `url ${attachment.url}`,
    attachment.mimeType ? `m ${attachment.mimeType}` : undefined,
    attachment.sha256 ? `x ${attachment.sha256}` : undefined,
    attachment.size !== undefined ? `size ${attachment.size}` : undefined,
  ].filter((part): part is string => typeof part === 'string');

  const tags: string[][] = [['imeta', ...imeta]];
  if (attachment.sha256) tags.push(['x', attachment.sha256]);
  return tags;
}
