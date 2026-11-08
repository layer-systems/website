import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, LayoutGrid, Search, SquareCheckBig } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useWindowManager } from '@/os/useWindowManager';
import { useEnabledApps } from '@/os/useEnabledApps';
import { APPS, getApp } from '@/os/registry';
import type { AppDefinition, AppProps } from '@/os/types';
import { AppIcon, Carousel, FeatureCard, SectionHeader, StorePill, StoreRow } from './parts';
import { CATEGORIES, availabilityLabel, categoryLabel } from './catalog';

type View = 'discover' | 'installed';

/** Shared install/remove/open plumbing for every view in the store. */
function useStore() {
  const { windows, closeWindow, openApp } = useWindowManager();
  const { isEnabled, setEnabled, reset, customized } = useEnabledApps();

  const setInstalled = (app: AppDefinition, enabled: boolean) => {
    setEnabled(app, enabled);
    // A removed app should not linger on screen with no launcher left.
    if (!enabled) {
      for (const win of windows) {
        if (win.appId === app.id) closeWindow(win.id);
      }
    }
  };

  /** The GET / OPEN pill for a row or card. */
  const pillFor = (app: AppDefinition) =>
    isEnabled(app) ? (
      <StorePill label={`Open ${app.title}`} onClick={() => openApp(app.id)}>
        Open
      </StorePill>
    ) : (
      <StorePill label={`Get ${app.title}`} onClick={() => setInstalled(app, true)}>
        Get
      </StorePill>
    );

  return { isEnabled, setInstalled, openApp, reset, customized, pillFor };
}

type Store = ReturnType<typeof useStore>;

export default function AppStoreApp({ params, setParams, setTitle }: AppProps) {
  const store = useStore();
  const [query, setQuery] = useState('');

  const view: View = params.view === 'installed' ? 'installed' : 'discover';
  const selected = params.id ? getApp(params.id) : undefined;

  useEffect(() => setTitle(selected ? `App Store — ${selected.title}` : 'App Store'), [selected, setTitle]);

  const select = (app: AppDefinition) => setParams({ ...(view === 'installed' ? { view } : {}), id: app.id });
  const goTo = (next: View) => {
    setQuery('');
    setParams(next === 'installed' ? { view: next } : {});
  };

  if (selected) {
    return (
      <AppLayout className="@container">
        <AppToolbar>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-1 h-8 gap-1 px-2 text-sm"
            onClick={() => setParams(view === 'installed' ? { view } : {})}
          >
            <ChevronLeft className="size-4" aria-hidden />
            {view === 'installed' ? 'Installed' : 'Discover'}
          </Button>
        </AppToolbar>
        <AppBody>
          <AppDetail app={selected} store={store} onSelect={select} />
        </AppBody>
      </AppLayout>
    );
  }

  const installedCount = APPS.filter(store.isEnabled).length;

  return (
    <AppLayout className="@container">
      <AppToolbar className="gap-3">
        <div role="group" aria-label="Store sections" className="flex shrink-0 rounded-lg bg-muted p-0.5">
          <ViewButton active={view === 'discover'} onClick={() => goTo('discover')} icon={<LayoutGrid className="size-4" aria-hidden />}>
            Discover
          </ViewButton>
          <ViewButton active={view === 'installed'} onClick={() => goTo('installed')} icon={<SquareCheckBig className="size-4" aria-hidden />}>
            Installed
            <span className="ml-1 hidden tabular-nums text-muted-foreground @md:inline">{installedCount}</span>
          </ViewButton>
        </div>
        <div className="relative min-w-0 flex-1 @2xl:ml-auto @2xl:max-w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps"
            aria-label="Search apps"
            className="h-8 rounded-full pl-8 text-sm"
          />
        </div>
      </AppToolbar>

      <AppBody>
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-10 @xl:px-6 @xl:pt-8">
          {query.trim() ? (
            <SearchResults query={query} store={store} onSelect={select} />
          ) : view === 'installed' ? (
            <InstalledView store={store} installedCount={installedCount} onSelect={select} />
          ) : (
            <DiscoverView store={store} onSelect={select} />
          )}
        </div>
      </AppBody>
    </AppLayout>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="sr-only @sm:not-sr-only">{children}</span>
    </button>
  );
}

