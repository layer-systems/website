import { useSeoMeta } from '@unhead/react';
import { ArrowUpRight, Boxes, Copy, Fingerprint, Network, Orbit, Sparkles, Terminal, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { OsShell } from '@/components/navigation/OsShell';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const workspaces = [
  { title: 'Discover', detail: 'Live notes & people', path: '/explore', icon: Orbit, tone: 'from-cyan-400/20 to-blue-500/5', index: '01' },
  { title: 'Activity', detail: 'Your Nostr footprint', path: '/dashboard', icon: Waves, tone: 'from-amber-300/20 to-orange-500/5', index: '02' },
  { title: 'Studio', detail: 'Browse your events', path: '/dashboard/events', icon: Sparkles, tone: 'from-fuchsia-400/20 to-violet-500/5', index: '03' },
  { title: 'Archive', detail: 'Export your follows', path: '/dashboard/export', icon: Boxes, tone: 'from-emerald-300/20 to-teal-500/5', index: '04' },
];

const Index = () => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const relayUrl = 'wss://relay.layer.systems';

  useSeoMeta({
    title: 'Nostr OS · Layer Systems',
    description: 'A beautiful operating system for your Nostr identity.',
  });

  const copyRelay = async () => {
    try {
      await navigator.clipboard.writeText(relayUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast({ title: 'Relay address copied', description: 'Paste it into any Nostr client.' });
    } catch {
      toast({ title: 'Could not copy relay address', description: relayUrl, variant: 'destructive' });
    }
  };

  return (
    <OsShell title="Home" eyebrow="Layer Systems / Nostr OS">
      <section className="os-hero relative isolate overflow-hidden rounded-[28px] border border-white/10 px-5 py-7 shadow-2xl shadow-black/10 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Personal signal online
            </div>
            <p className="max-w-xl text-balance text-4xl font-semibold leading-[0.98] tracking-[-0.055em] text-white sm:text-5xl lg:text-6xl">One place for the network that belongs to you.</p>
            <p className="mt-5 max-w-lg text-pretty text-sm leading-6 text-slate-300 sm:text-base">A calm control surface for your Nostr identity: discover public conversations, inspect your signal, and keep your network portable.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={user ? '/dashboard' : '/explore'} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                {user ? 'Open my activity' : 'Enter discover'} <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link to="/network" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <Network className="h-4 w-4" /> Network routes
              </Link>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-sm">
            <div className="mb-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400"><span>Identity</span><Fingerprint className="h-4 w-4 text-primary" /></div>
            <p className="text-lg font-medium text-white">{user ? 'Signer connected' : 'Your Nostr key is waiting'}</p>
            <p className="mt-2 font-mono text-xs leading-5 text-slate-400">{user ? `${user.pubkey.slice(0, 12)}…${user.pubkey.slice(-8)}` : 'Use a signer extension or nsec login to begin.'}</p>
            <div className="mt-7 flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Your identity never leaves your signer</div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Your desktop</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Open an app</h2></div><span className="hidden font-mono text-[10px] text-muted-foreground sm:block">04 MODULES READY</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {workspaces.map((workspace) => (
            <Link key={workspace.path} to={workspace.path} className="group relative min-h-[178px] overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className={`absolute inset-0 bg-gradient-to-br ${workspace.tone} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
              <div className="relative flex h-full flex-col"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background/80"><workspace.icon className="h-5 w-5 text-primary" /></span><span className="font-mono text-[10px] text-muted-foreground">{workspace.index}</span></div><div className="mt-auto"><h3 className="font-semibold">{workspace.title}</h3><p className="mt-1 text-sm text-muted-foreground">{workspace.detail}</p></div></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Terminal className="h-5 w-5" /></span><div><h2 className="font-semibold">Bring Layer Systems with you</h2><p className="text-sm text-muted-foreground">A preferred relay, ready for any Nostr client.</p></div></div><div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between"><code className="min-w-0 truncate font-mono text-sm text-foreground">{relayUrl}</code><button type="button" onClick={copyRelay} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Copy className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Copy relay'}</button></div></div>
        <Link to="/network" className="group rounded-2xl border border-border/70 bg-card/70 p-5 transition-colors hover:border-primary/40 sm:p-6"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Your route table</p><p className="mt-3 text-lg font-semibold">Control what carries your signal.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Manage read and write relays from one focused network app.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">Open Network <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span></Link>
      </section>
    </OsShell>
  );
};

export default Index;
