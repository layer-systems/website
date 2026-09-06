import { useEffect, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { LoginArea } from '@/components/auth/LoginArea';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWindowManager } from '@/os/useWindowManager';
import { useToast } from '@/hooks/useToast';
import { npubOf } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import type { Theme } from '@/contexts/AppContext';
import type { AppProps } from '@/os/types';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsApp({ setTitle }: AppProps) {
  useEffect(() => setTitle('Settings'), [setTitle]);

  return (
    <AppLayout>
      <AppToolbar>
        <span className="text-[13px] font-medium">Settings</span>
      </AppToolbar>

      <AppBody className="px-6 py-5">
        <div className="mx-auto max-w-xl space-y-8">
          <AccountSection />
          <Separator />
          <AppearanceSection />
          <Separator />
          <RelaySection />
          <Separator />
          <MediaSection />
          <Separator />
          <SessionSection />
        </div>
      </AppBody>
    </AppLayout>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function AccountSection() {
  const { user } = useCurrentUser();

  return (
    <Section title="Account" description="The Nostr identity this session signs with.">
      {user ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <p className="min-w-0 truncate font-mono text-xs">{npubOf(user.pubkey)}</p>
          <LoginArea />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground">Not signed in.</p>
          <LoginArea />
        </div>
      )}
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <Section title="Appearance" description="Applies to the desktop and every window.">
      <div className="flex gap-2">
        {THEMES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={theme === option.value}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              theme === option.value
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-border hover:bg-muted',
            )}
          >
            {theme === option.value && <Check className="size-3.5" aria-hidden />}
            {option.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function RelaySection() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');

  const relays = config.relayMetadata.relays;

  const addRelay = () => {
    const value = draft.trim();
    if (!value) return;

    let url: string;
    try {
      const parsed = new URL(value.startsWith('ws') ? value : `wss://${value}`);
      if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') throw new Error('bad protocol');
      url = parsed.href;
    } catch {
      toast({ title: 'That is not a valid relay URL', variant: 'destructive' });
      return;
    }

    if (relays.some((relay) => relay.url === url)) {
      toast({ title: 'That relay is already in your list' });
      return;
    }

    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: [...relays, { url, read: true, write: true }],
        updatedAt: Math.floor(Date.now() / 1000),
      },
    }));
    setDraft('');
  };

  const update = (url: string, patch: { read?: boolean; write?: boolean }) => {
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: relays.map((relay) => (relay.url === url ? { ...relay, ...patch } : relay)),
        updatedAt: Math.floor(Date.now() / 1000),
      },
    }));
  };

  const remove = (url: string) => {
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: relays.filter((relay) => relay.url !== url),
        updatedAt: Math.floor(Date.now() / 1000),
      },
    }));
  };

  return (
    <Section
      title="Relays"
      description="Read relays supply your feeds; write relays receive what you publish."
    >
      <ul className="divide-y divide-border rounded-lg border border-border">
        {relays.map((relay) => (
          <li key={relay.url} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {relay.url.replace(/^wss:\/\//, '').replace(/\/$/, '')}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={relay.read}
                onCheckedChange={(checked) => update(relay.url, { read: checked })}
                aria-label={`Read from ${relay.url}`}
              />
              read
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={relay.write}
                onCheckedChange={(checked) => update(relay.url, { write: checked })}
                aria-label={`Write to ${relay.url}`}
              />
              write
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => remove(relay.url)}
              aria-label={`Remove ${relay.url}`}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </li>
        ))}
        {relays.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            No relays. Add one below.
          </li>
        )}
      </ul>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && addRelay()}
          placeholder="wss://relay.example.com"
          className="font-mono text-xs"
          aria-label="New relay URL"
        />
        <Button onClick={addRelay} className="gap-1.5" disabled={!draft.trim()}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
    </Section>
  );
}

function MediaSection() {
  const { config, updateConfig } = useAppContext();

  return (
    <Section
      title="Media servers"
      description="Blossom servers store the images and files you upload."
    >
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="app-blossom" className="text-sm">
            Include the app defaults
          </Label>
          <p className="text-xs text-muted-foreground">
            Falls back to this app’s servers alongside your own.
          </p>
        </div>
        <Switch
          id="app-blossom"
          checked={config.useAppBlossomServers}
          onCheckedChange={(checked) =>
            updateConfig((current) => ({ ...current, useAppBlossomServers: checked }))
          }
        />
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {config.blossomServerMetadata.servers.map((server) => (
          <li key={server} className="truncate px-3 py-2 font-mono text-xs">
            {server}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SessionSection() {
  const { resetSession } = useWindowManager();
  const { toast } = useToast();

  return (
    <Section
      title="Session"
      description="Your open windows and their positions are remembered between visits."
    >
      <Button
        variant="outline"
        onClick={() => {
          resetSession();
          toast({ title: 'Session reset' });
        }}
      >
        Close everything and forget the layout
      </Button>
    </Section>
  );
}
