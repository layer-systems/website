import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Layout primitives every app is built from. They exist so app content fills
 * its window like an application, instead of centring a column of text like a
 * web page: the toolbar is fixed, only the body scrolls.
 */

export function AppLayout({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>{children}</div>;
}

export function AppToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AppBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('os-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden', className)}>
      {children}
    </div>
  );
}

export function AppSidebar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <aside
      className={cn(
        'os-scroll hidden w-56 shrink-0 overflow-y-auto border-r border-border bg-sidebar p-2 sm:block',
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function AppSplit({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-h-0 flex-1', className)}>{children}</div>;
}

/** Short, action-oriented empty state. No illustrations, no marketing copy. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function AppSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}
