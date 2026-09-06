import type { CalendarEventTypeFilter } from '@/hooks/useCalendarEvents';

export interface CalendarFilterState {
  eventType: CalendarEventTypeFilter;
  /** Raw user input — an npub, nprofile, hex pubkey, or invalid text. */
  authorInput: string;
  search: string;
}

export const DEFAULT_CALENDAR_FILTERS: CalendarFilterState = {
  eventType: 'all',
  authorInput: '',
  search: '',
};

/**
 * Number of filters actually narrowing the result set. An author input that
 * hasn't resolved to a usable pubkey has no effect on the query — it's
 * reported inline as a validation error, not counted or chipped as active —
 * so callers pass whether it currently resolves.
 */
export function activeFilterCount(filters: CalendarFilterState, authorResolved: boolean): number {
  let count = 0;
  if (filters.eventType !== 'all') count++;
  if (authorResolved) count++;
  if (filters.search.trim()) count++;
  return count;
}
