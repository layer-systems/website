import { useSeoMeta } from '@unhead/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowDown,
  CheckCircle2,
  Copy,
  Globe2,
  Radio,
  Server,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import { LoginArea } from '@/components/auth/LoginArea';

const relayUrl = 'wss://relay.layer.systems';

const tickerItems = [
  'LAYER.systems',
  'public Nostr relay',
  'wss://relay.layer.systems',
  'open protocols',
  'relay-first social',
  'NIP-aware infrastructure',
  'bring your own client',
  'events over platforms',
];

const features = [
  {
    icon: Zap,
    title: 'Fast by design',
    description: 'A focused relay endpoint for clients that need clean access to the Nostr network.',
  },
  {
    icon: ShieldCheck,
    title: 'Open access',
    description: 'Free to use, easy to add, and built around portable Nostr identity instead of account lock-in.',
  },
  {
    icon: Globe2,
    title: 'Protocol native',
    description: 'Publishes and queries standard Nostr events so your client stays interoperable.',
  },
  {
    icon: Users,
    title: 'Community useful',
    description: 'A practical relay surface for people, apps, and experiments building on decentralized social media.',
  },
];

const connectionSteps = [
  {
    label: '01',
    title: 'Open your Nostr client',
    description: 'Use Damus, Amethyst, Snort, Coracle, or any client that lets you manage relays.',
  },
  {
    label: '02',
    title: 'Add the relay URL',
    description: 'Paste the relay endpoint into your read and write relay list.',
  },
  {
    label: '03',
    title: 'Publish and query',
    description: 'Your client can now send and receive events through LAYER.systems.',
  },
];

const relayStats = [
  ['Endpoint', relayUrl],
  ['Access', 'public'],
  ['Network', 'Nostr'],
  ['Mode', 'read + write'],
];

