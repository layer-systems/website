import type { NostrEvent } from '@nostrify/nostrify';

export const RELAY_LIST_KIND = 10002;
export const FAVORITE_RELAYS_KIND = 10012;
export const RELAY_SET_KIND = 30002;

export type RelayMode = 'read' | 'write' | 'both';

export interface RelayEntry {
  url: string;
  mode: RelayMode;
}

export interface RelaySet {
  identifier: string;
  title: string;
  description: string;
  relays: string[];
  event?: NostrEvent;
}

export function normalizeRelayUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(trimmed);

  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
    throw new Error('Relay URLs must start with wss:// or ws://');
  }

  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

export function parseRelayList(event?: NostrEvent | null): RelayEntry[] {
  if (!event || event.kind !== RELAY_LIST_KIND) return [];

  return event.tags.flatMap(([name, value, marker]) => {
    if (name !== 'r' || !value) return [];

    try {
      const url = normalizeRelayUrl(value);
      const mode: RelayMode = marker === 'read' || marker === 'write' ? marker : 'both';
      return [{ url, mode }];
    } catch {
      return [];
    }
  });
}

export function parseFavoriteRelays(event?: NostrEvent | null): string[] {
  if (!event || event.kind !== FAVORITE_RELAYS_KIND) return [];

  return event.tags.flatMap(([name, value]) => {
    if (name !== 'relay' || !value) return [];
    try {
      return [normalizeRelayUrl(value)];
    } catch {
      return [];
    }
  });
}

export function parseRelaySet(event: NostrEvent): RelaySet | null {
  if (event.kind !== RELAY_SET_KIND) return null;

  const identifier = event.tags.find(([name]) => name === 'd')?.[1]?.trim();
  if (!identifier) return null;

  const title = event.tags.find(([name]) => name === 'title')?.[1]?.trim() || identifier;
  const description = event.tags.find(([name]) => name === 'description')?.[1]?.trim() || '';
  const relays = event.tags.flatMap(([name, value]) => {
    if (name !== 'relay' || !value) return [];
    try {
      return [normalizeRelayUrl(value)];
    } catch {
      return [];
    }
  });

  return { identifier, title, description, relays, event };
}

export function latestReplaceable(events: NostrEvent[], kind: number): NostrEvent | null {
  return events
    .filter((event) => event.kind === kind)
    .sort((a, b) => b.created_at - a.created_at)[0] ?? null;
}

export function latestRelaySets(events: NostrEvent[]): RelaySet[] {
  const latestByIdentifier = new Map<string, NostrEvent>();

  for (const event of events.filter((candidate) => candidate.kind === RELAY_SET_KIND)) {
    const identifier = event.tags.find(([name]) => name === 'd')?.[1]?.trim();
    if (!identifier) continue;

    const current = latestByIdentifier.get(identifier);
    if (!current || event.created_at > current.created_at) {
      latestByIdentifier.set(identifier, event);
    }
  }

  const deletionRequests = events.filter((event) => event.kind === 5);

  return [...latestByIdentifier.values()]
    .filter((event) => {
      const identifier = event.tags.find(([name]) => name === 'd')?.[1];
      const coordinate = `${RELAY_SET_KIND}:${event.pubkey}:${identifier}`;

      return !deletionRequests.some((request) =>
        request.created_at >= event.created_at
        && request.tags.some(([name, value]) =>
          (name === 'e' && value === event.id) || (name === 'a' && value === coordinate),
        ),
      );
    })
    .map(parseRelaySet)
    .filter((set): set is RelaySet => Boolean(set))
    .sort((a, b) => a.title.localeCompare(b.title));
}