function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        <h1 className="text-3xl font-extrabold tracking-tight @xl:text-[2.5rem] @xl:leading-tight">{title}</h1>
      </div>
      {children}
    </header>
  );
}

function DiscoverView({ store, onSelect }: { store: Store; onSelect: (app: AppDefinition) => void }) {
  const today = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
    [],
  );

  // Feature what the user does not have yet; once they have it all, show off
  // the optional apps they picked instead of an empty shelf.
  const notInstalled = APPS.filter((app) => !store.isEnabled(app));
  const featured = notInstalled.length > 0 ? notInstalled : APPS.filter((app) => !app.locked);

  return (
    <>
      <PageTitle eyebrow={today} title="Discover" />

      <section aria-labelledby="app-store-featured" className="mb-8 space-y-3">
        <Carousel
          label="Featured apps"
          header={(controls) => (
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="app-store-featured" className="text-xl font-bold tracking-tight">
                  {notInstalled.length > 0 ? 'Featured' : 'Your collection'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {notInstalled.length > 0
                    ? `${notInstalled.length} ${notInstalled.length === 1 ? 'app' : 'apps'} you haven’t added yet`
                    : 'You have every app. Nice.'}
                </p>
              </div>
              {controls}
            </div>
          )}
        >
          {featured.map((app) => (
            <FeatureCard
              key={app.id}
              app={app}
              eyebrow={store.isEnabled(app) ? 'Installed' : app.requiresAuth ? 'Sign-in required' : 'New for you'}
              onSelect={() => onSelect(app)}
              action={store.pillFor(app)}
            />
          ))}
        </Carousel>
      </section>

      <div className="space-y-8">
        {CATEGORIES.map(({ id, label, blurb }) => {
          const apps = APPS.filter((app) => app.category === id);
          if (apps.length === 0) return null;
          return (
            <section key={id} aria-labelledby={`app-store-${id}`} className="space-y-2">
              <SectionHeader id={`app-store-${id}`} title={label} subtitle={blurb} />
              <StoreGrid apps={apps} store={store} onSelect={onSelect} />
            </section>
          );
        })}
      </div>
    </>
  );
}

function StoreGrid({
  apps,
  store,
  onSelect,
  actionFor,
}: {
  apps: AppDefinition[];
  store: Store;
  onSelect: (app: AppDefinition) => void;
  actionFor?: (app: AppDefinition) => ReactNode;
}) {
  return (
    <ul
      className={cn(
        'grid grid-cols-1 gap-x-8 gap-y-1',
        // Rows with two buttons need more room before they split into columns.
        actionFor ? '@4xl:grid-cols-2' : '@2xl:grid-cols-2 @5xl:grid-cols-3',
      )}
    >
      {apps.map((app) => (
        <StoreRow
          key={app.id}
          app={app}
          installed={store.isEnabled(app)}
          onSelect={() => onSelect(app)}
          action={actionFor ? actionFor(app) : store.pillFor(app)}
        />
      ))}
    </ul>
  );
}

function SearchResults({
  query,
  store,
  onSelect,
}: {
  query: string;
  store: Store;
  onSelect: (app: AppDefinition) => void;
}) {
  const needle = query.trim().toLowerCase();
  const results = APPS.filter(
    (app) =>
      app.title.toLowerCase().includes(needle) ||
      app.description.toLowerCase().includes(needle) ||
      categoryLabel(app.category).toLowerCase().includes(needle),
  );

  return (
    <>
      <PageTitle eyebrow="Search" title={`“${query.trim()}”`} />
      {results.length === 0 ? (
        <EmptyState title="No apps match" hint="Try a different search term." />
      ) : (
        <section aria-label="Search results" className="space-y-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </p>
          <StoreGrid apps={results} store={store} onSelect={onSelect} />
        </section>
      )}
    </>
  );
}

