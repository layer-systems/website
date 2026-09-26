import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { AppBody, AppLayout, AppSectionTitle, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useNip51Overview } from '@/hooks/useNip51Lists';
import { useWindowManager } from '@/os/useWindowManager';
import {
  LIST_KINDS,
  isItemTag,
  legacyTargetKind,
  listKindInfo,
  listTitle,
  visiblePrivateItems,
  type ListKindInfo,
  type Nip51List,
} from '@/lib/nip51';
import { relativeTime } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import { CreateListDialog } from './ListDialogs';
import { safeImageUrl } from './listUtils';
import { KindIcon, PrivateBadge } from './shared';

interface OverviewProps {
  pubkey: string;
  owner: boolean;
  ownerName: string;
  onOpenList: (kind: number, pubkey: string, identifier?: string) => void;
}

export function Overview({ pubkey, owner, ownerName, onOpenList }: OverviewProps) {
  const overview = useNip51Overview(pubkey);
  const { openApp } = useWindowManager();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const needle = search.trim().toLowerCase();
  const matches = (list: Nip51List) =>
    !needle ||
    listTitle(list).toLowerCase().includes(needle) ||
    (list.description ?? '').toLowerCase().includes(needle) ||
    (listKindInfo(list.kind)?.name ?? '').toLowerCase().includes(needle);

  const { byKind, legacy } = useMemo(() => {
    const byKind = new Map<number, Nip51List[]>();
    const legacy: Nip51List[] = [];
    for (const list of overview.data ?? []) {
      if (legacyTargetKind(list.kind, list.identifier) !== undefined) {
        legacy.push(list);
        continue;
      }
      if (!listKindInfo(list.kind)) continue;
      byKind.set(list.kind, [...(byKind.get(list.kind) ?? []), list]);
    }
    return { byKind, legacy };
  }, [overview.data]);

  const setKinds = LIST_KINDS.filter((info) => info.type === 'set');
  const standardKinds = LIST_KINDS.filter((info) => info.type === 'standard');
  const visibleLegacy = legacy.filter(matches);
  const anySetMatches = setKinds.some((info) => (byKind.get(info.kind) ?? []).some(matches));

  return (
    <AppLayout>
      <AppToolbar>
        <span className="shrink-0 text-[13px] font-medium">{owner ? 'Lists' : `${ownerName}’s lists`}</span>
        <div className="relative ml-auto min-w-0 max-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter lists"
            aria-label="Filter lists"
            className="h-7 pl-7 text-[13px]"
          />
        </div>
        {owner && (
          <Button size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">New list</span>
            <span className="sr-only sm:hidden">New list</span>
          </Button>
        )}
      </AppToolbar>

      <AppBody>
        {overview.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : overview.isError ? (
          <EmptyState
            title="Couldn’t load lists"
            hint="None of your relays responded. Check the Relays app or try again."
            action={
              <Button size="sm" variant="outline" onClick={() => overview.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !owner ? (
          anySetMatches ? (
            setKinds.map((info) => {
              const lists = (byKind.get(info.kind) ?? []).filter(matches);
              if (lists.length === 0) return null;
              return <KindSection key={info.kind} info={info} lists={lists} owner={false} onOpenList={onOpenList} />;
            })
          ) : (
            <EmptyState
              title={needle ? 'No matching lists' : 'No public lists'}
              hint={needle ? 'Try another search.' : `${ownerName} hasn’t published any lists your relays carry.`}
            />
          )
        ) : (
          <>
            <AppSectionTitle>Sets</AppSectionTitle>
            {setKinds.map((info) => {
              const all = byKind.get(info.kind) ?? [];
              const lists = all.filter(matches);
              if (needle && lists.length === 0) return null;
              return (
                <KindSection
                  key={info.kind}
                  info={info}
                  lists={lists}
                  owner
                  onOpenList={onOpenList}
                  onCreate={() => setCreateOpen(true)}
                />
              );
            })}

            <AppSectionTitle>Standard lists</AppSectionTitle>
            <ul className="border-b border-border">
              {standardKinds
                .filter((info) => !needle || info.name.toLowerCase().includes(needle) || info.description.toLowerCase().includes(needle))
                .map((info) => {
                  const list = byKind.get(info.kind)?.[0];
                  return (
                    <ListRow
                      key={info.kind}
                      info={info}
                      list={list}
                      owner
                      onOpen={() => onOpenList(info.kind, pubkey)}
                    />
                  );
                })}
            </ul>
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Your follow list and relay list are managed elsewhere:{' '}
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => openApp('profile', { pubkey })}>
                Profile
              </button>{' '}
              ·{' '}
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => openApp('relays')}>
                Relays
              </button>
            </p>

            {visibleLegacy.length > 0 && (
              <>
                <AppSectionTitle>Legacy lists</AppSectionTitle>
                <p className="px-4 pb-2 text-xs text-muted-foreground">
                  Lists in an old format. Open one to move its items into the matching standard list.
                </p>
                <ul className="border-b border-border">
                  {visibleLegacy.map((list) => (
                    <ListRow
                      key={`${list.kind}:${list.identifier}`}
                      info={listKindInfo(legacyTargetKind(list.kind, list.identifier)!)!}
                      list={list}
                      owner
                      legacy
                      onOpen={() => onOpenList(list.kind, pubkey, list.identifier)}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </AppBody>

      {owner && (
        <CreateListDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(kind, identifier) => onOpenList(kind, pubkey, identifier)}
        />
      )}
    </AppLayout>
  );
}

function KindSection({
  info,
  lists,
  owner,
  onOpenList,
  onCreate,
}: {
  info: ListKindInfo;
  lists: Nip51List[];
  owner: boolean;
  onOpenList: (kind: number, pubkey: string, identifier?: string) => void;
  onCreate?: () => void;
}) {
  return (
    <section className="border-b border-border" aria-labelledby={`kind-${info.kind}`}>
      <h3 id={`kind-${info.kind}`} className="flex items-center gap-2 px-4 pt-3 pb-1 text-[13px] font-semibold">
        <KindIcon kind={info.kind} className="size-3.5 text-muted-foreground" />
        {info.name}
        <span className="font-normal text-muted-foreground">{lists.length}</span>
      </h3>
      {lists.length > 0 ? (
        <ul>
          {lists.map((list) => (
            <ListRow
              key={list.identifier}
              info={info}
              list={list}
              owner={owner}
              onOpen={() => onOpenList(list.kind, list.pubkey, list.identifier)}
            />
          ))}
        </ul>
      ) : (
        <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">{info.description}</p>
          {onCreate && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCreate}>
              Create
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function ListRow({
  info,
  list,
  owner,
  legacy = false,
  onOpen,
}: {
  info: ListKindInfo;
  list: Nip51List | undefined;
  owner: boolean;
  legacy?: boolean;
  onOpen: () => void;
}) {
  const image = safeImageUrl(list?.image);
  const publicCount = list ? list.publicItems.filter((tag) => isItemTag(list.kind, tag)).length : 0;
  const privateCount = list && owner ? visiblePrivateItems(list).length : 0;
  const locked = list?.privateStatus === 'locked';
  const title = legacy && list ? `${listTitle(list)} (legacy ${list.kind})` : list && info.type === 'set' ? listTitle(list) : info.name;
  const empty = !list || (publicCount === 0 && privateCount === 0 && !locked);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left motion-safe:transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {image ? (
          <img src={image} alt="" className="size-10 shrink-0 rounded-lg object-cover" loading="lazy" />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <KindIcon kind={info.kind} className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{title}</span>
          <span className={cn('flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground')}>
            {empty && info.type === 'standard' ? (
              <span className="truncate">Empty — {info.description}</span>
            ) : (
              <>
                <span>{publicCount} public</span>
                {owner && (locked ? <PrivateBadge label="private locked" /> : privateCount > 0 && <PrivateBadge label={`${privateCount} private`} />)}
                {!owner && locked && <PrivateBadge label="has private items" />}
                {list && list.createdAt > 0 && <span>· updated {relativeTime(list.createdAt)}</span>}
              </>
            )}
          </span>
          {list?.description && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{list.description}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}
