import { useSeoMeta } from '@unhead/react';
import { ArrowUpRight, Command, Fingerprint, Radio, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OsShell } from '@/components/navigation/OsShell';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { nostrApps } from '@/lib/nostrApps';

const Index = () => {
  const { user } = useCurrentUser();

  useSeoMeta({
    title: 'Nostr OS · Layer Systems',
    description: 'A real desktop environment for your Nostr identity.',
  });

  return (
    <OsShell title="Desktop" eyebrow="Layer Systems / Nostr OS" desktop className="flex min-h-0 flex-col">
      <section className="signal-home relative flex min-h-[calc(100dvh-9.5rem)] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 p-4 shadow-[0_32px_100px_rgba(0,0,0,0.26)] sm:p-6 lg:p-8">
        <div className="pointer-events-none absolute right-[-4%] top-[12%] select-none font-mono text-[clamp(6rem,20vw,20rem)] font-bold leading-none tracking-[-0.12em] text-white/[0.035]">NSTR</div>
        <div className="relative flex items-start justify-between gap-4"><div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2 backdrop-blur-sm"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Signal desk</p><p className="mt-0.5 text-xs text-white/65">Your independent social computer</p></div><button type="button" onClick={() => window.dispatchEvent(new Event('nostr-os:launcher'))} className="hidden items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 font-mono text-[10px] text-white/70 backdrop-blur-sm transition-colors hover:bg-white/10 sm:flex"><Command className="h-3.5 w-3.5" /> Launch app <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white">⌘ K</kbd></button></div>

        <div className="relative mt-8 grid max-w-4xl grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-5 sm:gap-x-5 lg:mt-12 lg:grid-cols-5 xl:gap-x-10">
          {nostrApps.map((app, index) => (
            <Link key={app.path} to={app.path} className="desktop-icon group" style={{ animationDelay: `${90 + index * 55}ms` }}>
              <span className={`desktop-icon-mark desktop-icon-${app.hue}`}><app.icon className="h-7 w-7" /></span>
              <span className="mt-2 block text-center text-xs font-medium text-white drop-shadow-md">{app.name}</span>
              <span className="mt-0.5 block text-center font-mono text-[9px] uppercase tracking-wider text-white/45">App</span>
            </Link>
          ))}
        </div>

        <div className="relative mt-auto grid gap-3 pt-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md sm:p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><Fingerprint className="h-5 w-5" /></span><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Your identity</p><p className="mt-1 text-sm font-medium text-white">{user ? 'Signer connected' : 'Ready when you are'}</p><p className="mt-1 max-w-lg text-xs leading-5 text-white/60">{user ? `${user.pubkey.slice(0, 16)}…${user.pubkey.slice(-8)}` : 'Log in with a Nostr signer from the menu bar. Your key stays in your wallet or extension.'}</p></div></div></div>
          <Link to="/network" className="group rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md transition-colors hover:bg-white/[0.08] sm:p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-medium text-white"><Radio className="h-4 w-4 text-emerald-300" /> Network online</div><ArrowUpRight className="h-4 w-4 text-white/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div><p className="mt-4 font-mono text-[11px] text-emerald-200">wss://relay.layer.systems</p><p className="mt-1 text-xs text-white/55">Preferred signal route</p></Link>
        </div>
        <div className="pointer-events-none absolute bottom-4 right-5 hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30 lg:flex"><Sparkles className="h-3 w-3" /> Make the network yours</div>
      </section>
    </OsShell>
  );
};

export default Index;