function InstalledView({
  store,
  installedCount,
  onSelect,
}: {
  store: Store;
  installedCount: number;
  onSelect: (app: AppDefinition) => void;
}) {
  const installed = APPS.filter(store.isEnabled);
  const removable = installed.filter((app) => !app.locked);
  const builtIn = installed.filter((app) => app.locked);

  const removeAction = (app: AppDefinition) => (
    <div className="flex shrink-0 items-center gap-1">
      <StorePill label={`Open ${app.title}`} onClick={() => store.openApp(app.id)}>
        Open
      </StorePill>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => store.setInstalled(app, false)}
        aria-label={`Remove ${app.title}`}
      >
        Remove
      </Button>
    </div>
  );

  return (
    <>
      <PageTitle eyebrow={`${installedCount} of ${APPS.length} apps`} title="Installed">
        <Button variant="outline" size="sm" className="rounded-full" disabled={!store.customized} onClick={store.reset}>
          Restore defaults
        </Button>
      </PageTitle>
      <p className="mb-6 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Installed apps show up on your desktop, in menus and in search. Removing one only hides it — your data stays on
        Nostr and you can get the app back at any time.
      </p>

      <div className="space-y-8">
        <section aria-labelledby="app-store-yours" className="space-y-2">
          <SectionHeader id="app-store-yours" title="Your apps" />
          {removable.length === 0 ? (
            <EmptyState title="Nothing added yet" hint="Head to Discover to pick some apps." />
          ) : (
            <StoreGrid apps={removable} store={store} onSelect={onSelect} actionFor={removeAction} />
          )}
        </section>
        <section aria-labelledby="app-store-builtin" className="space-y-2">
          <SectionHeader id="app-store-builtin" title="Built in" subtitle="Always available so you can find your way back" />
          <StoreGrid apps={builtIn} store={store} onSelect={onSelect} />
        </section>
      </div>
    </>
  );
}

function AppDetail({
  app,
  store,
  onSelect,
}: {
  app: AppDefinition;
  store: Store;
  onSelect: (app: AppDefinition) => void;
}) {
  const installed = store.isEnabled(app);
  const related = APPS.filter((entry) => entry.category === app.category && entry.id !== app.id);

  const facts: { label: string; value: string }[] = [
    { label: 'Category', value: categoryLabel(app.category) },
    { label: 'Availability', value: availabilityLabel(app) },
    { label: 'Sign-in', value: app.requiresAuth ? 'Required' : 'Not needed' },
    { label: 'Windows', value: app.singleton === false ? 'Many' : 'One at a time' },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-6 pb-10 @xl:px-6 @xl:pt-8">
      <header className="flex items-start gap-4 @xl:gap-6">
        <AppIcon app={app} size="lg" className="shadow-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight @xl:text-[2.5rem]">{app.title}</h1>
          <p className="text-sm text-muted-foreground @xl:text-base">{app.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {installed ? (
              <StorePill variant="solid" label={`Open ${app.title}`} onClick={() => store.openApp(app.id)}>
                Open
              </StorePill>
            ) : (
              <StorePill variant="solid" label={`Get ${app.title}`} onClick={() => store.setInstalled(app, true)}>
                Get
              </StorePill>
            )}
            {installed && !app.locked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => store.setInstalled(app, false)}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-2 divide-border border-y border-border py-3 @lg:grid-cols-4 @lg:divide-x">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col items-center gap-0.5 px-2 py-2 text-center">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{fact.label}</dt>
            <dd className="text-base font-bold">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="app-store-about" className="mt-6 space-y-2">
        <h2 id="app-store-about" className="text-xl font-bold tracking-tight">
          About this app
        </h2>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          {app.locked
            ? 'It is built in and always available, so you can always find your way back to your apps and settings.'
            : installed
              ? 'It is on your desktop and in your menus. Removing it only hides it — you can get it back any time.'
              : 'Get it to add it to your desktop, menus and search. Nothing is downloaded, and you can remove it any time.'}
        </p>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="app-store-related" className="mt-8 space-y-2">
          <SectionHeader id="app-store-related" title={`More in ${categoryLabel(app.category)}`} />
          <StoreGrid apps={related} store={store} onSelect={onSelect} />
        </section>
      )}
    </div>
  );
}
