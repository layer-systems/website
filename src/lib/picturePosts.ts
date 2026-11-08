import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl } from './nostrUtils';

export interface PictureImage {
  url: string;
  alt: string;
  /** Intrinsic size from the NIP-92 `dim` field, when present and sane. */
  width?: number;
  height?: number;
}

function parseDimensions(metadata: string[]): { width?: number; height?: number } {
  const match = metadata.find((value) => value.startsWith('dim '))?.slice(4).trim().match(/^(\d{1,5})x(\d{1,5})$/);
  if (!match) return {};
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : {};
}

/** Safe images in publication order, with NIP-92 accessibility text. */
export function pictureImages(event: NostrEvent): PictureImage[] {
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
      return [{ url: safe, alt, ...parseDimensions(metadata) }];
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

export function pictureTitle(event: NostrEvent): string | undefined {
  return event.tags.find(([name, value]) => name === 'title' && Boolean(value?.trim()))?.[1]?.trim();
}

export function pictureTags(event: NostrEvent): string[] {
  return event.tags
    .filter(([name, value]) => name === 't' && Boolean(value))
    .map(([, value]) => value);
}
