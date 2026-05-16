import { useSeoMeta } from '@unhead/react';
import { useEffect, useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Copy,
  Gauge,
  Globe2,
  RadioTower,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoginArea } from '@/components/auth/LoginArea';
import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

type LiveEventSource = 'seed' | 'live';

interface LiveRelayEvent {
  event: NostrEvent;
  receivedAt: number;
  source: LiveEventSource;
}

const RELAY_URL = 'wss://relay.layer.systems';
const LIVE_KINDS = [0, 1, 3, 6, 7, 9735, 30023];
const MAX_EVENTS = 28;

function useLiveRelayEvents() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const [events, setEvents] = useState<LiveRelayEvent[]>([]);
  const [totalSeen, setTotalSeen] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'live' | 'quiet' | 'error'>('connecting');

  const readRelays = useMemo(
    () => config.relayMetadata.relays.filter((relay) => relay.read).map((relay) => relay.url),
    [config.relayMetadata.relays],
  );

  useEffect(() => {
    if (import.meta.env.MODE === 'test') {
      return;
    }

    const controller = new AbortController();
    let isActive = true;

    const appendEvent = (event: NostrEvent, source: LiveEventSource) => {
      setEvents((current) => {
        if (current.some((item) => item.event.id === event.id)) {
          return current;
        }

        return [
          {
            event,
            receivedAt: Date.now(),
            source,
          },
          ...current,
        ]
          .sort((a, b) => b.event.created_at - a.event.created_at)
          .slice(0, MAX_EVENTS);
      });
      setTotalSeen((count) => count + 1);
    };

    const run = async () => {
      const now = Math.floor(Date.now() / 1000);
      const filters = [{ kinds: LIVE_KINDS, since: now - 60 * 60, limit: MAX_EVENTS }];

      try {
        setStatus('connecting');

        const recentEvents = await nostr.query(filters, { signal: controller.signal });
        if (!isActive) return;

        recentEvents
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, MAX_EVENTS)
          .forEach((event) => appendEvent(event, 'seed'));

        setStatus('live');

        const liveFilters = [{ kinds: LIVE_KINDS, since: Math.floor(Date.now() / 1000) }];
        for await (const msg of nostr.req(liveFilters, { signal: controller.signal })) {
          if (!isActive) break;

          if (msg[0] === 'EVENT') {
            appendEvent(msg[2], 'live');
            setStatus('live');
          } else if (msg[0] === 'CLOSED') {
            setStatus('quiet');
          }
        }
      } catch (error) {
        if (!isActive || controller.signal.aborted) return;
        console.error('[Index] live relay subscription failed:', error);
        setStatus('error');
      }
    };

    void run();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [nostr]);

  return {
    events,
    status,
    totalSeen,
    readRelays,
    lastEventAt: events[0]?.receivedAt,
  };
}

function shortKey(pubkey: string) {
  return `${pubkey.slice(0, 6)}:${pubkey.slice(-4)}`;
}

function getKindMeta(kind: number) {
  switch (kind) {
    case 0:
      return { label: 'Profile', accent: 'bg-cyan-300', text: 'text-cyan-100', ring: 'ring-cyan-300/30' };
    case 1:
      return { label: 'Note', accent: 'bg-amber-300', text: 'text-amber-100', ring: 'ring-amber-300/30' };
    case 3:
      return { label: 'Relay list', accent: 'bg-lime-300', text: 'text-lime-100', ring: 'ring-lime-300/30' };
    case 6:
      return { label: 'Repost', accent: 'bg-sky-300', text: 'text-sky-100', ring: 'ring-sky-300/30' };
    case 7:
      return { label: 'Reaction', accent: 'bg-fuchsia-300', text: 'text-fuchsia-100', ring: 'ring-fuchsia-300/30' };
    case 9735:
      return { label: 'Zap', accent: 'bg-emerald-300', text: 'text-emerald-100', ring: 'ring-emerald-300/30' };
    case 30023:
      return { label: 'Article', accent: 'bg-rose-300', text: 'text-rose-100', ring: 'ring-rose-300/30' };
    default:
      return { label: `Kind ${kind}`, accent: 'bg-white', text: 'text-white', ring: 'ring-white/20' };
  }
}

