import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useWindowManager } from '../window-manager/useWindowManager';
import { APPS, defaultBoundsFor } from '../apps/registry';

interface DockProps {
  /** Renders as a bottom tab bar with larger touch targets for small screens. */
  compact?: boolean;
}

export function Dock({ compact = false }: DockProps) {
  const { windows, openApp, focusApp } = useWindowManager();

  const handleActivate = (appId: string, index: number) => {
    if (windows[appId]) {
      focusApp(appId);
    } else {
      const app = APPS[index];
      openApp(appId, defaultBoundsFor(app, Object.keys(windows).length));
    }
  };

  return (
    <nav
      aria-label="App dock"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-end justify-center',
        compact ? 'pb-[env(safe-area-inset-bottom)]' : 'pb-2',
      )}
    >
      <div
        className={cn(
          'flex items-end gap-1 rounded-2xl border border-border/60 bg-background/85 backdrop-blur-md shadow-lg',
          compact ? 'w-full justify-around rounded-none border-x-0 border-b-0 py-2' : 'px-2 py-1.5 mb-2',
        )}
      >
        {APPS.map((app, index) => {
          const Icon = app.icon;
          const isOpen = !!windows[app.id];
          const isMinimized = windows[app.id]?.minimized;
          return (
            <Tooltip key={app.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={isOpen ? `Switch to ${app.title}` : `Open ${app.title}`}
                  aria-pressed={isOpen && !isMinimized}
                  onClick={() => handleActivate(app.id, index)}
                  className={cn(
                    'group relative flex flex-col items-center justify-center rounded-xl transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    compact ? 'h-12 w-14' : 'h-12 w-12 hover:bg-accent/50',
                  )}
                >
                  <Icon className={cn('text-primary', compact ? 'h-6 w-6' : 'h-6 w-6')} aria-hidden="true" />
                  {compact && <span className="mt-0.5 text-[10px] text-muted-foreground">{app.title}</span>}
                  {isOpen && (
                    <span
                      className={cn(
                        'absolute rounded-full bg-primary',
                        compact ? 'bottom-0.5 h-1 w-1' : '-bottom-1 h-1 w-1',
                      )}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </TooltipTrigger>
              {!compact && (
                <TooltipContent side="top">
                  <p>{app.title}</p>
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
