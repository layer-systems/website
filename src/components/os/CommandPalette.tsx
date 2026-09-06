import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useWindowManager } from '@/os/useWindowManager';
import { APPS, getApp } from '@/os/registry';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** ⌘K launcher: open an app, or jump to a window that is already open. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { openApp, windows, focusWindow, restoreWindow } = useWindowManager();

  const run = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Open an app or switch to an open window"
    >
      <CommandInput placeholder="Open an app or switch window…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        {windows.length > 0 && (
          <>
            <CommandGroup heading="Open windows">
              {[...windows].reverse().map((win) => {
                const app = getApp(win.appId);
                if (!app) return null;
                return (
                  <CommandItem
                    key={win.id}
                    value={`window ${win.title} ${app.title}`}
                    onSelect={() =>
                      run(() => (win.minimized ? restoreWindow(win.id) : focusWindow(win.id)))
                    }
                  >
                    <app.icon className="size-4 opacity-70" aria-hidden />
                    <span className="truncate">{win.title}</span>
                    {win.minimized && (
                      <span className="ml-auto text-xs text-muted-foreground">minimized</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Apps">
          {APPS.map((app) => (
            <CommandItem
              key={app.id}
              value={`${app.title} ${app.description}`}
              onSelect={() => run(() => openApp(app.id))}
            >
              <app.icon className="size-4 opacity-70" aria-hidden />
              <div className="min-w-0">
                <div className="truncate">{app.title}</div>
                <div className="truncate text-xs text-muted-foreground">{app.description}</div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
