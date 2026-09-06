import { useRef } from 'react';
import type { ParsedCalendarEvent } from '@/lib/calendarEvents';
import { localDateKey } from '@/lib/calendarEvents';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { monthGridRange } from './monthGridRange';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** How many event pills a cell shows before collapsing into "+N more". */
const MAX_VISIBLE_PILLS = 3;

function buildWeeks(monthAnchor: Date): Date[][] {
  const { start: gridStart, end: gridEndExclusive } = monthGridRange(monthAnchor);
  const gridEnd = new Date(gridEndExclusive.getTime() - 1);

  const days: Date[] = [];
  for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    days.push(new Date(cursor));
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export interface MonthGridProps {
  /** Any date within the month to display; only the year/month are used. */
  monthAnchor: Date;
  today: Date;
  selectedDate: string | undefined;
  eventsByDay: Map<string, ParsedCalendarEvent[]>;
  isLoading: boolean;
  onSelectDate: (key: string, options?: { focus?: boolean }) => void;
  onShiftMonth: (delta: number) => void;
}

export function MonthGrid({
  monthAnchor,
  today,
  selectedDate,
  eventsByDay,
  isLoading,
  onSelectDate,
  onShiftMonth,
}: MonthGridProps) {
  const weeks = buildWeeks(monthAnchor);
  const monthIndex = monthAnchor.getMonth();
  const todayKey = localDateKey(today);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  // Exactly one cell must be tab-focusable, or a keyboard user who tabs away
  // and back can never re-enter the grid. Prefer the selected day — but only
  // when it's actually one of the rendered cells: `selectedDate` survives
  // month navigation (so the agenda can keep showing it), so after Prev/Next/
  // PageUp/PageDown it commonly points outside the newly displayed grid.
  // Otherwise prefer today if it's in the displayed month, and only
  // otherwise fall back to the 1st.
  const selectedInView = selectedDate ? weeks.some((week) => week.some((date) => localDateKey(date) === selectedDate)) : false;
  const isTodayInMonth = today.getFullYear() === monthAnchor.getFullYear() && today.getMonth() === monthIndex;
  const focusKey = selectedInView
    ? selectedDate!
    : isTodayInMonth
      ? todayKey
      : localDateKey(new Date(monthAnchor.getFullYear(), monthIndex, 1));

  const focusDate = (date: Date) => {
    const key = localDateKey(date);
    onSelectDate(key, { focus: true });
    requestAnimationFrame(() => cellRefs.current.get(key)?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent, date: Date) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in deltas) {
      event.preventDefault();
      const next = new Date(date);
      next.setDate(next.getDate() + deltas[event.key]);
      focusDate(next);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      const next = new Date(date);
      next.setDate(next.getDate() - date.getDay());
      focusDate(next);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const next = new Date(date);
      next.setDate(next.getDate() + (6 - date.getDay()));
      focusDate(next);
      return;
    }
    if (event.key === 'PageUp') {
      event.preventDefault();
      onShiftMonth(event.shiftKey ? -12 : -1);
      return;
    }
    if (event.key === 'PageDown') {
      event.preventDefault();
      onShiftMonth(event.shiftKey ? 12 : 1);
    }
  };

  return (
    <div role="grid" aria-label="Month" className="flex h-full min-h-0 flex-col" aria-hidden={isLoading || undefined}>
      <div
        role="row"
        className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium text-muted-foreground"
      >
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} role="columnheader" className="py-1.5" aria-label={label}>
            <span aria-hidden>{label}</span>
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-7 divide-x divide-y divide-border">
        {isLoading
          ? Array.from({ length: weeks.length * 7 }).map((_, index) => (
              <div key={index} className="p-1.5">
                <Skeleton className="h-full w-full" />
              </div>
            ))
          : weeks.map((week, weekIndex) => (
              <div key={weekIndex} role="row" className="col-span-7 grid grid-cols-7">
                {week.map((date) => {
                  const key = localDateKey(date);
                  const events = eventsByDay.get(key) ?? [];
                  const isCurrentMonth = date.getMonth() === monthIndex;
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;
                  const isFocusable = key === focusKey;

                  return (
                    <button
                      key={key}
                      ref={(el) => {
                        if (el) cellRefs.current.set(key, el);
                        else cellRefs.current.delete(key);
                      }}
                      type="button"
                      role="gridcell"
                      aria-selected={isSelected}
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${events.length ? `, ${events.length} ${events.length === 1 ? 'event' : 'events'}` : ', no events'}`}
                      tabIndex={isFocusable ? 0 : -1}
                      onClick={() => onSelectDate(key)}
                      onKeyDown={(event) => handleKeyDown(event, date)}
                      className={cn(
                        'flex min-h-16 flex-col items-stretch gap-1 p-1.5 text-left transition-colors sm:min-h-24',
                        'focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                        isCurrentMonth ? 'bg-background hover:bg-muted/60' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50',
                        isSelected && 'bg-accent hover:bg-accent',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-medium',
                          isToday && 'bg-primary text-primary-foreground',
                        )}
                      >
                        {date.getDate()}
                      </span>

                      <span className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                        {events.slice(0, MAX_VISIBLE_PILLS).map((calEvent) => (
                          <EventPill key={`${calEvent.kind}:${calEvent.event.pubkey}:${calEvent.id}`} event={calEvent} />
                        ))}
                        {events.length > MAX_VISIBLE_PILLS && (
                          <span className="hidden truncate text-[10px] font-medium text-muted-foreground sm:block">
                            +{events.length - MAX_VISIBLE_PILLS} more
                          </span>
                        )}
                        {events.length > 0 && (
                          <span className="mt-auto flex items-center gap-0.5 sm:hidden" aria-hidden>
                            {events.slice(0, MAX_VISIBLE_PILLS).map((calEvent, i) => (
                              <span
                                key={i}
                                className={cn(
                                  'size-1.5 rounded-full',
                                  calEvent.allDay ? 'bg-chart-2' : 'bg-primary',
                                )}
                              />
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
      </div>
    </div>
  );
}

/** Purely a visual summary — opening an event happens from the day agenda, which has real buttons instead of interactive elements nested inside this cell's `<button>`. */
function EventPill({ event }: { event: ParsedCalendarEvent }) {
  return (
    <span
      className={cn(
        'hidden truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight sm:block',
        event.allDay ? 'bg-chart-2/20 text-foreground' : 'bg-primary/15 text-foreground',
      )}
    >
      {event.title}
    </span>
  );
}
