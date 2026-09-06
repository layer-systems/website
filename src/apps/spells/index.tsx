import { useEffect, useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronLeft, Globe, Loader2, Plus, Sparkles, User as UserIcon } from 'lucide-react';
import {
  AppBody,
  AppLayout,
  AppSectionTitle,
  AppSidebar,
  AppSplit,
  AppToolbar,
  EmptyState,
} from '@/components/os/AppChrome';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { NoteCard } from '@/components/nostr/NoteCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  isValidTagLetter,
  parseSpell,
  resolveSpellFilter,
  useDiscoverSpells,
  useMySpells,
  useRunSpell,
  useSpellContext,
} from '@/hooks/useSpells';
import { relativeTime } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import { NewSpellForm } from './NewSpellForm';
import type { AppProps } from '@/os/types';

type Scope = 'mine' | 'discover';

export default function SpellsApp({ params, setTitle, setParams }: AppProps) {
  const { user } = useCurrentUser();
  const isMobile = useIsMobile();
  const [requestedScope, setRequestedScope] = useState<Scope>('mine');
  const [formOpen, setFormOpen] = useState(false);

  // Signing out mid-session must not leave "My Spells" showing the previous
  // user's (still-cached) spells — same reasoning as the Feed app's scope.
  const scope: Scope = user ? requestedScope : 'discover';

  const mine = useMySpells();
  const discover = useDiscoverSpells();
  const query = scope === 'mine' ? mine : discover;

  const selectedId = params.id;
  const selected = query.data?.find((event) => event.id === selectedId);

  useEffect(() => setTitle('Spells'), [setTitle]);

  const select = (id: string | null) => setParams(id ? { id } : {});

  const listPane = (
    <SpellList
      query={query}
      scope={scope}
      selectedId={selectedId}
      onSelect={(event) => select(event.id)}
    />
  );

  const detailPane = formOpen ? (
    <NewSpellForm onDone={() => setFormOpen(false)} />
  ) : selected ? (
    <SpellDetail event={selected} />
  ) : (
    <EmptyState
      title="Pick a spell"
      hint="Choose a saved query from the list, or cast a new one."
      action={
        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
          <Sparkles className="size-3.5" aria-hidden />
          New spell
        </Button>
      }
    />
  );

  const toolbarTabs = (
    <>
      <ScopeTab
        active={scope === 'mine'}
        disabled={!user}
        onClick={() => setRequestedScope('mine')}
        icon={<UserIcon className="size-3.5" aria-hidden />}
        label="My Spells"
      />
      <ScopeTab
        active={scope === 'discover'}
        onClick={() => setRequestedScope('discover')}
        icon={<Globe className="size-3.5" aria-hidden />}
        label="Discover"
      />
    </>
  );

  if (isMobile) {
    const showingDetail = formOpen || Boolean(selected);
    return (
      <AppLayout>
        <AppToolbar className="gap-1">
          {showingDetail ? (
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                select(null);
              }}
              className="-ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
              Spells
            </button>
          ) : (
            toolbarTabs
          )}
          {!showingDetail && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1.5 px-2 text-xs"
              onClick={() => setFormOpen(true)}
            >
              <Plus className="size-3.5" aria-hidden />
              New
            </Button>
          )}
        </AppToolbar>
        <AppBody>{showingDetail ? detailPane : listPane}</AppBody>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppToolbar className="gap-1">
        {toolbarTabs}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1.5 px-2 text-xs"
          onClick={() => setFormOpen(true)}
        >
          <Plus className="size-3.5" aria-hidden />
          New spell
        </Button>
      </AppToolbar>
      <AppSplit>
        <AppSidebar className="p-0">{listPane}</AppSidebar>
        <AppBody>{detailPane}</AppBody>
      </AppSplit>
    </AppLayout>
  );
}