function getTagValue(event: NostrEvent, tagName: string) {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

function getEventPreview(event: NostrEvent) {
  if (event.kind === 0) {
    try {
      const metadata = JSON.parse(event.content) as { name?: string; display_name?: string; about?: string };
      const name = metadata.display_name || metadata.name || genUserName(event.pubkey);
      return metadata.about ? `${name}: ${metadata.about}` : `${name} refreshed a profile`;
    } catch {
      return 'Profile metadata update';
    }
  }

  if (event.kind === 1) {
    return event.content.trim() || 'Empty text note';
  }

  if (event.kind === 30023) {
    return getTagValue(event, 'title') || event.content.trim() || 'Long-form note published';
  }

  if (event.kind === 9735) {
    return 'Lightning zap receipt settled on the relay';
  }

  if (event.kind === 7) {
    return event.content.trim() ? `Reaction: ${event.content.trim()}` : 'Reaction event';
  }

  if (event.kind === 6) {
    return 'Repost pointer propagated';
  }

  if (event.kind === 3) {
    return 'Contact or relay graph changed';
  }

  return event.content.trim() || `Kind ${event.kind} event`;
}

function formatEventTime(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function formatRelativeTime(timestamp?: number) {
  if (!timestamp) return 'waiting';

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  return `${Math.floor(minutes / 60)}h ago`;
}

function EventConstellation({ events }: { events: LiveRelayEvent[] }) {
  const plottedEvents = events.slice(0, 18);

  return (
    <div className="relative min-h-[430px] overflow-hidden rounded-md border border-white/10 bg-[#080806] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
      <div className="relay-grid absolute inset-0" />
      <div className="relay-scanline absolute inset-x-0 top-0 h-24" />
      <div className="absolute left-5 top-5 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/70 backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-lime-300 shadow-[0_0_18px_rgba(190,242,100,0.9)]" />
        live relay field
      </div>

      <div className="absolute bottom-5 left-5 z-10 max-w-52 text-xs leading-5 text-white/55">
        Each pulse is an event entering from a configured read relay. Notes, zaps, profiles, and reactions land as separate signal types.
      </div>

      <div className="absolute inset-8">
        <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/25 bg-amber-200/5 shadow-[0_0_55px_rgba(251,191,36,0.2)]" />
        <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10" />
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10" />
        <RadioTower className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-amber-200" />

        {plottedEvents.map(({ event, source }, index) => {
          const x = 10 + (parseInt(event.id.slice(0, 4), 16) % 80);
          const y = 12 + (parseInt(event.id.slice(4, 8), 16) % 76);
          const meta = getKindMeta(event.kind);

          return (
            <span
              key={event.id}
              className={cn(
                'event-packet absolute h-3 w-3 rounded-full ring-4',
                meta.accent,
                meta.ring,
                source === 'live' && 'event-packet-live',
              )}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                animationDelay: `${Math.min(index * 80, 900)}ms`,
              }}
              title={`${meta.label} from ${shortKey(event.pubkey)}`}
            />
          );
        })}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
    </div>
  );
}

function LiveEventRow({ item }: { item: LiveRelayEvent }) {
  const { event, receivedAt, source } = item;
  const meta = getKindMeta(event.kind);

  return (
    <article
      className={cn(
        'group rounded-md border border-white/10 bg-white/[0.055] p-3 transition duration-300 hover:border-white/20 hover:bg-white/[0.08]',
        source === 'live' && 'live-row-new',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.accent)} />
          <span className={cn('text-xs font-semibold uppercase', meta.text)}>{meta.label}</span>
          <span className="truncate font-mono text-[11px] text-white/35">{shortKey(event.pubkey)}</span>
        </div>
        <time className="shrink-0 font-mono text-[11px] text-white/35">{formatEventTime(event.created_at)}</time>
      </div>
      <p className="line-clamp-2 text-sm leading-5 text-white/76">{getEventPreview(event)}</p>
      <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-white/32">
        <span>{source === 'live' ? 'incoming' : 'recent'}</span>
        <span>{formatRelativeTime(receivedAt)}</span>
      </div>
    </article>
  );
}

