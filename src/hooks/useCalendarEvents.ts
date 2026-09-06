import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import {
  type CalendarEventKind,
  type ParsedCalendarEvent,
  DATE_BASED_KIND,
  TIME_BASED_KIND,
  dayGranularityRange,
  dedupeLatestCalendarEvents,
  eventDateKeys,
  isCalendarEventKind,
  parseCalendarEvent,
} from '@/lib/calendarEvents';

export type CalendarEventTypeFilter = 'all' | 'date' | 'time';

export interface CalendarQueryFilters {
  eventType: CalendarEventTypeFilter;
  /** Hex pubkeys. Empty/undefined means no author constraint. */
  authors?: string[];
}

function kindsForFilter(eventType: CalendarEventTypeFilter): CalendarEventKind[] {
  if (eventType === 'date') return [DATE_BASED_KIND];
  if (eventType === 'time') return [TIME_BASED_KIND];
  return [DATE_BASED_KIND, TIME_BASED_KIND];
}

const QUERY_TIMEOUT_MS = 8000;
/** Per-kind cap. Generous enough for a padded month window without being unbounded. */
const EVENT_LIMIT = 400;

/**
 * Fetches NIP-52 calendar events overlapping `[rangeStart, rangeEnd)` (a
 * padded window around the viewed month, wide enough to cover multi-day
 * events and the leading/trailing adjacent-month days the grid shows).
 *
 * Time-based events (kind 31923) carry a day-granularity `D` tag, which is a
 * single-letter — and therefore relay-indexable — tag, so the range is sent
 * as a `#D` constraint. Date-based events (kind 31922) have no indexable
 * date field in NIP-52; those are bounded only by `limit` and then filtered
 * client-side against the range. This is a known limitation of the NIP
 * itself, not of this query.
 *
 * Free-text search is intentionally not a parameter here: it's applied
 * client-side by the caller so that typing in a search box never triggers a
 * refetch.
 */
export function useCalendarEvents(rangeStart: Date, rangeEnd: Date, filters: CalendarQueryFilters) {
  const { nostr } = useNostr();
  const kinds = kindsForFilter(filters.eventType);
  const authors = filters.authors && filters.authors.length > 0 ? filters.authors : undefined;

  const queryKey = [
    'nostr',
    'calendar-events',
    kinds.join(','),
    authors?.join(',') ?? '',
    rangeStart.getTime(),
    rangeEnd.getTime(),
  ] as const;

  const query = useQuery<ParsedCalendarEvent[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const nostrFilters: NostrFilter[] = [];
      if (kinds.includes(TIME_BASED_KIND)) {
        nostrFilters.push({
          kinds: [TIME_BASED_KIND],
          ...(authors ? { authors } : {}),
          '#D': dayGranularityRange(rangeStart, rangeEnd),
          limit: EVENT_LIMIT,
        });
      }
      if (kinds.includes(DATE_BASED_KIND)) {
        nostrFilters.push({
          kinds: [DATE_BASED_KIND],
          ...(authors ? { authors } : {}),
          limit: EVENT_LIMIT,
        });
      }

      const events = await nostr.query(nostrFilters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT_MS)]),
      });

      const parsed = events
        .filter((event): event is NostrEvent & { kind: CalendarEventKind } => isCalendarEventKind(event.kind))
        .map(parseCalendarEvent)
        .filter((event): event is ParsedCalendarEvent => event !== null);

      const deduped = dedupeLatestCalendarEvents(parsed);

      // Relay-side #D narrows time-based events but can't bound date-based
      // ones, so every event is re-checked against the exact window here.
      return deduped.filter((event) => {
        return event.start.getTime() < rangeEnd.getTime() && event.end.getTime() > rangeStart.getTime();
      });
    },
    staleTime: 60_000,
  });

  return query;
}

/** Free-text match against title/summary, applied client-side to a bounded result set. */
export function useSearchedCalendarEvents(events: ParsedCalendarEvent[] | undefined, search: string) {
  return useMemo(() => {
    if (!events) return events;
    const term = search.trim().toLowerCase();
    if (!term) return events;
    return events.filter(
      (event) => event.title.toLowerCase().includes(term) || event.summary?.toLowerCase().includes(term),
    );
  }, [events, search]);
}

/** Maps each calendar-day key to the events occurring on it, sorted by start time. */
export function useEventsByDay(events: ParsedCalendarEvent[] | undefined) {
  return useMemo(() => {
    const byDay = new Map<string, ParsedCalendarEvent[]>();
    for (const event of events ?? []) {
      for (const key of eventDateKeys(event)) {
        const list = byDay.get(key);
        if (list) list.push(event);
        else byDay.set(key, [event]);
      }
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => a.start.getTime() - b.start.getTime());
    }
    return byDay;
  }, [events]);
}

/** Fetches one calendar event by its addressable coordinates, e.g. for a deep link. */
export function useCalendarEvent(
  pubkey: string | undefined,
  kind: number | undefined,
  identifier: string | undefined,
  relays: string[] | undefined,
) {
  const { nostr } = useNostr();

  return useQuery<ParsedCalendarEvent | null>({
    queryKey: ['nostr', 'calendar-event', pubkey ?? '', kind ?? 0, identifier ?? '', relays?.join(',') ?? ''],
    enabled: Boolean(pubkey && identifier !== undefined && kind !== undefined && isCalendarEventKind(kind)),
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query(
        [{ kinds: [kind!], authors: [pubkey!], '#d': [identifier!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT_MS)]), relays },
      );
      return event ? parseCalendarEvent(event) : null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