function ScopeTab({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SpellList({
  query,
  scope,
  selectedId,
  onSelect,
}: {
  query: { isLoading: boolean; data: NostrEvent[] | undefined };
  scope: Scope;
  selectedId: string | undefined;
  onSelect: (event: NostrEvent) => void;
}) {
  if (query.isLoading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!query.data || query.data.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        {scope === 'mine' ? 'You haven’t saved any spells yet.' : 'No spells found on your relays.'}
      </p>
    );
  }

  return (
    <>
      <AppSectionTitle>{scope === 'mine' ? 'My Spells' : 'Discover'}</AppSectionTitle>
      <ul className="pb-2">
        {query.data.map((event) => (
          <li key={event.id}>
            <SpellListItem event={event} active={event.id === selectedId} onSelect={() => onSelect(event)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function SpellListItem({
  event,
  active,
  onSelect,
}: {
  event: NostrEvent;
  active: boolean;
  onSelect: () => void;
}) {
  const spell = useMemo(() => parseSpell(event), [event]);
  const label = spell.name || spell.description || `${spell.kinds.join(', ') || 'empty'} query`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full px-3 py-2 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
      )}
    >
      <span className="line-clamp-1 block text-[13px] font-medium leading-snug">{label}</span>
      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
        kinds {spell.kinds.join(', ') || '—'} · {relativeTime(event.created_at)}
      </span>
    </button>
  );
}

function SpellDetail({ event }: { event: NostrEvent }) {
  const spell = useMemo(() => parseSpell(event), [event]);
  const context = useSpellContext();
  const filter = useMemo(() => resolveSpellFilter(spell, context), [spell, context]);
  const run = useRunSpell(filter);

  return (
    <div className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold leading-tight">
            {spell.name || spell.description || 'Untitled spell'}
          </h1>
          {spell.name && spell.description && (
            <p className="mt-1 text-sm text-muted-foreground">{spell.description}</p>
          )}
        </div>
        <Button size="sm" onClick={() => run.mutate()} disabled={!filter || run.isPending} className="shrink-0 gap-1.5">
          {run.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Run
        </Button>
      </div>

      <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} size="sm" />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {spell.kinds.map((kind) => (
          <Badge key={kind} variant="secondary" className="text-[11px]">
            kind {kind}
          </Badge>
        ))}
        {spell.authors.length > 0 && (
          <Badge variant="outline" className="text-[11px]">
            authors: {spell.authors.join(', ')}
          </Badge>
        )}
        {spell.tagFilter && isValidTagLetter(spell.tagFilter.letter) && spell.tagFilter.values.length > 0 && (
          <Badge variant="outline" className="text-[11px]">
            #{spell.tagFilter.letter}: {spell.tagFilter.values.join(', ')}
          </Badge>
        )}
        {spell.since && (
          <Badge variant="outline" className="text-[11px]">
            since {spell.since}
          </Badge>
        )}
        {spell.topics.map((topic) => (
          <Badge key={topic} variant="outline" className="text-[11px]">
            {topic}
          </Badge>
        ))}
      </div>

      {!filter && (
        <p className="mt-4 text-xs text-muted-foreground">
          {spell.authors.includes('$me') && !context.me
            ? 'This spell needs $me — sign in to run it.'
            : 'This spell has no runnable filter.'}
        </p>
      )}

      <div className="mt-6">
        {run.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : run.isError ? (
          <p className="text-sm text-destructive">
            {run.error instanceof Error ? run.error.message : 'The query failed.'}
          </p>
        ) : run.isSuccess ? (
          <SpellResults events={run.data} />
        ) : null}
      </div>
    </div>
  );
}

function SpellResults({ events }: { events: NostrEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events matched.</p>;
  }

  return (
    <div className="-mx-5 border-t border-border">
      <p className="px-5 py-2 text-xs text-muted-foreground">
        {events.length} {events.length === 1 ? 'result' : 'results'}
      </p>
      {events.map((event) =>
        event.kind === 1 ? (
          <NoteCard key={event.id} event={event} compact />
        ) : (
          <GenericResultRow key={event.id} event={event} />
        ),
      )}
    </div>
  );
}

function GenericResultRow({ event }: { event: NostrEvent }) {
  return (
    <div className="border-b border-border px-5 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} size="sm" />
        <Badge variant="secondary" className="shrink-0 text-[11px]">
          kind {event.kind}
        </Badge>
      </div>
      {event.content && (
        <p className="mt-1.5 line-clamp-3 text-[13px] text-muted-foreground">{event.content}</p>
      )}
    </div>
  );
}
