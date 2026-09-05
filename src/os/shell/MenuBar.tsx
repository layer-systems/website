import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoginArea } from '@/components/auth/LoginArea';
import { useRelayStatus } from '@/hooks/useRelayStatus';
import { cn } from '@/lib/utils';
import { useWindowManager } from '../window-manager/useWindowManager';
import { findAppById } from '../apps/registry';
import { MENU_BAR_HEIGHT } from '../window-manager/Window';

function relayStatusLabel(status: 'connecting' | 'online' | 'offline') {
  switch (status) {
    case 'online':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'offline':
      return 'Offline';
  }
}

function relayStatusColor(status: 'connecting' | 'online' | 'offline') {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'connecting':
      return 'bg-yellow-500 animate-pulse';
    case 'offline':
      return 'bg-destructive';
  }
}

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="tabular-nums text-xs text-muted-foreground hidden sm:inline">
      {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </span>
  );
}

export function MenuBar() {
  const { windows, zOrder, focusedAppId, focusApp } = useWindowManager();
  const { status, url } = useRelayStatus();
  const openAppIds = zOrder.filter((id) => windows[id]);
  const relayHost = url?.replace(/^wss?:\/\//, '') ?? 'no relay';

  return (
    <header
      role="banner"
      style={{ height: MENU_BAR_HEIGHT }}
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/85 px-3 backdrop-blur-md"
    >
      <div className="flex items-center gap-1 min-w-0">
        <Link to="/" className="flex items-center gap-1.5 px-1.5 font-semibold tracking-tight shrink-0" aria-label="LAYER.systems home">
          <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-sm">LAYER</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Open windows"
          >
            Windows
            {openAppIds.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                {openAppIds.length}
              </span>
            )}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Open apps</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {openAppIds.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No apps open — try the Dock</div>
            )}
            {openAppIds
              .slice()
              .reverse()
              .map((appId) => {
                const app = findAppById(appId);
                if (!app) return null;
                const win = windows[appId];
                const Icon = app.icon;
                return (
                  <DropdownMenuItem key={appId} onSelect={() => focusApp(appId)} className="gap-2">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className={cn('flex-1', focusedAppId === appId && 'font-medium')}>{app.title}</span>
                    {win.minimized && <span className="text-[10px] text-muted-foreground">minimized</span>}
                  </DropdownMenuItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2 text-xs" aria-live="polite">
        <span className={cn('h-2 w-2 rounded-full shrink-0', relayStatusColor(status))} aria-hidden="true" />
        <span className="text-muted-foreground hidden sm:inline">
          {relayStatusLabel(status)} · {relayHost}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Clock />
        {/* The menu bar is compact real estate, so only show "Log in" here —
            LoginDialog itself offers a path to sign up. */}
        <LoginArea className="max-w-[140px] scale-90 origin-right [&_button:nth-of-type(2)]:hidden" />
      </div>
    </header>
  );
}
