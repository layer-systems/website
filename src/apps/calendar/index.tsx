import { useEffect, useMemo, useRef, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { AlertCircle, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import {
  AppBody,
  AppLayout,
  AppSidebar,
  AppSplit,
  AppToolbar,
  EmptyState,
} from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarFilters } from './CalendarFilters';
import { DayAgenda } from './DayAgenda';
import { EventDetail } from './EventDetail';
import { activeFilterCount, DEFAULT_CALENDAR_FILTERS, type CalendarFilterState } from './filterState';
import { MonthGrid } from './MonthGrid';
import { monthGridRange } from './monthGridRange';
import {
  useCalendarEvent,
  useCalendarEvents,
  useEventsByDay,
  useSearchedCalendarEvents,
} from '@/hooks/useCalendarEvents';
import { useIsMobile } from '@/hooks/useIsMobile';
import { localDateKey, type ParsedCalendarEvent } from '@/lib/calendarEvents';
import { decodeRelayHints } from '@/lib/nostrUtils';
import type { AppParams, AppProps } from '@/os/types';

const MONTH_PARAM_RE = /^(\d{4})-(\d{2})$/;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseMonthParam(value: string | undefined): Date | undefined {
  const match = value ? MONTH_PARAM_RE.exec(value) : null;
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function monthParamValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** A hex pubkey, or an npub/nprofile decoded down to one — anything else is not a usable author filter. */
function resolveAuthorInput(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // fall through to "invalid"
  }
  return undefined;
}

function withoutKeys(params: AppParams, keys: string[]): AppParams {
  const next = { ...params };
  for (const key of keys) delete next[key];
  return next;
}

export default function CalendarApp({ params, setTitle, setParams }: AppProps) {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<CalendarFilterState>(DEFAULT_CALENDAR_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const today = useMemo(() => new Date(), []);

  const monthAnchor = useMemo(() => parseMonthParam(params.month) ?? startOfMonth(today), [params.month, today]);
  const selectedDateKey = params.day;
  const { start: rangeStart, end: rangeEnd } = useMemo(() => monthGridRange(monthAnchor), [monthAnchor]);

  const resolvedAuthor = useMemo(() => resolveAuthorInput(filters.authorInput), [filters.authorInput]);
  const authorError = filters.authorInput.trim().length > 0 && !resolvedAuthor;

  const eventsQuery = useCalendarEvents(rangeStart, rangeEnd, {
    eventType: filters.eventType,
    authors: resolvedAuthor ? [resolvedAuthor] : undefined,
  });
  const searchedEvents = useSearchedCalendarEvents(eventsQuery.data, filters.search);
  const eventsByDay = useEventsByDay(searchedEvents);

  const selectedDayEvents = selectedDateKey ? (eventsByDay.get(selectedDateKey) ?? []) : [];
  const selectedDate = selectedDateKey ? dateFromKey(selectedDateKey) : undefined;

  // The deep-linked/opened event: fetched directly by coordinates so a
  // shared link resolves even when the event falls outside the currently
  // loaded month.
  const openEventKind = params.kind ? Number(params.kind) : undefined;
  const detailQuery = useCalendarEvent(params.pubkey, openEventKind, params.identifier, decodeRelayHints(params.relays));

  useEffect(() => {
    setTitle(detailQuery.data ? `Calendar — ${detailQuery.data.title}` : 'Calendar');
  }, [detailQuery.data, setTitle]);

  // A fresh naddr deep link boots with no `month`/`day` yet — once the event
  // resolves, jump the grid to it once, so "back" from the detail view lands
  // somewhere relevant instead of the current month.
  const didInitFromDeepLink = useRef(false);
  useEffect(() => {
    if (didInitFromDeepLink.current) return;
    if (!detailQuery.data || params.month) return;
    didInitFromDeepLink.current = true;
    setParams({
      ...params,
      month: monthParamValue(detailQuery.data.start),
      day: localDateKey(detailQuery.data.start),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.data]);

  const goToMonth = (date: Date) => setParams({ ...params, month: monthParamValue(date) });
  const shiftMonth = (delta: number) => {
    const next = new Date(monthAnchor);
    next.setMonth(next.getMonth() + delta);
    goToMonth(next);
  };
  const goToToday = () =>
    setParams({ ...withoutKeys(params, ['pubkey', 'kind', 'identifier', 'relays']), month: monthParamValue(today), day: localDateKey(today) });

  const selectDate = (key: string) => setParams({ ...params, day: key });
  const openEvent = (event: ParsedCalendarEvent) =>
    setParams({ ...params, pubkey: event.event.pubkey, kind: String(event.kind), identifier: event.id });
  const closeEvent = () => setParams(withoutKeys(params, ['pubkey', 'kind', 'identifier', 'relays']));
  const closeDay = () => setParams(withoutKeys(params, ['day', 'pubkey', 'kind', 'identifier', 'relays']));

  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const filterCount = activeFilterCount(filters, Boolean(resolvedAuthor));
  const showingEmptyState =
    !eventsQuery.isLoading && !eventsQuery.isError && (eventsQuery.data?.length ?? 0) === 0;
  const showingFilteredEmpty =
    !eventsQuery.isLoading &&
    !eventsQuery.isError &&
    (eventsQuery.data?.length ?? 0) > 0 &&
    (searchedEvents?.length ?? 0) === 0;

  const monthNav = (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" className="size-7" onClick={() => shiftMonth(-1)} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-28 text-center text-[13px] font-medium">{monthLabel}</span>
      <Button variant="ghost" size="icon" className="size-7" onClick={() => shiftMonth(1)} aria-label="Next month">
        <ChevronRight className="size-4" />
      </Button>
      <Button variant="outline" size="sm" className="ml-1 h-7 px-2 text-xs" onClick={goToToday}>
        Today
      </Button>
    </div>
  );

  const grid = eventsQuery.isError ? (
    <QueryErrorState onRetry={() => eventsQuery.refetch()} />
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      {(showingEmptyState || showingFilteredEmpty) && (
        <p className="shrink-0 border-b border-border bg-muted/40 px-3 py-1.5 text-center text-xs text-muted-foreground">
          {showingFilteredEmpty ? 'No events match your filters.' : 'No calendar events found on your relays for this month.'}
        </p>
      )}
      <MonthGrid
        monthAnchor={monthAnchor}
        today={today}
        selectedDate={selectedDateKey}
        eventsByDay={eventsByDay}
        isLoading={eventsQuery.isLoading}
        onSelectDate={selectDate}
        onShiftMonth={shiftMonth}
      />
    </div>
  );

  const detailPane = detailQuery.isLoading ? (
    <div className="space-y-4 p-5">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  ) : detailQuery.data ? (
    <EventDetail event={detailQuery.data} />
  ) : (
    <EmptyState title="Event not found" hint="None of your relays returned this calendar event." />
  );

  const agendaPane = params.pubkey ? (
    detailPane
  ) : (
    <DayAgenda date={selectedDate} events={selectedDayEvents} isLoading={eventsQuery.isLoading} onOpenEvent={openEvent} />
  );

  if (isMobile) {
    const level = params.pubkey ? 'detail' : selectedDateKey ? 'agenda' : 'grid';
    return (
      <AppLayout>
        <AppToolbar>
          {level === 'grid' ? (
            monthNav
          ) : (
            <button
              type="button"
              onClick={level === 'detail' ? closeEvent : closeDay}
              className="-ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
              {level === 'detail' ? 'Day' : 'Calendar'}
            </button>
          )}
          {level === 'grid' && (
            <Button
              variant="ghost"
              size="icon"
              className="relative ml-auto size-7"
              onClick={() => setMobileFiltersOpen(true)}
              aria-label={`Filters${filterCount > 0 ? ` (${filterCount} active)` : ''}`}
            >
              <SlidersHorizontal className="size-4" />
              {filterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                  {filterCount}
                </span>
              )}
            </Button>
          )}
        </AppToolbar>
        <AppBody className={level === 'grid' ? 'overflow-hidden' : undefined}>
          {level === 'grid' ? grid : agendaPane}
        </AppBody>

        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Narrow down which calendar events are shown.</SheetDescription>
            </SheetHeader>
            <CalendarFilters filters={filters} onChange={setFilters} authorError={authorError} resolvedAuthor={resolvedAuthor} />
          </SheetContent>
        </Sheet>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppToolbar>
        {monthNav}
        <span className="ml-auto text-[11px] text-muted-foreground" aria-live="polite">
          {eventsQuery.isFetching && !eventsQuery.isLoading ? 'Refreshing…' : null}
        </span>
      </AppToolbar>
      <AppSplit>
        <AppSidebar className="p-0">
          <CalendarFilters filters={filters} onChange={setFilters} authorError={authorError} resolvedAuthor={resolvedAuthor} />
        </AppSidebar>
        <div className="min-h-0 flex-1">{grid}</div>
        <aside className="os-scroll w-72 shrink-0 overflow-y-auto border-l border-border">
          {params.pubkey && (
            <button
              type="button"
              onClick={closeEvent}
              className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              Back to day
            </button>
          )}
          {agendaPane}
        </aside>
      </AppSplit>
    </AppLayout>
  );
}

function dateFromKey(key: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function QueryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertCircle className="size-8 text-destructive" aria-hidden />
      <p className="text-sm font-medium">Couldn't load calendar events</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        None of your relays responded in time. Check your connection and try again.
      </p>
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
