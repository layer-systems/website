import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl, tagValue, tagValues } from '@/lib/nostrUtils';

/** NIP-52 calendar event kinds: date-based (all-day) and time-based. */
export const DATE_BASED_KIND = 31922;
export const TIME_BASED_KIND = 31923;
export const CALENDAR_EVENT_KINDS = [DATE_BASED_KIND, TIME_BASED_KIND] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];

export function isCalendarEventKind(kind: number): kind is CalendarEventKind {
  return kind === DATE_BASED_KIND || kind === TIME_BASED_KIND;
}

export interface CalendarParticipant {
  pubkey: string;
  relay?: string;
  role?: string;
}

export interface ParsedCalendarEvent {
  event: NostrEvent;
  kind: CalendarEventKind;
  /** The `d` tag identifier. */
  id: string;
  title: string;
  summary?: string;
  description: string;
  /** Sanitized image URL, if any. */
  image?: string;
  locations: string[];
  geohash?: string;
  participants: CalendarParticipant[];
  hashtags: string[];
  /** Sanitized reference URLs. */
  references: string[];
  allDay: boolean;
  /** Inclusive start instant. */
  start: Date;
  /** Exclusive end instant. */
  end: Date;
  startTzid?: string;
  endTzid?: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string): Date | undefined {
  if (!DATE_ONLY_RE.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseUnixSeconds(value: string): Date | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Validates and normalizes a raw event into a `ParsedCalendarEvent`, or
 * returns `null` when required NIP-52 tags are missing or malformed. Callers
 * should filter query results through this rather than trusting `kind`
 * membership alone — relay data is unauthenticated for shape.
 */
export function parseCalendarEvent(event: NostrEvent): ParsedCalendarEvent | null {
  if (!isCalendarEventKind(event.kind)) return null;

  const id = tagValue(event, 'd');
  if (!id) return null;

  // `title` is required; the deprecated `name` tag is only a fallback.
  const title = tagValue(event, 'title')?.trim() || tagValue(event, 'name')?.trim();
  if (!title) return null;

  const startRaw = tagValue(event, 'start');
  if (!startRaw) return null;

  const allDay = event.kind === DATE_BASED_KIND;
  const start = allDay ? parseDateOnly(startRaw) : parseUnixSeconds(startRaw);
  if (!start) return null;

  const endRaw = tagValue(event, 'end');
  const parsedEnd = endRaw ? (allDay ? parseDateOnly(endRaw) : parseUnixSeconds(endRaw)) : undefined;
  // A malformed or non-later `end` falls back to the spec default rather
  // than rejecting the whole event: same-day for date-based, instantaneous
  // for time-based.
  const end =
    parsedEnd && parsedEnd.getTime() > start.getTime()
      ? parsedEnd
      : new Date(start.getTime() + (allDay ? ONE_DAY_MS : 0));

  const participants: CalendarParticipant[] = event.tags
    .filter((tag): tag is [string, string, ...string[]] => tag[0] === 'p' && Boolean(tag[1]))
    .map(([, pubkey, relay, role]) => ({ pubkey, relay: relay || undefined, role: role || undefined }));

  return {
    event,
    kind: event.kind,
    id,
    title,
    summary: tagValue(event, 'summary')?.trim() || undefined,
    description: event.content ?? '',
    image: sanitizeUrl(tagValue(event, 'image')),
    locations: tagValues(event, 'location'),
    geohash: tagValue(event, 'g') || undefined,
    participants,
    hashtags: tagValues(event, 't'),
    references: tagValues(event, 'r')
      .map((url) => sanitizeUrl(url))
      .filter((url): url is string => Boolean(url)),
    allDay,
    start,
    end,
    startTzid: tagValue(event, 'start_tzid') || undefined,
    endTzid: tagValue(event, 'end_tzid') || undefined,
  };
}

/** Cheap membership + required-tag check, for filtering query results before the full parse. */
export function isValidCalendarEvent(event: NostrEvent): boolean {
  return parseCalendarEvent(event) !== null;
}

function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` for a Date's *local* calendar day — how the grid keys its cells. */
export function localDateKey(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `YYYY-MM-DD` for a Date's *UTC* calendar day — how all-day event tags are keyed. */
export function utcDateKey(date: Date): string {
  return dateKey(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Safety cap on iterated days so a malformed far-future `end` can't hang the grid. */
const MAX_SPAN_DAYS = 3660;

/**
 * Every calendar-day key (`YYYY-MM-DD`) this event touches. Date-based events
 * are timezone-agnostic, so their keys come from the UTC calendar day of the
 * tag values directly. Time-based events are instants, so their keys come
 * from the *viewer's local* calendar day — matching the grid, which is
 * itself a view of the viewer's local calendar.
 */
export function eventDateKeys(parsed: ParsedCalendarEvent): string[] {
  const keys: string[] = [];
  if (parsed.allDay) {
    const cursor = new Date(parsed.start);
    for (let i = 0; i < MAX_SPAN_DAYS && cursor.getTime() < parsed.end.getTime(); i++) {
      keys.push(utcDateKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    const lastInstant = parsed.end.getTime() > parsed.start.getTime() ? parsed.end.getTime() - 1 : parsed.start.getTime();
    const cursor = new Date(parsed.start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(lastInstant);
    last.setHours(0, 0, 0, 0);
    for (let i = 0; i < MAX_SPAN_DAYS && cursor.getTime() <= last.getTime(); i++) {
      keys.push(localDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return keys;
}

/** Day-granularity `D` tag value per NIP-52: `floor(unix_seconds / 86400)`. */
export function dayGranularity(date: Date): string {
  return String(Math.floor(date.getTime() / (ONE_DAY_MS)));
}

/**
 * `#D` values covering `[from, to)`, for a relay-side time-based query. Capped
 * so a caller can't accidentally request an unbounded tag list.
 */
export function dayGranularityRange(from: Date, to: Date): string[] {
  const values: string[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < MAX_SPAN_DAYS && cursor.getTime() < to.getTime(); i++) {
    values.push(dayGranularity(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

/** Stable identity for an addressable event, for dedup and React keys. */
export function calendarEventKey(parsed: ParsedCalendarEvent): string {
  return `${parsed.kind}:${parsed.event.pubkey}:${parsed.id}`;
}

/**
 * Addressable events: keep only the newest revision per (kind, pubkey, d).
 * Relays across the pool can hand back stale copies of an edited event.
 */
export function dedupeLatestCalendarEvents(events: ParsedCalendarEvent[]): ParsedCalendarEvent[] {
  const latest = new Map<string, ParsedCalendarEvent>();
  for (const parsed of events) {
    const key = calendarEventKey(parsed);
    const current = latest.get(key);
    if (!current || parsed.event.created_at > current.event.created_at) latest.set(key, parsed);
  }
  return [...latest.values()];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatAllDayDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Human-readable date/time range for the detail view and agenda rows. */
export function formatEventTimeRange(parsed: ParsedCalendarEvent): string {
  if (parsed.allDay) {
    const lastDay = new Date(parsed.end.getTime() - ONE_DAY_MS);
    if (utcDateKey(parsed.start) === utcDateKey(lastDay)) {
      return formatAllDayDate(parsed.start);
    }
    return `${formatAllDayDate(parsed.start)} – ${formatAllDayDate(lastDay)}`;
  }

  const startDate = parsed.start.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  if (parsed.start.getTime() === parsed.end.getTime()) {
    return `${startDate} at ${formatTime(parsed.start)}`;
  }
  // `end` is exclusive, so an event ending exactly at midnight belongs to
  // the *previous* instant's day — the same day `eventDateKeys()` puts it
  // on — not the day `end` technically ticks over into.
  const lastInstant = new Date(parsed.end.getTime() - 1);
  const sameDay = localDateKey(parsed.start) === localDateKey(lastInstant);
  if (sameDay) {
    return `${startDate}, ${formatTime(parsed.start)} – ${formatTime(parsed.end)}`;
  }
  const endDate = lastInstant.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return `${startDate} ${formatTime(parsed.start)} – ${endDate} ${formatTime(parsed.end)}`;
}
