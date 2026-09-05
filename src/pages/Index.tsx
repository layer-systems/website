import { useSeoMeta } from '@unhead/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Copy, Gift, Users, Globe, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { SiteHeader } from '@/components/brand/SiteHeader';
import { SiteFooter } from '@/components/brand/SiteFooter';
import { LayerStack } from '@/components/brand/LayerStack';
import { LayerDivider } from '@/components/brand/LayerDivider';

const relayUrl = 'wss://relay.layer.systems';

const features = [
  {
    icon: Gift,
    title: 'No cost, no catch',
    description: 'Publishing and reading are free. No paywalled feeds, no premium relay tier.',
  },
  {
    icon: Users,
    title: 'Run for the community',
    description: 'Kept online by people who use Nostr daily, not a company monetizing your notes.',
  },
  {
    icon: Globe,
    title: 'Speaks to every client',
    description: 'Standard NIP-01 relay behavior — works with Damus, Amethyst, Snort, and the rest.',
  },
  {
    icon: ShieldCheck,
    title: 'Yours to inspect',
    description: 'Your events, your keys. Browse everything you’ve published from your own dashboard.',
  },
];

const steps = [
  {
    step: '01',
    title: 'Choose your client',
    body: 'Pick a Nostr client — Damus, Amethyst, Snort, or any other app that speaks the protocol.',
  },
  {
    step: '02',
    title: 'Add the relay',
    body: 'In your client’s relay settings, add the URL below to your read/write relay list.',
  },
  {
    step: '03',
    title: 'Post through it',
    body: 'That’s it. Notes you publish now pass through LAYER.systems on their way to the network.',
  },
];

const Index = () => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useSeoMeta({
    title: 'LAYER.systems — Public Nostr Relay',
    description: 'A free, community-run Nostr relay. Add wss://relay.layer.systems to any client to connect to the decentralized social network.',
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(relayUrl);
      setCopied(true);
      toast({ title: 'Copied', description: 'Relay URL copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Couldn’t copy automatically',
        description: 'Select and copy the URL manually.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero — the layer stack, lit on dark ink */}
      <div className="relative overflow-hidden bg-brand-ink">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(600px circle at 15% 20%, hsl(var(--brand-amber) / 0.12), transparent 60%), radial-gradient(500px circle at 85% 60%, hsl(var(--brand-cyan) / 0.10), transparent 60%)',
          }}
          aria-hidden="true"
        />
        <SiteHeader transparent />

        <div className="relative mx-auto grid max-w-6xl gap-16 px-6 pb-24 pt-28 sm:pb-32 sm:pt-36 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="motion-safe:animate-fade-up">
            <p className="eyebrow text-brand-amber">Public Nostr relay</p>
            <h1 className="mt-4 text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              One relay in the stack between you and the network.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/60">
              LAYER.systems stores and forwards the events your client sends it — free, open,
              and built for the people actually using Nostr.
            </p>

            <div className="mt-10 max-w-lg rounded-lg border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
              <p className="eyebrow text-white/40">Relay URL</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate font-display text-base text-brand-amber sm:text-lg">
                  {relayUrl}
                </code>
                <Button onClick={copyToClipboard} className="shrink-0 gap-2">
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <LayerStack />
          </div>
        </div>
      </div>

      {/* Why this relay */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          <p className="eyebrow text-primary">Why this relay</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Infrastructure, not a product to sell you
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.title} className="layer-card rounded-lg border border-border bg-card p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10">
                <feature.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-center py-4">
        <LayerDivider />
      </div>

      {/* How to connect — a genuine sequence, numbered accordingly */}
      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
          <div className="mx-auto max-w-xl text-center">
            <p className="eyebrow text-primary">Getting connected</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Three steps, in order</h2>
          </div>

          <ol className="mt-14 space-y-10">
            {steps.map((item) => (
              <li key={item.step} className="flex gap-5">
                <span className="font-display text-sm font-semibold text-primary/70">{item.step}</span>
                <div>
                  <h3 className="font-display text-base font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default Index;
