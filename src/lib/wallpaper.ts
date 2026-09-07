import { z } from 'zod';

/**
 * Desktop wallpaper model: a small, typed, versioned preference stored inside
 * `AppConfig`. Curated wallpapers are theme-aware CSS patterns (no image
 * bytes, no network request); a custom wallpaper is always a validated
 * HTTPS URL rendered through an `<img>` element, never interpolated into
 * CSS. Local files never end up in this config — they are either uploaded
 * to Blossom (producing a normal HTTPS URL) or rejected.
 */

export type WallpaperFit = 'cover' | 'contain';

export interface WallpaperPresentation {
  fit: WallpaperFit;
  /** 0-80: percentage darkness overlay drawn over the image for legibility. */
  dim: number;
}

export interface CuratedWallpaper {
  id: string;
  name: string;
  description: string;
  /** CSS class (defined in index.css) that paints this theme-aware pattern. */
  className: string;
}

export type WallpaperSelection =
  | { source: 'curated'; id: string }
  | { source: 'url'; url: string; presentation: WallpaperPresentation };

export interface WallpaperPreference {
  version: 1;
  selection: WallpaperSelection;
}

export const DEFAULT_CURATED_ID = 'dot-grid';

/** The built-in gallery. Order here is the order shown to users. */
export const CURATED_WALLPAPERS: CuratedWallpaper[] = [
  {
    id: 'dot-grid',
    name: 'Dot grid',
    description: 'The original low-contrast dot grid. Recolors with your theme.',
    className: 'os-wallpaper-dot-grid',
  },
  {
    id: 'aurora',
    name: 'Aurora bands',
    description: 'Soft diagonal bands tinted with the accent color.',
    className: 'os-wallpaper-aurora',
  },
  {
    id: 'contour',
    name: 'Contour lines',
    description: 'Concentric rings radiating from the corner.',
    className: 'os-wallpaper-contour',
  },
];

export const DEFAULT_PRESENTATION: WallpaperPresentation = { fit: 'cover', dim: 0 };

export const DEFAULT_WALLPAPER: WallpaperPreference = {
  version: 1,
  selection: { source: 'curated', id: DEFAULT_CURATED_ID },
};

/** Looks up a curated wallpaper by id, falling back to the default pattern for unknown/stale ids. */
export function resolveCurated(id: string): CuratedWallpaper {
  return (
    CURATED_WALLPAPERS.find((wallpaper) => wallpaper.id === id) ??
    CURATED_WALLPAPERS.find((wallpaper) => wallpaper.id === DEFAULT_CURATED_ID) ??
    CURATED_WALLPAPERS[0]
  );
}

/**
 * A wallpaper URL must be HTTPS. This is stricter than `sanitizeUrl` (which
 * also allows http/mailto/nostr for links) because a wallpaper is fetched
 * eagerly by the browser the moment it is rendered, revealing the viewer's
 * IP and browsing time to whatever host serves it.
 */
export function isSafeWallpaperUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeWallpaperUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return isSafeWallpaperUrl(value) ? value : undefined;
}

/** Kept in sync with the Zod schema's `url` length cap below. */
export const MAX_WALLPAPER_URL_LENGTH = 2048;

const WallpaperPresentationSchema = z.object({
  fit: z.enum(['cover', 'contain']),
  dim: z.number().min(0).max(80),
}) satisfies z.ZodType<WallpaperPresentation>;

const curatedIds = CURATED_WALLPAPERS.map((wallpaper) => wallpaper.id) as [string, ...string[]];

const CuratedSelectionSchema = z.object({
  source: z.literal('curated'),
  id: z.enum(curatedIds),
});

const UrlSelectionSchema = z.object({
  source: z.literal('url'),
  url: z.string().max(MAX_WALLPAPER_URL_LENGTH).refine(isSafeWallpaperUrl, 'Wallpaper URL must be a valid https:// URL'),
  presentation: WallpaperPresentationSchema,
});

const WallpaperSelectionSchema = z.discriminatedUnion('source', [
  CuratedSelectionSchema,
  UrlSelectionSchema,
]) satisfies z.ZodType<WallpaperSelection>;

/**
 * Malformed or future-versioned data (a corrupt entry, a removed curated id
 * from an older build, an http:// URL that slipped in before this was
 * enforced, etc.) must never break the desktop. `.catch()` makes the whole
 * preference fall back to the default wallpaper rather than throwing, which
 * would otherwise take the rest of `AppConfig` down with it.
 */
export const WallpaperPreferenceSchema = z.object({
  version: z.literal(1),
  selection: WallpaperSelectionSchema,
}).catch(DEFAULT_WALLPAPER) satisfies z.ZodType<WallpaperPreference>;