const Index = () => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useSeoMeta({
    title: 'LAYER.systems - Public Nostr Relay',
    description: 'A fast, reliable, and open Nostr relay serving the decentralized social network.',
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(relayUrl);
      setCopied(true);
      toast({
        title: 'Copied',
        description: 'Relay URL copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Please copy the URL manually',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b-2 border-foreground bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#top" className="group flex min-w-0 items-center gap-3 font-black uppercase tracking-normal">
            <span className="grid h-9 w-9 place-items-center border-2 border-foreground bg-primary text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))] transition-transform group-hover:-translate-y-0.5">
              <Radio className="h-5 w-5" />
            </span>
            <span className="hidden text-lg leading-none sm:inline sm:text-xl">LAYER.systems</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-bold uppercase md:flex">
            <a href="#relay" className="transition-colors hover:text-primary">Relay</a>
            <a href="#features" className="transition-colors hover:text-primary">Signal</a>
            <a href="#connect" className="transition-colors hover:text-primary">Connect</a>
            <Link to="/explore" className="transition-colors hover:text-primary">Explore</Link>
          </nav>

          <LoginArea className="max-w-[12rem] sm:max-w-60" />
        </div>
      </header>

      <main id="top">
        <section className="border-b-2 border-foreground bg-primary text-primary-foreground">
          <div className="relay-ticker flex overflow-hidden py-2 text-sm font-black uppercase">
            <div className="relay-ticker-track flex min-w-full shrink-0 items-center gap-8 px-4">
              {[...tickerItems, ...tickerItems].map((item, index) => (
                <span key={`${item}-${index}`} className="whitespace-nowrap">
                  {item}
                </span>
              ))}
            </div>
            <div aria-hidden className="relay-ticker-track flex min-w-full shrink-0 items-center gap-8 px-4">
              {[...tickerItems, ...tickerItems].map((item, index) => (
                <span key={`clone-${item}-${index}`} className="whitespace-nowrap">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="relative border-b-2 border-foreground bg-[linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px),linear-gradient(180deg,hsl(var(--border))_1px,transparent_1px)] bg-[size:32px_32px]">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:px-8 lg:py-24">
            <div className="flex min-w-0 flex-col justify-between gap-10">
              <div className="space-y-7">
                <div className="inline-flex border-2 border-foreground bg-card px-3 py-1 text-xs font-black uppercase shadow-[3px_3px_0_hsl(var(--primary))]">
                  Public Nostr relay
                </div>
                <div className="space-y-5">
                  <h1 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-normal sm:text-7xl lg:text-8xl">
                    Relay signal for the open social web.
                  </h1>
                  <p className="max-w-2xl text-lg font-medium leading-8 text-muted-foreground sm:text-xl">
                    LAYER.systems is a public Nostr relay for people and clients that want direct,
                    portable, protocol-native social infrastructure.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-none border-2 border-foreground px-5 font-black uppercase shadow-[4px_4px_0_hsl(var(--foreground))] hover:-translate-y-0.5">
                  <a href="#relay">
                    Relay URL
                    <ArrowDown className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-none border-2 border-foreground bg-card px-5 font-black uppercase shadow-[4px_4px_0_hsl(var(--primary))] hover:-translate-y-0.5">
                  <a href="#connect">Connect client</a>
                </Button>
              </div>
            </div>

            <div id="relay" className="self-start lg:mt-12 border-2 border-foreground bg-card p-4 shadow-[8px_8px_0_hsl(var(--primary))]">
              <div className="mb-4 flex items-center justify-between gap-4 border-b-2 border-foreground pb-4">
                <div>
                  <p className="text-xs font-black uppercase text-muted-foreground">Relay endpoint</p>
                  <code className="mt-1 block break-all font-mono text-xl font-bold text-primary sm:text-2xl">
                    {relayUrl}
                  </code>
                </div>
                <Server className="h-8 w-8 shrink-0 text-primary" />
              </div>

              <Button
                size="lg"
                onClick={copyToClipboard}
                className="mb-5 h-12 w-full rounded-none border-2 border-foreground font-black uppercase"
              >
                {copied ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                {copied ? 'Copied' : 'Copy relay URL'}
              </Button>

              <dl className="grid grid-cols-2 gap-px overflow-hidden border-2 border-foreground bg-foreground">
                {relayStats.map(([label, value]) => (
                  <div key={label} className="bg-card p-3">
                    <dt className="text-xs font-black uppercase text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words font-mono text-sm font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section id="features" className="border-b-2 border-foreground bg-card">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <div className="mb-10 grid gap-5 md:grid-cols-[0.8fr_1.2fr] md:items-end">
              <h2 className="text-4xl font-black leading-none sm:text-5xl">Built like relay infrastructure should feel.</h2>
              <p className="text-lg font-medium leading-8 text-muted-foreground">
                The interface puts the endpoint first: clear, copyable, and surrounded by just enough context
                to help humans and Nostr clients get moving.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <Card key={feature.title} className="rounded-none border-2 border-foreground shadow-none transition-transform hover:-translate-y-1">
                  <CardContent className="p-5">
                    <div className="mb-6 grid h-12 w-12 place-items-center border-2 border-foreground bg-primary text-primary-foreground">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-3 text-xl font-black">{feature.title}</h3>
                    <p className="leading-7 text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="connect" className="border-b-2 border-foreground bg-secondary">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <div className="mb-5 inline-flex border-2 border-foreground bg-card px-3 py-1 text-xs font-black uppercase">
                Getting started
              </div>
              <h2 className="text-4xl font-black leading-none sm:text-5xl">Three steps, no platform ceremony.</h2>
            </div>

            <div className="space-y-4">
              {connectionSteps.map((step) => (
                <div key={step.label} className="grid gap-4 border-2 border-foreground bg-card p-5 sm:grid-cols-[72px_1fr]">
                  <div className="font-mono text-3xl font-black text-primary">{step.label}</div>
                  <div>
                    <h3 className="text-xl font-black">{step.title}</h3>
                    <p className="mt-2 leading-7 text-muted-foreground">
                      {step.description}{' '}
                      {step.label === '02' && (
                        <code className="break-all bg-accent px-1.5 py-1 font-mono text-sm text-accent-foreground">
                          {relayUrl}
                        </code>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-foreground text-background">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 text-primary" />
              <p className="font-black uppercase">Open relay. Orange signal. Nostr native.</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-bold">
              <Link to="/terms" className="hover:text-primary">Terms</Link>
              <Link to="/privacy" className="hover:text-primary">Privacy</Link>
              <Link to="/dashboard" className="hover:text-primary">Dashboard</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
