import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Command, Grid2X2, Maximize2, Minimize2, Radio, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LoginArea } from '@/components/auth/LoginArea';
import { cn } from '@/lib/utils';
import { nostrApps } from '@/lib/nostrApps';

interface OsShellProps {
  children: ReactNode;
  title: string;
  eyebrow?: string;
  className?: string;
  desktop?: boolean;
}

function useClock() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(time);
}

export function OsShell({ children, title, eyebrow = 'Nostr operating system', className, desktop = false }: OsShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const time = useClock();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const currentApp = useMemo(
    () => nostrApps.find((app) => location.pathname === app.path) ?? (desktop ? undefined : nostrApps[0]),
    [desktop, location.pathname],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setLauncherOpen((open) => !open);
      }
      if (event.key === 'Escape') setLauncherOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    const openLauncher = () => setLauncherOpen(true);
    window.addEventListener('nostr-os:launcher', openLauncher);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('nostr-os:launcher', openLauncher);
    };
  }, []);

  const launch = (path: string) => {
    setLauncherOpen(false);
    setMinimized(false);
    navigate(path);
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || window.innerWidth < 1024 || maximized) return;
    const start = { x: event.clientX, y: event.clientY, position };
    const move = (moveEvent: PointerEvent) => {
      setPosition({ x: start.position.x + moveEvent.clientX - start.x, y: start.position.y + moveEvent.clientY - start.y });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  return (
    <div className="signal-desktop min-h-dvh overflow-hidden bg-[#090b12] text-foreground">
      <div className="signal-wallpaper pointer-events-none fixed inset-0" aria-hidden="true"><span className="signal-orb signal-orb-one" /><span className="signal-orb signal-orb-two" /><span className="signal-grid" /></div>
      <header className="signal-menubar fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between border-b border-white/10 px-3 text-white sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button type="button" onClick={() => setLauncherOpen(true)} aria-label="Open application launcher" className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Radio className="h-4 w-4" /></button>
          <Link to="/" className="hidden font-mono text-[11px] font-semibold tracking-[0.16em] text-white sm:block">NSTR / OS</Link>
          <span className="hidden h-4 w-px bg-white/15 sm:block" />
          <p className="truncate text-xs text-white/70">{desktop ? 'Desktop' : title}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3"><Link to="/network" className="hidden items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] text-emerald-200 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />relay.layer.systems</Link><span className="font-mono text-[11px] text-white/70">{time}</span><LoginArea className="max-w-[205px]" /></div>
      </header>

      <div className="relative z-10 flex min-h-dvh flex-col pb-24 pt-11 lg:pb-28">
        <main className={cn('signal-workspace flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8', className)}>
          {desktop ? (
            children
          ) : minimized ? (
            <div className="grid min-h-[calc(100dvh-11rem)] place-items-center text-center text-white/60"><div><Minimize2 className="mx-auto mb-3 h-6 w-6 text-primary" /><p className="text-sm">{title} is minimized</p><button type="button" onClick={() => setMinimized(false)} className="mt-4 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white hover:bg-white/[0.12]">Restore window</button></div></div>
          ) : (
            <section className={cn('signal-window mx-auto flex min-h-[calc(100dvh-9.5rem)] max-w-[1540px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-background/95 shadow-[0_32px_100px_rgba(0,0,0,0.48)] backdrop-blur-2xl', maximized && 'max-w-none rounded-none')} style={maximized ? undefined : { transform: `translate(${position.x}px, ${position.y}px)` }}>
              <div onPointerDown={beginDrag} className="signal-titlebar flex h-11 shrink-0 touch-none items-center justify-between border-b border-border/70 bg-card/80 px-3 sm:px-4" title="Drag window">
                <div className="flex min-w-0 items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-md bg-primary/15 text-primary">{currentApp ? <currentApp.icon className="h-3 w-3" /> : <Grid2X2 className="h-3 w-3" />}</span><div className="min-w-0"><span className="block truncate text-xs font-medium">{title}</span><span className="hidden font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground sm:block">{eyebrow}</span></div></div>
                <div className="flex items-center gap-1"><button type="button" onClick={() => setMinimized(true)} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Minimize window"><Minimize2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setMaximized((value) => !value)} className="hidden h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:grid" aria-label="Maximize window"><Maximize2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => navigate('/')} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500 hover:text-white" aria-label="Close window"><X className="h-3.5 w-3.5" /></button></div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </section>
          )}
        </main>
      </div>

      <nav className="signal-dock fixed bottom-3 left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/15 bg-[#111521]/85 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-2xl" aria-label="Application dock">
        <button type="button" onClick={() => setLauncherOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Open launcher"><Command className="h-4 w-4" /></button>
        <span className="h-7 w-px shrink-0 bg-white/10" />
        <button type="button" onClick={() => launch('/')} className={cn('dock-app', desktop && 'dock-app-active')} aria-label="Open desktop"><Grid2X2 className="h-[18px] w-[18px]" /><span className="dock-tooltip">Desktop</span></button>
        {nostrApps.map((app) => <button key={app.path} type="button" onClick={() => launch(app.path)} className={cn('dock-app', location.pathname === app.path && !minimized && 'dock-app-active')} aria-label={`Open ${app.name}`}><app.icon className="h-[18px] w-[18px]" /><span className="dock-tooltip">{app.name}</span></button>)}
      </nav>

      {launcherOpen && (
        <div className="signal-launcher fixed inset-0 z-[60] grid place-items-end bg-black/55 p-3 backdrop-blur-sm sm:place-items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Application launcher" onMouseDown={() => setLauncherOpen(false)}>
          <section className="w-full max-w-xl rounded-[26px] border border-white/15 bg-[#151a27]/95 p-4 shadow-2xl shadow-black/70 backdrop-blur-2xl sm:p-5" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Nostr OS</p><h2 className="mt-1 text-xl font-semibold text-white">Applications</h2></div><button type="button" onClick={() => setLauncherOpen(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close launcher"><X className="h-4 w-4" /></button></div>
            <button type="button" onClick={() => launch('/')} className="launcher-app mb-2"><span className="launcher-icon launcher-icon-slate"><Grid2X2 className="h-5 w-5" /></span><span><strong>Desktop</strong><small>Return to your signal desk</small></span></button>
            <div className="grid gap-2 sm:grid-cols-2">{nostrApps.map((app) => <button key={app.path} type="button" onClick={() => launch(app.path)} className="launcher-app"><span className={`launcher-icon launcher-icon-${app.hue}`}><app.icon className="h-5 w-5" /></span><span><strong>{app.name}</strong><small>{app.detail}</small></span></button>)}</div>
            <p className="mt-4 text-center font-mono text-[10px] text-white/35">⌘ K to toggle launcher · ESC to close</p>
          </section>
        </div>
      )}
    </div>
  );
}
