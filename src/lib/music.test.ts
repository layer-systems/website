import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { latestTracks, parseTrack, parseTrackAddress, trackAddress } from './music';
import { applyListOperation, emptyList, isValidItem } from './nip51';

const pubkey = 'a'.repeat(64);

function event(tags: string[][], created_at = 1, kind = 31337): NostrEvent {
  return { id: String(created_at), pubkey, created_at, kind, tags, content: '', sig: '' };
}

describe('Nostr music tracks', () => {
  it('reads a compatible track and keeps the newest author-owned replacement', () => {
    const old = event([['d', 'song'], ['title', 'Old name'], ['imeta', 'url https://music.example/song.mp3', 'm audio/mpeg']]);
    const updated = event([['d', 'song'], ['title', 'New name'], ['c', 'The Artist', 'artist'], ['imeta', 'url https://music.example/song.mp3', 'm audio/mpeg']], 2);
    const otherAuthor = { ...old, pubkey: 'b'.repeat(64), id: 'another' };
    const tracks = latestTracks([old, updated, otherAuthor]);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].title).toBe('New name');
    expect(tracks[0].artist).toBe('The Artist');
    expect(trackAddress(tracks[0])).toBe(`31337:${pubkey}:song`);
    expect(parseTrackAddress(trackAddress(tracks[0]))).toEqual({ pubkey, identifier: 'song' });
  });

  it('rejects unsafe or non-audio media and malformed track identity', () => {
    expect(parseTrack(event([['d', 'bad'], ['title', 'Bad'], ['imeta', 'url javascript:alert(1)']]))).toBeUndefined();
    expect(parseTrack(event([['d', 'bad'], ['title', 'Bad'], ['url', 'http://music.example/song.mp3']]))).toBeUndefined();
    expect(parseTrack(event([['d', 'bad'], ['title', 'Bad'], ['imeta', 'url https://music.example/cover.jpg', 'm image/jpeg']]))).toBeUndefined();
    expect(parseTrack(event([['title', 'No address'], ['url', 'https://music.example/song.mp3']]))).toBeUndefined();
    expect(parseTrack(event([['d', 'wrong kind'], ['title', 'Wrong'], ['url', 'https://music.example/song.mp3']], 1, 1))).toBeUndefined();
    expect(parseTrackAddress(`31337:not-a-pubkey:song`)).toBeUndefined();
  });
});

describe('music curation sets', () => {
  it('keeps track references in playback order when edited', () => {
    const first = `31337:${pubkey}:first`;
    const second = `31337:${pubkey}:second`;
    expect(isValidItem(['a', first], [30023, 31337])).toBe(true);
    const initial = emptyList(30004, pubkey, 'music-mix');
    const withTracks = applyListOperation(applyListOperation(initial, { type: 'add', tag: ['a', first], private: false }), { type: 'add', tag: ['a', second], private: false });
    const reordered = applyListOperation(withTracks, { type: 'move', key: `a:${second}`, direction: -1 });
    expect(reordered.publicItems.map((tag) => tag[1])).toEqual([second, first]);
    expect(applyListOperation(reordered, { type: 'remove', key: `a:${first}` }).publicItems).toEqual([['a', second]]);
  });
});
