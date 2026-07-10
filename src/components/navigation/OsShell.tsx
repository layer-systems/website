import type { ReactNode } from 'react';
import { Activity, Archive, Compass, Grid2X2, Network, Radio, Sparkles } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { LoginArea } from '@/components/auth/LoginArea';
import { cn } from '@/lib/utils';

const apps = [
  { name: 'Home', path: '/', icon: Grid2X2, short: 'Home' },
  { name: 'Discover', path: '/explore', icon: Compass, short: 'Find' },
  { name: 'Activity', path: '/dashboard', icon: Activity, short: 'Me' },
  { name: 'Studio', path: '/dashboard/events', icon: Sparkles, short: 'Studio' },
  { name: 'Archive', path: '/dashboard/export', icon: Archive, short: 'Save' },
  { name: 'Network', path: '/network', icon: Network, short: 'Relay' },
];

interface OsShellProps {
  children: ReactNode;
  title: string;
  eyebrow?: string;
  className?: string;
}

export function OsShell({ children, title, eyebrow = 'Nostr operating system', className }: OsShellProps) {
  return (
    <div className="os-shell min-h-dvh bg-background text-foreground">
      <aside className="os-rail fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-white/10 px-3 py-4 lg:flex">
        <Link to="/" className="group mb-8 flex items-center gap-3 px-2" aria-label="Open Nostr OS home">
          <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/0.3)] transition-transform duration-300 group-hover:rotate-6">
            <Radio className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.24em] text-primary">Layer systems</span>
            <span className="block text-lg font-semibold tracking-tight">Nostr / OS</span>
          </span>
        </Link>

        <p className="px-3 pb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Applications</p>
        <nav className="space-y-1" aria-label="Applications">
          {apps.map((app) => (
            <NavLink
              key={app.path}
              to={app.path}
              end={app.path === '/'}
              className={({ isActive }) => cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isActive && 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary hover:text-primary-foreground',
              )}
            >
              <app.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{app.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.035] p-3">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Preferred relay
          </div>
          <Link to="/network" className="block truncate font-mono text-[11px] text-foreground hover:text-primary">
            relay.layer.systems
          </Link>
        </div>
      </aside>

      <div className="min-h-dvh pb-24 lg:ml-[232px] lg:pb-0">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link to="/network" className="hidden items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                relay.layer.systems
              </Link>
              <LoginArea className="max-w-[220px]" />
            </div>
          </div>
        </header>

        <main className={cn('mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8', className)}>{children}</main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-6 rounded-2xl border border-white/10 bg-[hsl(220_18%_10%/0.92)] p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl lg:hidden" aria-label="Mobile applications">
        {apps.map((app) => (
          <NavLink
            key={app.path}
            to={app.path}
            end={app.path === '/'}
            className={({ isActive }) => cn(
              'flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 font-mono text-[9px] uppercase tracking-tight text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isActive && 'bg-primary text-primary-foreground',
            )}
          >
            <app.icon className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{app.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
