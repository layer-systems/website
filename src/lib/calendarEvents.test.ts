import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  DATE_BASED_KIND,
  TIME_BASED_KIND,
  calendarEventKey,
  dayGranularity,
  dayGranularityRange,
  dedupeLatestCalendarEvents,
  eventDateKeys,
  formatEventTimeRange,
  isValidCalendarEvent,
  parseCalendarEvent,
} from './calendarEvents';

function makeEvent(overrides: Partial<NostrEvent> & { tags: string[][] }): NostrEvent {
  return {
    id: 'id',
    pubkey: 'pubkey',
    created_at: 1_700_000_000,
    kind: DATE_BASED_KIND,
    content: '',
    sig: 'sig',
    ...overrides,
  };
}

describe('parseCalendarEvent', () => {
  it('parses a valid date-based event', () => {
    const event = makeEvent({
      kind: DATE_BASED_KIND,
      tags: [
        ['d', 'abc'],
        ['title', 'Company retreat'],
        ['start', '2026-06-01'],
        ['end', '2026-06-03'],
      ],
    });

    const parsed = parseCalendarEvent(event);
    expect(parsed).not.toBeNull();
    expect(parsed?.allDay).toBe(true);
    expect(parsed?.title).toBe('Company retreat');
    expect(parsed?.start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(parsed?.end.toISOString()).toBe('2026-06-03T00:00:00.000Z');
  });

  it('parses a valid time-based event', () => {
    const event = makeEvent({
      kind: TIME_BASED_KIND,
      tags: [
        ['d', 'xyz'],
        ['title', 'Standup'],
        ['start', '1700000000'],
        ['end', '1700003600'],
      ],
    });

    const parsed = parseCalendarEvent(event);
    expect(parsed).not.toBeNull();
    expect(parsed?.allDay).toBe(false);
    expect(parsed?.start.getTime()).toBe(1_700_000_000_000);
    expect(parsed?.end.getTime()).toBe(1_700_003_600_000);
  });

  it('falls back to the deprecated name tag when title is missing', () => {
    const event = makeEvent({
      tags: [
        ['d', 'abc'],
        ['name', 'Legacy title'],
        ['start', '2026-06-01'],
      ],
    });
    expect(parseCalendarEvent(event)?.title).toBe('Legacy title');
  });

  it('defaults a same-day end for date-based events with no end tag', () => {
    const event = makeEvent({
      tags: [
        ['d', 'abc'],
        ['title', 'One day'],
        ['start', '2026-06-01'],
      ],
    });
    const parsed = parseCalendarEvent(event);
    expect(parsed?.end.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('ignores an end tag that is not after start', () => {
    const event = makeEvent({
      kind: TIME_BASED_KIND,
      tags: [
        ['d', 'abc'],
        ['title', 'Bad end'],
        ['start', '1700000000'],
        ['end', '1699999999'],
      ],
    });
    const parsed = parseCalendarEvent(event);
    expect(parsed?.end.getTime()).toBe(parsed?.start.getTime());
  });

  it('rejects events missing required tags', () => {
    expect(parseCalendarEvent(makeEvent({ tags: [['title', 'No id']] }))).toBeNull();
    expect(parseCalendarEvent(makeEvent({ tags: [['d', 'abc']] }))).toBeNull();
    expect(parseCalendarEvent(makeEvent({ tags: [['d', 'abc'], ['title', 'No start']] }))).toBeNull();
  });

  it('rejects a malformed start date', () => {
    const event = makeEvent({ tags: [['d', 'abc'], ['title', 'Bad date'], ['start', 'not-a-date']] });
    expect(parseCalendarEvent(event)).toBeNull();
  });

  it('rejects non-calendar kinds', () => {
    const event = makeEvent({ kind: 1, tags: [['d', 'abc'], ['title', 'Note'], ['start', '2026-06-01']] });
    expect(parseCalendarEvent(event)).toBeNull();
  });

  it('isValidCalendarEvent mirrors parseCalendarEvent success', () => {
    const valid = makeEvent({ tags: [['d', 'abc'], ['title', 'Ok'], ['start', '2026-06-01']] });
    const invalid = makeEvent({ tags: [['title', 'No id']] });
    expect(isValidCalendarEvent(valid)).toBe(true);
    expect(isValidCalendarEvent(invalid)).toBe(false);
  });
});

describe('eventDateKeys', () => {
  it('covers each day of a multi-day all-day event', () => {
    const parsed = parseCalendarEvent(
      makeEvent({ tags: [['d', 'a'], ['title', 'Trip'], ['start', '2026-06-01'], ['end', '2026-06-04']] }),
    )!;
    expect(eventDateKeys(parsed)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  it('produces a single key for an instantaneous time-based event', () => {
    const parsed = parseCalendarEvent(
      makeEvent({ kind: TIME_BASED_KIND, tags: [['d', 'a'], ['title', 'Ping'], ['start', '1700000000']] }),
    )!;
    expect(eventDateKeys(parsed)).toHaveLength(1);
  });
});

describe('dayGranularity / dayGranularityRange', () => {
  it('computes floor(unix_seconds / 86400)', () => {
    expect(dayGranularity(new Date(1_700_000_000_000))).toBe(String(Math.floor(1_700_000_000 / 86400)));
  });

  it('produces one value per day in the range', () => {
    const from = new Date('2026-06-01T00:00:00Z');
    const to = new Date('2026-06-04T00:00:00Z');
    expect(dayGranularityRange(from, to)).toHaveLength(3);
  });
});

describe('dedupeLatestCalendarEvents', () => {
  it('keeps only the newest revision per (kind, pubkey, d)', () => {
    const older = parseCalendarEvent(
      makeEvent({ created_at: 100, tags: [['d', 'a'], ['title', 'Old'], ['start', '2026-06-01']] }),
    )!;
    const newer = parseCalendarEvent(
      makeEvent({ created_at: 200, tags: [['d', 'a'], ['title', 'New'], ['start', '2026-06-01']] }),
    )!;
    const result = dedupeLatestCalendarEvents([older, newer]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('New');
  });

  it('keeps events from different authors with the same d tag separate', () => {
    const a = parseCalendarEvent(
      makeEvent({ pubkey: 'alice', tags: [['d', 'a'], ['title', 'Alice event'], ['start', '2026-06-01']] }),
    )!;
    const b = parseCalendarEvent(
      makeEvent({ pubkey: 'bob', tags: [['d', 'a'], ['title', 'Bob event'], ['start', '2026-06-01']] }),
    )!;
    expect(dedupeLatestCalendarEvents([a, b])).toHaveLength(2);
  });
});

describe('calendarEventKey', () => {
  it('combines kind, pubkey and d tag', () => {
    const parsed = parseCalendarEvent(
      makeEvent({ pubkey: 'alice', kind: DATE_BASED_KIND, tags: [['d', 'a'], ['title', 'T'], ['start', '2026-06-01']] }),
    )!;
    expect(calendarEventKey(parsed)).toBe(`${DATE_BASED_KIND}:alice:a`);
  });
});

describe('formatEventTimeRange', () => {
  it('formats a single all-day event without a range', () => {
    const parsed = parseCalendarEvent(
      makeEvent({ tags: [['d', 'a'], ['title', 'T'], ['start', '2026-06-01']] }),
    )!;
    expect(formatEventTimeRange(parsed)).not.toContain('–');
  });

  it('formats a multi-day all-day event as a range', () => {
    const parsed = parseCalendarEvent(
      makeEvent({ tags: [['d', 'a'], ['title', 'T'], ['start', '2026-06-01'], ['end', '2026-06-04']] }),
    )!;
    expect(formatEventTimeRange(parsed)).toContain('–');
  });
});
