import { useSeoMeta } from '@unhead/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Copy, Server, Zap, Shield, Globe } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { LoginArea } from '@/components/auth/LoginArea';

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
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Optimized for speed with low-latency connections',
    },
    {
      icon: Shield,
      title: 'Reliable & Secure',
      description: 'Always online with enterprise-grade security',
    },
    {
      icon: Globe,
      title: 'Global Network',
      description: 'Part of the decentralized Nostr ecosystem',
    },
    {
      icon: Server,
      title: 'Open Access',
      description: 'Free to use for all Nostr clients',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-end">
            <LoginArea className="max-w-60" />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-32 sm:pb-24">
          {/* Status Badge */}
          {/* <div className="flex justify-center mb-8">
            <Badge variant="outline" className="px-4 py-2 text-sm font-medium gap-2 border-primary/20 bg-primary/5">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Relay Online
            </Badge>
          </div> */}

          {/* Main Heading */}
          <div className="text-center space-y-6 mb-12">
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
                LAYER.systems
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto font-light">
              Your gateway to the decentralized social network
            </p>
            <p className="text-base sm:text-lg text-muted-foreground/80 max-w-xl mx-auto">
              A fast, reliable, and open Nostr relay connecting you to the future of social media
            </p>
          </div>

          {/* Relay URL Card */}
          <div className="max-w-2xl mx-auto mb-16">
            <Card className="border-2 border-primary/20 shadow-2xl shadow-primary/5 backdrop-blur-sm bg-card/95">
              <CardContent className="p-8">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="sm:flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground mb-2">Relay URL</p>
                      <code className="text-lg sm:text-xl font-mono text-primary break-all">
                        {relayUrl}
                      </code>
                    </div>
                    <Button
                      size="lg"
                      onClick={copyToClipboard}
                      className="w-full sm:w-auto sm:shrink-0 gap-2 hover:scale-105 transition-transform"
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-5 h-5" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Add this URL to your Nostr client to connect to LAYER.systems
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Features Grid */}
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Why Choose LAYER.systems?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <Card
                  key={index}
                  className="group hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
                >
                  <CardContent className="p-6 space-y-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* How to Connect Section */}
      <div className="border-t border-border/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <h2 className="text-3xl font-bold text-center mb-12">Getting Started</h2>
          <div className="space-y-8">
            <Card>
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                      1
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Choose Your Client</h3>
                      <p className="text-muted-foreground">
                        Pick a Nostr client like Damus, Amethyst, Snort, or any other compatible application
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                      2
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Add the Relay</h3>
                      <p className="text-muted-foreground">
                        In your client settings, add <code className="px-2 py-1 bg-muted rounded text-sm font-mono">{relayUrl}</code> to your relay list
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                      3
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Start Connecting</h3>
                      <p className="text-muted-foreground">
                        You're all set! Start posting, following, and connecting with the Nostr network
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} LAYER.systems. Powered by Nostr.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Server className="w-4 h-4" />
                <span>Open and free for all</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <a href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                  Terms
                </a>
                <a href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                  Privacy
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
