import type { ReactNode } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';

import { AppSectionTitle, EmptyState } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Nip86Error } from '@/lib/nip86';
import type { Nip86Session } from '@/hooks/useNip86';

/**
 * Shared building blocks for the management console. Every capability section
 * is the same shape — a toolbar row (search, count, refresh, primary action),
 * then loading skeletons, an error with retry, an honest empty state, or the
 * list — so the shape lives here once.
 */

export interface ConsoleSectionProps {
  session: Nip86Session;
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border pb-4 last:border-b-0">
      <div className="flex items-start justify-between gap-2 pr-3">
        <AppSectionTitle>{title}</AppSectionTitle>
        {actions}
      </div>
      <p className="px-3 pb-2 text-xs text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

export function SectionToolbar({
  search,
  onSearch,
  searchLabel,
  count,
  onRefresh,
  refreshing,
  children,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  searchLabel?: string;
  count?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
      {onSearch && (
        <div className="relative min-w-40 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search ?? ''}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchLabel ?? 'Filter'}
            aria-label={searchLabel ?? 'Filter'}
            className="h-8 pl-7 text-xs"
          />
        </div>
      )}
      {count !== undefined && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {count} {count === 1 ? 'entry' : 'entries'}
        </span>
      )}
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh list"
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} aria-hidden />
          Refresh
        </Button>
      )}
      {children}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-3 py-1" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ListError({ error, onRetry }: { error: Nip86Error; onRetry: () => void }) {
  return (
    <div className="px-3 pb-2">
      <EmptyState
        title="The request failed"
        hint={error.message}
        action={
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}

export function ListEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-3 pb-2">
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
        <span className="block font-medium text-foreground">{title}</span>
        {hint}
      </p>
    </div>
  );
}

/** Row action button: consistent sizing, pending spinner, destructive option. */
export function RowAction({
  label,
  onClick,
  pending,
  destructive,
  disabled,
}: {
  label: string;
  onClick: () => void;
  pending?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant={destructive ? 'destructive' : 'outline'}
      size="sm"
      className="h-7 shrink-0 px-2 text-xs"
      onClick={onClick}
      disabled={pending || disabled}
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {label}
    </Button>
  );
}

/** Mono identifier cell: full value in the tooltip, truncated on screen. */
export function IdText({ value, className }: { value: string; className?: string }) {
  return (
    <span title={value} className={cn('block min-w-0 truncate font-mono text-xs', className)}>
      {value}
    </span>
  );
}
