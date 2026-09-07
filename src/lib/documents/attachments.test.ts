import { describe, expect, it } from 'vitest';
import { attachmentFromImetaTags, attachmentToImetaTags } from './attachments';

const SHA = 'a'.repeat(64);

describe('attachmentFromImetaTags', () => {
  it('parses Blossom uploader tags', () => {
    const result = attachmentFromImetaTags([
      ['url', 'https://blossom.example/file.png'],
      ['m', 'image/png'],
      ['x', SHA],
      ['size', '2048'],
    ]);
    expect(result).toEqual({
      url: 'https://blossom.example/file.png',
      mimeType: 'image/png',
      sha256: SHA,
      size: 2048,
    });
  });

  it('parses a combined imeta tag', () => {
    const result = attachmentFromImetaTags([
      ['imeta', `url https://blossom.example/file.pdf`, 'm application/pdf', `x ${SHA}`],
    ]);
    expect(result).toEqual({
      url: 'https://blossom.example/file.pdf',
      mimeType: 'application/pdf',
      sha256: SHA,
    });
  });

  it('rejects non-https and unsafe URLs', () => {
    expect(attachmentFromImetaTags([['url', 'javascript:alert(1)']])).toBeNull();
    expect(attachmentFromImetaTags([['url', 'not a url']])).toBeNull();
    expect(attachmentFromImetaTags([['m', 'image/png']])).toBeNull();
  });

  it('drops malformed hashes and sizes', () => {
    const result = attachmentFromImetaTags([
      ['url', 'https://blossom.example/file.png'],
      ['x', 'not-a-hash'],
      ['size', '-5'],
    ]);
    expect(result).toEqual({ url: 'https://blossom.example/file.png' });
  });
});

describe('attachmentToImetaTags', () => {
  it('round-trips through attachmentFromImetaTags', () => {
    const original = {
      url: 'https://blossom.example/file.png',
      mimeType: 'image/png',
      sha256: SHA,
      size: 2048,
    };
    const tags = attachmentToImetaTags(original);
    expect(attachmentFromImetaTags(tags)).toEqual(original);
  });

  it('includes the bare x tag for NIP-94 addressability', () => {
    const tags = attachmentToImetaTags({ url: 'https://blossom.example/f', sha256: SHA });
    expect(tags).toContainEqual(['x', SHA]);
  });
});
