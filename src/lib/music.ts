import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl, tagValue } from '@/lib/nostrUtils';

export const TRACK_KIND = 31337;
export const PLAYLIST_KIND = 30004;
export const FAVORITES_ID = 'music-favorites';

export interface Track {
  event: NostrEvent;
  identifier: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  audioUrl: string;
  duration?: number;
  mime?: string;
}

export function secureMediaUrl(value: string | undefined): string | undefined {
  const sanitized = sanitizeUrl(value);
  return sanitized?.startsWith('https://') ? sanitized : undefined;
}

export function trackAddress(track: Pick<Track, 'event' | 'identifier'>): string {
  return `${TRACK_KIND}:${track.event.pubkey}:${track.identifier}`;
}

export function parseTrackAddress(value: string): { pubkey: string; identifier: string } | undefined {
  const match = /^31337:([0-9a-f]{64}):(.+)$/.exec(value);
  return match ? { pubkey: match[1], identifier: match[2] } : undefined;
}

function imetaValue(tag: string[], key: string): string | undefined {
  const prefix = `${key} `;
  return tag.slice(1).find((part) => part.startsWith(prefix))?.slice(prefix.length).trim();
}

export function parseTrack(event: NostrEvent): Track | undefined {
  if (event.kind !== TRACK_KIND) return undefined;
  const identifier = tagValue(event, 'd')?.trim();
  const title = tagValue(event, 'title')?.trim() || tagValue(event, 'subject')?.trim();
  if (!identifier || !title) return undefined;

  const media = event.tags
    .filter(([name]) => name === 'imeta')
    .map((tag) => ({ url: secureMediaUrl(imetaValue(tag, 'url')), mime: imetaValue(tag, 'm') }))
    .find(({ url, mime }) => url && (!mime || mime.startsWith('audio/')));
  const audioUrl = media?.url || secureMediaUrl(tagValue(event, 'url')) || secureMediaUrl(tagValue(event, 'media'));
  if (!audioUrl) return undefined;
  const artist = event.tags.find(([name, , role]) => name === 'c' && role === 'artist')?.[1]?.trim() || 'Unknown artist';
  const album = event.tags.find(([name, , role]) => name === 'c' && role === 'album')?.[1]?.trim();
  const rawDuration = Number(tagValue(event, 'duration'));
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : undefined;
  return {
    event,
    identifier,
    title,
    artist,
    album,
    audioUrl,
    artwork: secureMediaUrl(tagValue(event, 'image')),
    duration,
    mime: media?.mime,
  };
}

export function latestTracks(events: NostrEvent[]): Track[] {
  const latest = new Map<string, Track>();
  for (const event of events) {
    const track = parseTrack(event);
    if (!track) continue;
    const address = trackAddress(track);
    const previous = latest.get(address);
    if (!previous || previous.event.created_at < event.created_at || (previous.event.created_at === event.created_at && previous.event.id < event.id)) {
      latest.set(address, track);
    }
  }
  return [...latest.values()].sort((a, b) => b.event.created_at - a.event.created_at);
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '–:––';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
