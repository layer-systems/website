import { describe, expect, it } from 'vitest';
import { bookmarkDTag, bookmarkUrl } from './useWebBookmarks';

describe('bookmarkDTag / bookmarkUrl', () => {
  it('strips the https scheme per NIP-B0', () => {
    expect(bookmarkDTag('https://alice.blog/post')).toBe('alice.blog/post');
  });

  it('keeps non-https schemes in full', () => {
    expect(bookmarkDTag('http://alice.blog/post')).toBe('http://alice.blog/post');
    expect(bookmarkDTag('gemini://example.com/')).toBe('gemini://example.com/');
  });

  it('round-trips an https URL back through bookmarkUrl', () => {
    const url = 'https://alice.blog/post';
    expect(bookmarkUrl(bookmarkDTag(url))).toBe(url);
  });

  it('round-trips a non-https URL back through bookmarkUrl', () => {
    const url = 'http://alice.blog/post';
    expect(bookmarkUrl(bookmarkDTag(url))).toBe(url);
  });
});
