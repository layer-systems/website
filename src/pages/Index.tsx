import { useSeoMeta } from '@unhead/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Copy, Server, Gift, Users, Globe, ArrowRight, Compass } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Layout } from '@/components/Layout';

const Index = () => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const relayUrl = 'wss://relay.layer.systems';

  useSeoMeta({
    title: 'LAYER.systems - Public Nostr Relay',
    description: 'A fast, reliable, and open Nostr relay serving the decentralized social network.',
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(relayUrl);
      setCopied(true);
      toast({
        title: 'Copied!',
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

  const features = [
    {
      icon: Gift,
      title: 'Free to use',
      description: 'No signup, no fees. Open infrastructure for everyone.',
    },
    {
      icon: Users,
      title: 'Community driven',
      description: 'Built and maintained by the Nostr community.',
    },
    {
      icon: Globe,
      title: 'Global network',
      description: 'Part of the decentralized Nostr ecosystem.',
    },
    {
      icon: Server,
      title: 'Open access',
      description: 'Compatible with every Nostr client out there.',
    },
  ];

  const steps = [
    {
      num: '01',
      title: 'Choose a client',
      description: 'Pick a Nostr client like Damus, Amethyst, Snort, or any compatible application.',
    },
    {
      num: '02',
      title: 'Add the relay',
      description: 'In your client settings, paste our relay URL into your relay list.',
    },
    {
      num: '03',
      title: 'Start connecting',
      description: 'Post, follow, and engage with the global Nostr network.',
    },
  ];

  return (
    <Layout>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        {/* Abstract background shapes */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-[480px] w-[480px] rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
          {/* Badge */}
          <div className="animate-slide-up mb-6 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Relay online
            </span>
          </div>

          {/* Headline */}
          <div className="animate-slide-up-delay-1 mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Your gateway to the{' '}
              <span className="text-primary">open social web</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
              A fast, reliable Nostr relay connecting you to the future of decentralized social media.
            </p>
          </div>

          {/* Relay URL card */}
          <div className="animate-slide-up-delay-2 mx-auto mt-12 max-w-xl">
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="p-6">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Relay URL
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm text-primary">
                    {relayUrl}
                  </code>
                  <Button
                    onClick={copyToClipboard}
                    className="shrink-0 gap-2"
                  >
                    {copied ? (
                      <><CheckCircle2 className="h-4 w-4" /> Copied</>
                    ) : (
                      <><Copy className="h-4 w-4" /> Copy URL</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CTAs */}
          <div className="animate-slide-up-delay-3 mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" asChild>
              <Link to="/explore" className="gap-2">
                <Compass className="h-4 w-4" />
                Explore the network
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/dashboard" className="gap-2">
                Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Why LAYER.systems?</h2>
            <p className="mt-3 text-muted-foreground">
              Infrastructure you can rely on, built for the decentralized future.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, i) => (
              <Card
                key={i}
                className="group border-transparent bg-card/60 transition-all duration-300 hover:border-border hover:shadow-md"
              >
                <CardContent className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-serif text-base font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Getting Started ─── */}
      <section className="border-t">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Get started in minutes</h2>
            <p className="mt-3 text-muted-foreground">
              Three steps to join the Nostr network through our relay.
            </p>
          </div>

          <div className="mt-14 space-y-6">
            {steps.map((step) => (
              <div
                key={step.num}
                className="flex items-start gap-5 rounded-xl border bg-card p-6 transition-shadow hover:shadow-sm"
              >
                <span className="shrink-0 font-mono text-2xl font-bold text-primary/40">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-serif text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
