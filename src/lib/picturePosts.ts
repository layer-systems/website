import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl } from './nostrUtils';

/** Safe images in publication order, with NIP-92 accessibility text. */
export function pictureImages(event: NostrEvent): { url: string; alt: string }[] {
  if (event.kind !== 20) return [];
  return event.tags.filter(([name]) => name === 'imeta').flatMap((metadata) => {
    const url = metadata.find((value) => value.startsWith('url '))?.slice(4);
    if (!url) return [];
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
      const safe = sanitizeUrl(parsed.href);
      if (!safe) return [];
      const alt = metadata.find((value) => value.startsWith('alt '))?.slice(4)
        || event.tags.find(([name]) => name === 'title')?.[1]
        || event.content || 'Picture post';
      return [{ url: safe, alt }];
    } catch {
      return [];
    }
  });
}

/** Returns the first safe image for consumers that need a thumbnail. */
export function pictureUrl(event: NostrEvent): string | undefined {
  return pictureImages(event)[0]?.url;
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
