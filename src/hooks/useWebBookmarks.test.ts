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

  it('strips the https scheme case-insensitively, so casing does not create duplicate bookmarks', () => {
    expect(bookmarkDTag('HTTPS://alice.blog/post')).toBe('alice.blog/post');
    expect(bookmarkDTag('HtTpS://alice.blog/post')).toBe('alice.blog/post');
    expect(bookmarkDTag('HTTPS://alice.blog/post')).toBe(bookmarkDTag('https://alice.blog/post'));
  });

  it('round-trips schemes with no "//", like mailto: and nostr:, instead of prefixing them with https://', () => {
    expect(bookmarkUrl(bookmarkDTag('mailto:hello@example.com'))).toBe('mailto:hello@example.com');
    expect(bookmarkUrl(bookmarkDTag('nostr:npub1abc'))).toBe('nostr:npub1abc');
  });

  it('round-trips a hierarchical non-https scheme like gemini://', () => {
    const url = 'gemini://example.com/';
    expect(bookmarkUrl(bookmarkDTag(url))).toBe(url);
  });

  it('does not mistake a port number in a stripped https URL for a scheme', () => {
    expect(bookmarkUrl('alice.blog:8080/post')).toBe('https://alice.blog:8080/post');
  });
});
