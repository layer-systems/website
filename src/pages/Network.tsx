import { useSeoMeta } from '@unhead/react';
import { ExternalLink, Radio, ShieldCheck, Zap } from 'lucide-react';
import { OsShell } from '@/components/navigation/OsShell';
import { RelayListManager } from '@/components/RelayListManager';

export function Network() {
  useSeoMeta({
    title: 'Network · Nostr OS',
    description: 'Manage the relays that connect your Nostr OS.',
  });

  return (
    <OsShell title="Network" eyebrow="Connection control">
      <section className="mb-7 overflow-hidden rounded-3xl border border-primary/25 bg-primary/[0.07] p-5 shadow-[0_20px_70px_hsl(var(--primary)/0.08)] sm:p-7">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Radio className="h-5 w-5" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Layer systems relay</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Your signal starts here.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">Nostr OS ships with Layer Systems as its preferred relay. Keep it enabled for a fast, simple default, then add the relays your identity already trusts.</p>
          </div>
          <a href="https://relay.layer.systems" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/50 hover:text-primary md:self-auto">
            Visit relay <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-3xl border border-border/70 bg-card/70 p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Relay routes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Read, write, and publish your NIP-65 relay preferences.</p>
            </div>
            <span className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Ready</span>
          </div>
          <RelayListManager />
        </section>

        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-3xl border border-border/70 bg-card/70 p-5">
            <ShieldCheck className="mb-4 h-5 w-5 text-primary" />
            <h3 className="font-semibold">Your keys stay yours</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Login uses your Nostr signer. Relay preferences are only published after you choose to change them.</p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-card/70 p-5">
            <Zap className="mb-4 h-5 w-5 text-primary" />
            <h3 className="font-semibold">One clean default</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Start with relay.layer.systems, then expand your route table whenever you need reach or redundancy.</p>
          </div>
        </aside>
      </div>
    </OsShell>
  );
}

export default Network;
