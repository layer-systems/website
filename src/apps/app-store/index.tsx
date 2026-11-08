import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useWindowManager } from '@/os/useWindowManager';
import { useEnabledApps } from '@/os/useEnabledApps';
import { APPS, isDefaultEnabled } from '@/os/registry';
import type { AppCategory, AppDefinition, AppProps } from '@/os/types';

const CATEGORIES: { id: AppCategory; label: string }[] = [
  { id: 'social', label: 'Social' },
  { id: 'tools', label: 'Tools' },
  { id: 'system', label: 'System' },
];

export default function AppStoreApp({ setTitle }: AppProps) {
  const { windows, closeWindow, openApp } = useWindowManager();
  const { isEnabled, setEnabled, reset, customized } = useEnabledApps();
  const [query, setQuery] = useState('');

  useEffect(() => setTitle('App Store'), [setTitle]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      APPS.filter(
        (app) =>
          !needle ||
          app.title.toLowerCase().includes(needle) ||
          app.description.toLowerCase().includes(needle),
      ),
    [needle],
  );

  const enabledCount = APPS.filter(isEnabled).length;

  const toggle = (app: AppDefinition, enabled: boolean) => {
    setEnabled(app, enabled);
    // A switched-off app should not linger on screen with no launcher left.
    if (!enabled) {
      for (const win of windows) {
        if (win.appId === app.id) closeWindow(win.id);
      }
    }
  };

  return (
    <AppLayout>
      <AppToolbar>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps"
            aria-label="Search apps"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={!customized}
          onClick={reset}
        >
          Restore defaults
        </Button>
      </AppToolbar>

      <AppBody className="px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-xl space-y-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Only the basics are switched on to begin with. Add the apps you want, and switch off
            the ones you don’t — they disappear from your desktop, menus and search, and you can
            bring them back any time.{' '}
            <span className="tabular-nums">
              {enabledCount} of {APPS.length} apps on.
            </span>
          </p>

          {visible.length === 0 && (
            <EmptyState title="No apps match" hint="Try a different search term." />
          )}

          {CATEGORIES.map(({ id, label }) => {
            const apps = visible.filter((app) => app.category === id);
            if (apps.length === 0) return null;
            return (
              <section key={id} className="space-y-2" aria-labelledby={`app-store-${id}`}>
                <h2
                  id={`app-store-${id}`}
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </h2>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {apps.map((app) => (
                    <AppRow
                      key={app.id}
                      app={app}
                      enabled={isEnabled(app)}
                      onToggle={(enabled) => toggle(app, enabled)}
                      onOpen={() => openApp(app.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </AppBody>
    </AppLayout>
  );
}

function AppRow({
  app,
  enabled,
  onToggle,
  onOpen,
}: {
  app: AppDefinition;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
}) {
  const switchId = `app-store-switch-${app.id}`;

  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
        <app.icon className="size-5 text-primary" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <label htmlFor={switchId} className="text-sm font-medium">
            {app.title}
          </label>
          {app.locked ? (
            <Badge variant="secondary">Always on</Badge>
          ) : (
            isDefaultEnabled(app) && <Badge variant="outline">Basic</Badge>
          )}
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{app.description}</p>
      </div>

      {enabled && (
        <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onOpen}>
          Open
        </Button>
      )}
      <Switch
        id={switchId}
        checked={enabled}
        disabled={app.locked}
        onCheckedChange={onToggle}
      />
    </li>
  );
}
