import { describe, expect, it } from 'vitest';
import {
  CURATED_WALLPAPERS,
  DEFAULT_CURATED_ID,
  DEFAULT_WALLPAPER,
  WallpaperPreferenceSchema,
  isSafeWallpaperUrl,
  resolveCurated,
  sanitizeWallpaperUrl,
} from './wallpaper';

describe('isSafeWallpaperUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafeWallpaperUrl('https://example.com/wallpaper.jpg')).toBe(true);
  });

  it('rejects http, javascript:, data:, and malformed URLs', () => {
    expect(isSafeWallpaperUrl('http://example.com/wallpaper.jpg')).toBe(false);
    expect(isSafeWallpaperUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeWallpaperUrl('data:image/png;base64,aaaa')).toBe(false);
    expect(isSafeWallpaperUrl('not a url')).toBe(false);
  });
});

describe('sanitizeWallpaperUrl', () => {
  it('passes through safe URLs and drops unsafe or missing ones', () => {
    expect(sanitizeWallpaperUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(sanitizeWallpaperUrl('http://example.com/a.png')).toBeUndefined();
    expect(sanitizeWallpaperUrl(undefined)).toBeUndefined();
  });
});

describe('resolveCurated', () => {
  it('finds a known curated wallpaper by id', () => {
    expect(resolveCurated('aurora')).toEqual(CURATED_WALLPAPERS.find((w) => w.id === 'aurora'));
  });

  it('falls back to the default pattern for an unknown or stale id', () => {
    expect(resolveCurated('some-removed-id')).toEqual(CURATED_WALLPAPERS[0]);
  });
});

describe('WallpaperPreferenceSchema', () => {
  it('parses a valid curated selection', () => {
    const value = { version: 1, selection: { source: 'curated', id: DEFAULT_CURATED_ID } };
    expect(WallpaperPreferenceSchema.parse(value)).toEqual(value);
  });

  it('parses a valid https url selection', () => {
    const value = {
      version: 1,
      selection: { source: 'url', url: 'https://example.com/wallpaper.jpg', presentation: { fit: 'cover', dim: 20 } },
    };
    expect(WallpaperPreferenceSchema.parse(value)).toEqual(value);
  });

  it('falls back to the default wallpaper for a non-https url', () => {
    const value = {
      version: 1,
      selection: { source: 'url', url: 'http://example.com/wallpaper.jpg', presentation: { fit: 'cover', dim: 0 } },
    };
    expect(WallpaperPreferenceSchema.parse(value)).toEqual(DEFAULT_WALLPAPER);
  });

  it('falls back to the default wallpaper for malformed/legacy data', () => {
    expect(WallpaperPreferenceSchema.parse(null)).toEqual(DEFAULT_WALLPAPER);
    expect(WallpaperPreferenceSchema.parse({})).toEqual(DEFAULT_WALLPAPER);
    expect(WallpaperPreferenceSchema.parse({ version: 2, selection: { source: 'curated', id: 'x' } })).toEqual(DEFAULT_WALLPAPER);
    expect(WallpaperPreferenceSchema.parse('not an object')).toEqual(DEFAULT_WALLPAPER);
  });

  it('falls back to the default wallpaper for an out-of-range dim value', () => {
    const value = {
      version: 1,
      selection: { source: 'url', url: 'https://example.com/wallpaper.jpg', presentation: { fit: 'cover', dim: 999 } },
    };
    expect(WallpaperPreferenceSchema.parse(value)).toEqual(DEFAULT_WALLPAPER);
  });
});