function LiveRelayPanel({
  events,
  status,
  totalSeen,
  readRelays,
  lastEventAt,
}: {
  events: LiveRelayEvent[];
  status: 'connecting' | 'live' | 'quiet' | 'error';
  totalSeen: number;
  readRelays: string[];
  lastEventAt?: number;
}) {
  const statusLabel = status === 'live' ? 'streaming' : status;

  return (
    <section className="rounded-md border border-white/10 bg-[#10100d]/90 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-amber-100">
            <Activity className="h-4 w-4" />
            live ingress
          </div>
          <p className="mt-1 text-sm text-white/48">Incoming Nostr events from configured read relays.</p>
        </div>
        <Badge className="border border-lime-300/30 bg-lime-300/10 text-lime-100 hover:bg-lime-300/10">
          {statusLabel}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-white">
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase text-white/38">events</p>
          <p className="mt-1 font-mono text-xl">{totalSeen}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase text-white/38">relays</p>
          <p className="mt-1 font-mono text-xl">{readRelays.length}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase text-white/38">last</p>
          <p className="mt-1 truncate font-mono text-xl">{formatRelativeTime(lastEventAt)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {events.length > 0 ? (
          events.slice(0, 6).map((item) => <LiveEventRow key={item.event.id} item={item} />)
        ) : (
          <div className="rounded-md border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm text-white/50">
            Listening for the next event. The relay field will light up as soon as traffic arrives.
          </div>
        )}
      </div>
    </section>
  );
}

const features = [
  {
    icon: Gauge,
    title: 'Low-friction relay access',
    description: 'Point any Nostr client at the relay URL and start reading or publishing through the network.',
  },
  {
    icon: Globe2,
    title: 'Built for the public graph',
    description: 'Designed around open Nostr primitives, not platform lock-in or private social silos.',
  },
  {
    icon: ShieldCheck,
    title: 'Simple by default',
    description: 'A focused relay front door with account tools, dashboard paths, and live network visibility.',
  },
];

const Index = () => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { events, status, totalSeen, readRelays, lastEventAt } = useLiveRelayEvents();

  useSeoMeta({
    title: 'LAYER.systems - Live Nostr Relay',
    description: 'A modern public Nostr relay with live incoming event visibility.',
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(RELAY_URL);
      setCopied(true);
      toast({
        title: 'Copied',
        description: 'Relay URL copied to clipboard',
      });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Please copy the relay URL manually',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f0e7] text-[#16130e]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-black/10 bg-[#f4f0e7]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="LAYER.systems home">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#16130e] text-amber-200">
              <Server className="h-5 w-5" />
            </span>
            <span className="font-['Avenir_Next_Condensed','Arial_Narrow',sans-serif] text-xl font-black uppercase">
              LAYER.systems
            </span>
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-medium text-black/60 md:flex">
            <Button asChild variant="ghost" className="text-black/65 hover:bg-black/5 hover:text-black">
              <Link to="/explore">Explore</Link>
            </Button>
            <Button asChild variant="ghost" className="text-black/65 hover:bg-black/5 hover:text-black">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          </nav>

          <LoginArea className="max-w-60" />
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#f4f0e7] pt-24">
          <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,#16130e_1px,transparent_1px),linear-gradient(to_bottom,#16130e_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#16130e] to-transparent" />

          <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-10 px-4 pb-24 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/45 px-3 py-1.5 text-sm font-semibold text-black/68 shadow-sm backdrop-blur">
                <CircleDot className="h-4 w-4 text-lime-700" />
                Public Nostr relay with live event visibility
              </div>

              <h1 className="font-['Avenir_Next_Condensed','Arial_Narrow',sans-serif] text-6xl font-black uppercase leading-[0.86] tracking-normal text-[#17130e] sm:text-7xl lg:text-8xl">
                Watch the relay breathe.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-black/68 sm:text-xl">
                LAYER.systems is a clean public gateway into Nostr. Add the relay, publish from your client, and see the network surface in real time.
              </p>

              <div className="mt-8 rounded-md border border-black/12 bg-white/56 p-3 shadow-[0_20px_60px_rgba(22,19,14,0.12)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 rounded-sm bg-[#16130e] px-4 py-3">
                    <p className="text-xs uppercase text-white/38">relay url</p>
                    <code className="mt-1 block break-all font-mono text-base text-amber-100 sm:text-lg">{RELAY_URL}</code>
                  </div>
                  <Button
                    size="lg"
                    onClick={copyToClipboard}
                    className="h-14 shrink-0 bg-[#f6b32d] px-5 text-black hover:bg-[#f2c75d]"
                  >
                    {copied ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
                <div className="border-l border-black/15 pl-4">
                  <p className="font-mono text-2xl">{readRelays.length}</p>
                  <p className="mt-1 text-sm text-black/50">read relay{readRelays.length === 1 ? '' : 's'}</p>
                </div>
                <div className="border-l border-black/15 pl-4">
                  <p className="font-mono text-2xl">{totalSeen}</p>
                  <p className="mt-1 text-sm text-black/50">events seen</p>
                </div>
                <div className="border-l border-black/15 pl-4">
                  <p className="font-mono text-2xl">{formatRelativeTime(lastEventAt)}</p>
                  <p className="mt-1 text-sm text-black/50">last pulse</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <EventConstellation events={events} />
              <LiveRelayPanel
                events={events}
                status={status}
                totalSeen={totalSeen}
                readRelays={readRelays}
                lastEventAt={lastEventAt}
              />
            </div>
          </div>
        </section>

        <section className="bg-[#16130e] px-4 py-16 text-white sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <Badge className="border border-amber-200/25 bg-amber-200/10 text-amber-100 hover:bg-amber-200/10">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                relay ready
              </Badge>
              <h2 className="mt-5 max-w-sm font-['Avenir_Next_Condensed','Arial_Narrow',sans-serif] text-5xl font-black uppercase leading-none">
                A quieter front door for a busy network.
              </h2>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {features.map((feature) => (
                <article key={feature.title} className="rounded-md border border-white/10 bg-white/[0.055] p-5">
                  <feature.icon className="h-6 w-6 text-amber-200" />
                  <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#ece6d9] px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-black/45">next step</p>
              <h2 className="mt-2 text-3xl font-bold text-[#16130e]">Explore the public feed or inspect relay activity.</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-[#16130e] text-white hover:bg-black">
                <Link to="/explore">
                  Open Explore
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-black/20 bg-transparent hover:bg-black/5">
                <Link to="/dashboard">
                  Relay Dashboard
                  <Zap className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/10 bg-[#ece6d9] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-black/55 sm:flex-row sm:items-center sm:justify-between">
          <p>{new Date().getFullYear()} LAYER.systems. Powered by Nostr.</p>
          <div className="flex gap-5">
            <Link to="/terms" className="hover:text-black">Terms</Link>
            <Link to="/privacy" className="hover:text-black">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
