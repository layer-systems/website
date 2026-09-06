import { useMemo } from 'react';
import { Check, Moon, Sun, Zap } from 'lucide-react';
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LoginArea } from '@/components/auth/LoginArea';
import { MenuBarClock } from './MenuBarClock';
import { useWindowManager } from '@/os/useWindowManager';
import { APPS, getApp } from '@/os/registry';
import { MENUBAR_HEIGHT } from '@/os/layout';
import { useTheme } from '@/hooks/useTheme';
import { useRelayStatus } from '@/hooks/useRelayStatus';
import { cn } from '@/lib/utils';

const TRIGGER_CLASS =
  'h-6 rounded px-2 text-[13px] font-normal data-[state=open]:bg-foreground/10';

interface MenuBarProps {
  onOpenCommandPalette: () => void;
}

/**
 * The macOS-style bar. Its left half is the application menu — the name of the
 * focused window, in bold — which is what makes the whole thing read as an OS
 * rather than a website header.
 */
export function MenuBar({ onOpenCommandPalette }: MenuBarProps) {
  const {
    windows,
    focusedId,
    openApp,
    closeWindow,
    focusWindow,
    restoreWindow,
    minimizeWindow,
    toggleMaximize,
    minimizeAll,
    closeAll,
    resetSession,
  } = useWindowManager();

  const focused = useMemo(
    () => windows.find((win) => win.id === focusedId),
    [windows, focusedId],
  );
  const focusedApp = focused ? getApp(focused.appId) : undefined;

  return (
    <header
      className="os-menubar-surface fixed inset-x-0 top-0 z-100 flex items-center justify-between gap-2 border-b border-os-window-border/60 px-2 text-[13px]"
      style={{ height: MENUBAR_HEIGHT }}
    >
      <Menubar className="h-auto gap-0 border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className={cn(TRIGGER_CLASS, 'px-2')} aria-label="System menu">
            <Zap className="size-3.5 text-primary" aria-hidden />
          </MenubarTrigger>
          <MenubarContent align="start" className="w-56">
            <MenubarItem onSelect={() => openApp('about')}>About this system</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={() => openApp('settings')}>
              Settings…
              <MenubarShortcut>⌘,</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onSelect={() => openApp('relays')}>Relays…</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={onOpenCommandPalette}>
              Search apps…
              <MenubarShortcut>⌘K</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={resetSession}>Reset session</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className={cn(TRIGGER_CLASS, 'font-semibold')}>
            {focusedApp?.title ?? 'Desktop'}
          </MenubarTrigger>
          <MenubarContent align="start" className="w-56">
            {focused && focusedApp ? (
              <>
                <MenubarItem onSelect={() => toggleMaximize(focused.id)}>
                  {focused.maximized ? 'Restore size' : 'Fill the screen'}
                </MenubarItem>
                <MenubarItem onSelect={() => minimizeWindow(focused.id)}>
                  Minimize
                  <MenubarShortcut>⌘M</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onSelect={() => closeWindow(focused.id)}>
                  Close
                  <MenubarShortcut>⌘W</MenubarShortcut>
                </MenubarItem>
              </>
            ) : (
              <MenubarItem disabled>No window focused</MenubarItem>
            )}
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className={TRIGGER_CLASS}>Go</MenubarTrigger>
          <MenubarContent align="start" className="w-56">
            {APPS.map((app) => (
              <MenubarItem key={app.id} onSelect={() => openApp(app.id)}>
                <app.icon className="size-4 opacity-70" aria-hidden />
                {app.title}
              </MenubarItem>
            ))}
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className={TRIGGER_CLASS}>Window</MenubarTrigger>
          <MenubarContent align="start" className="w-64">
            {windows.length === 0 ? (
              <MenubarItem disabled>No open windows</MenubarItem>
            ) : (
              <>
                {[...windows].reverse().map((win) => (
                  <MenubarCheckboxItem
                    key={win.id}
                    checked={win.id === focusedId}
                    // Picking a minimized window has to bring it back, not just
                    // raise something the user cannot see.
                    onSelect={() =>
                      win.minimized ? restoreWindow(win.id) : focusWindow(win.id)
                    }
                  >
                    <span className={cn('truncate', win.minimized && 'text-muted-foreground')}>
                      {win.title}
                    </span>
                    {win.minimized && (
                      <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                        hidden
                      </span>
                    )}
                  </MenubarCheckboxItem>
                ))}
                <MenubarSeparator />
                <MenubarItem onSelect={minimizeAll}>Minimize all</MenubarItem>
                <MenubarItem onSelect={closeAll}>Close all</MenubarItem>
              </>
            )}
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="flex items-center gap-3 pr-1 text-muted-foreground">
        <RelayIndicator onOpen={() => openApp('relays')} />
        <ThemeToggle />
        <MenuBarClock />
        <LoginArea compact />
      </div>
    </header>
  );
}

function RelayIndicator({ onOpen }: { onOpen: () => void }) {
  const { relays, connected } = useRelayStatus();
  const total = relays.length;

  // Relays are opened lazily, so "none connected" usually means "nothing to
  // fetch right now" rather than a fault — it stays neutral, not alarming.
  const tone = connected === 0 ? 'bg-muted-foreground/40' : 'bg-success';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 tabular-nums hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`${connected} of ${total} relays connected. Open the Relays app.`}
        >
          <span className={cn('size-2 rounded-full', tone)} aria-hidden />
          <span className="hidden text-xs md:inline">
            {connected}/{total}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {connected} of {total} relays connected
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <Menubar className="h-auto border-0 bg-transparent p-0 shadow-none">
      <MenubarMenu>
        <MenubarTrigger className="h-6 rounded px-1.5 data-[state=open]:bg-foreground/10" aria-label="Appearance">
          {isDark ? <Moon className="size-3.5" aria-hidden /> : <Sun className="size-3.5" aria-hidden />}
        </MenubarTrigger>
        <MenubarContent align="end" className="w-40">
          {(['light', 'dark', 'system'] as const).map((option) => (
            <MenubarItem key={option} onSelect={() => setTheme(option)} className="capitalize">
              {option}
              {theme === option && <Check className="ml-auto size-4" aria-hidden />}
            </MenubarItem>
          ))}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
