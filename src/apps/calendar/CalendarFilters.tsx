import { X } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import type { CalendarEventTypeFilter } from '@/hooks/useCalendarEvents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { displayName } from '@/lib/nostrUtils';
import { activeFilterCount, DEFAULT_CALENDAR_FILTERS, type CalendarFilterState } from './filterState';

const EVENT_TYPE_LABELS: Record<CalendarEventTypeFilter, string> = {
  all: 'All events',
  date: 'All-day',
  time: 'Timed',
};

export interface CalendarFiltersProps {
  filters: CalendarFilterState;
  onChange: (filters: CalendarFilterState) => void;
  /** Set when `authorInput` doesn't decode to a usable pubkey. */
  authorError: boolean;
  /** The resolved hex pubkey, when `authorInput` is valid — used to show a friendly name in the active-filter chip. */
  resolvedAuthor: string | undefined;
}

export function CalendarFilters({ filters, onChange, authorError, resolvedAuthor }: CalendarFiltersProps) {
  const count = activeFilterCount(filters, Boolean(resolvedAuthor));
  const set = <K extends keyof CalendarFilterState>(key: K, value: CalendarFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filters</h2>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => onChange(DEFAULT_CALENDAR_FILTERS)}>
            Clear all
          </Button>
        )}
      </div>

      {count > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.eventType !== 'all' && (
            <FilterChip label={EVENT_TYPE_LABELS[filters.eventType]} onClear={() => set('eventType', 'all')} />
          )}
          {resolvedAuthor && <AuthorFilterChip pubkey={resolvedAuthor} onClear={() => set('authorInput', '')} />}
          {filters.search.trim() && (
            <FilterChip label={`"${filters.search.trim()}"`} onClear={() => set('search', '')} />
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Event type</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filters.eventType}
          onValueChange={(value) => value && set('eventType', value as CalendarEventTypeFilter)}
          className="flex w-full"
        >
          <ToggleGroupItem value="all" className="flex-1 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="date" className="flex-1 text-xs">
            All-day
          </ToggleGroupItem>
          <ToggleGroupItem value="time" className="flex-1 text-xs">
            Timed
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="calendar-filter-author" className="text-xs text-muted-foreground">
          Author
        </Label>
        <Input
          id="calendar-filter-author"
          placeholder="npub, nprofile, or hex pubkey"
          value={filters.authorInput}
          onChange={(event) => set('authorInput', event.target.value)}
          aria-invalid={authorError || undefined}
          className="h-8 text-xs"
        />
        {authorError && <p className="text-[11px] text-destructive">Not a valid npub, nprofile, or hex pubkey.</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="calendar-filter-search" className="text-xs text-muted-foreground">
          Search
        </Label>
        <Input
          id="calendar-filter-search"
          placeholder="Title or summary"
          value={filters.search}
          onChange={(event) => set('search', event.target.value)}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1 text-[11px] font-normal">
      <span className="max-w-32 truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-0.5 hover:bg-muted-foreground/20 focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`Clear filter: ${label}`}
      >
        <X className="size-2.5" />
      </button>
    </Badge>
  );
}

function AuthorFilterChip({ pubkey, onClear }: { pubkey: string; onClear: () => void }) {
  const author = useAuthor(pubkey);
  return <FilterChip label={displayName(pubkey, author.data?.metadata)} onClear={onClear} />;
}
