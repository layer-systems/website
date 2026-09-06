import { CalendarClock, CalendarDays, MapPin } from 'lucide-react';
import type { ParsedCalendarEvent } from '@/lib/calendarEvents';
import { calendarEventKey } from '@/lib/calendarEvents';
import { EmptyState } from '@/components/os/AppChrome';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function agendaTime(event: ParsedCalendarEvent): string {
  if (event.allDay) return 'All day';
  return event.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export interface DayAgendaProps {
  date: Date | undefined;
  events: ParsedCalendarEvent[];
  isLoading: boolean;
  onOpenEvent: (event: ParsedCalendarEvent) => void;
}

export function DayAgenda({ date, events, isLoading, onOpenEvent }: DayAgendaProps) {
  if (!date) {
    return (
      <EmptyState
        title="Pick a day"
        hint="Select a date on the calendar to see what's happening."
      />
    );
  }

  const heading = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold">{heading}</h2>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No events on this day.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {events.map((event) => (
            <li key={calendarEventKey(event)}>
              <AgendaRow event={event} onSelect={() => onOpenEvent(event)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgendaRow({ event, onSelect }: { event: ParsedCalendarEvent; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-md p-2 text-left transition-colors',
        'hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
          event.allDay ? 'bg-chart-2/20' : 'bg-primary/15',
        )}
        aria-hidden
      >
        {event.allDay ? <CalendarDays className="size-3.5" /> : <CalendarClock className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-snug">{event.title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{agendaTime(event)}</span>
        {event.locations[0] && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{event.locations[0]}</span>
          </span>
        )}
      </span>
    </button>
  );
}
