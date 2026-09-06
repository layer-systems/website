import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl } from './nostrUtils';

/** Returns the primary, safe media URL from a NIP-68 `imeta` tag. */
export function pictureUrl(event: NostrEvent): string | undefined {
  if (event.kind !== 20) return undefined;

  const metadata = event.tags.find(([name]) => name === 'imeta');
  const url = metadata?.find((value) => value.startsWith('url '))?.slice(4);
  return sanitizeUrl(url);
}

/** Picture posts are Kind 20 events with an image the client can safely render. */
export function isPicturePost(event: NostrEvent): boolean {
  return Boolean(pictureUrl(event));
}

export function pictureTags(event: NostrEvent): string[] {
  return event.tags
    .filter(([name, value]) => name === 't' && Boolean(value))
    .map(([, value]) => value);
}
