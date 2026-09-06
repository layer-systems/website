import { useEffect } from 'react';
import { Zap } from 'lucide-react';
import { AppBody, AppLayout } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { useWindowManager } from '@/os/useWindowManager';
import { APPS } from '@/os/registry';
import type { AppProps } from '@/os/types';

const SHORTCUTS: [keys: string, action: string][] = [
  ['⌘K', 'Search apps and windows'],
  ['⌘,', 'Open Settings'],
  ['⌘`', 'Cycle through windows'],
  ['⌘W', 'Close the focused window'],
  ['⌘M', 'Minimize the focused window'],
];

export default function AboutApp({ setTitle }: AppProps) {
  const { openApp } = useWindowManager();

  useEffect(() => setTitle('About'), [setTitle]);

  return (
    <AppLayout>
      <AppBody className="px-6 py-6">
        <div className="mx-auto max-w-md space-y-6">
          <header className="space-y-2">
            <span className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
              <Zap className="size-5 text-primary" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold tracking-tight">LAYER.systems</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A Nostr client shaped like a desktop. Every part of it is an app in a window you
              can move, resize, stack and keep open side by side — reading a thread does not
              have to cost you the feed you were scrolling.
            </p>
          </header>

          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Apps
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {APPS.map((app) => (
                <li key={app.id} className="flex items-center gap-3 px-3 py-2.5">
                  <app.icon className="size-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{app.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{app.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => openApp(app.id)}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Keyboard
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {SHORTCUTS.map(([keys, action]) => (
                <li key={keys} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{action}</span>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              On Windows and Linux, use Ctrl instead of ⌘.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Protocol
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Built on Nostr. Notes are kind 1, profiles kind 0, follow lists kind 3, relay lists
              NIP-65, and long-form articles NIP-23. Nothing is stored on a server we control —
              your relays hold everything, and this desktop only reads and writes to them.
            </p>
          </section>
        </div>
      </AppBody>
    </AppLayout>
  );
}
