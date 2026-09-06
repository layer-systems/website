import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { isPicturePost, pictureTags, pictureUrl } from './picturePosts';

function event(kind: number, tags: string[][]): NostrEvent {
  return { id: 'id', pubkey: 'author', created_at: 0, kind, tags, content: '', sig: '' };
}

describe('picture posts', () => {
  it('accepts a Kind 20 post with a safe NIP-68 image URL', () => {
    const post = event(20, [['imeta', 'url https://images.example/picture.jpg'], ['t', 'sunset']]);
    expect(pictureUrl(post)).toBe('https://images.example/picture.jpg');
    expect(isPicturePost(post)).toBe(true);
    expect(pictureTags(post)).toEqual(['sunset']);
  });

  it('rejects non-picture kinds and unsafe image URLs', () => {
    expect(isPicturePost(event(1, [['imeta', 'url https://images.example/picture.jpg']]))).toBe(false);
    expect(isPicturePost(event(20, [['imeta', 'url javascript:alert(1)']]))).toBe(false);
    expect(isPicturePost(event(20, [['imeta', 'url mailto:image@example.com']]))).toBe(false);
    expect(isPicturePost(event(20, [['imeta', 'url /picture.jpg']]))).toBe(false);
  });
});
