import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { NUser } from '@nostrify/react/login';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import {
  LEGACY_GENERIC_KIND,
  LIST_KINDS,
  applyListOperation,
  decryptPrivateItems,
  emptyList,
  encryptPrivateItems,
  isDeletedPlaceholder,
  isSetKind,
  isValidItem,
  legacyTargetKind,
  listAddress,
  listEventTemplate,
  listKindInfo,
  listTitle,
  parseList,
  type ListOperation,
  type Nip51List,
  type PrivateItems,
} from '@/lib/nip51';

type Nostr = ReturnType<typeof useNostr>['nostr'];

/*
 * Cache layout. Every key carries `owner` — whether the viewer is the list's
 * author — because only the author can decrypt private items, so the same
 * list parses differently for them than for anyone else. Decrypted items only
 * ever live in query data (memory), never in a key.
 */
export function nip51ListKey(pubkey: string, kind: number, identifier: string | undefined, owner: boolean) {
  return ['nostr', 'nip51', 'list', pubkey, owner, kind, identifier ?? ''] as const;
}

export function nip51SetsKey(pubkey: string, kind: number, owner: boolean) {
  return ['nostr', 'nip51', 'sets', pubkey, owner, kind] as const;
}

export function nip51OverviewKey(pubkey: string, owner: boolean) {
  return ['nostr', 'nip51', 'all', pubkey, owner] as const;
}

function timeout(signal: AbortSignal | undefined, ms = 6000): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)].filter((s): s is AbortSignal => Boolean(s)));
}

function eventIdentifier(event: NostrEvent): string | undefined {
  return isSetKind(event.kind) ? (event.tags.find(([name]) => name === 'd')?.[1] ?? '') : undefined;
}

/**
 * Relays may return several versions of one list; only the newest counts.
 * Events not signed by `pubkey` are dropped — the `d` tag alone is no trust boundary.
 */
function newestPerList(events: NostrEvent[], pubkey: string): NostrEvent[] {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    if (event.pubkey !== pubkey) continue;
    const key = `${event.kind}:${eventIdentifier(event) ?? ''}`;
    const existing = latest.get(key);
    if (!existing || existing.created_at < event.created_at) latest.set(key, event);
  }
  return [...latest.values()];
}

async function parseWithDecryption(event: NostrEvent, user: NUser | undefined): Promise<Nip51List> {
  let privateItems: PrivateItems;
  if (!event.content) privateItems = { tags: [], status: 'none', legacyEncryption: false };
  else if (user && user.pubkey === event.pubkey) privateItems = await decryptPrivateItems(user.signer, user.pubkey, event.content);
  else privateItems = { tags: [], status: 'locked', legacyEncryption: false };
  return parseList(event, privateItems);
}

/** Sequential, so extension and remote signers aren't hit with a burst of decrypt requests. */
async function parseAll(events: NostrEvent[], user: NUser | undefined): Promise<Nip51List[]> {
  const lists: Nip51List[] = [];
  for (const event of events) lists.push(await parseWithDecryption(event, user));
  return lists;
}

function listFilter(pubkey: string, kind: number, identifier?: string): NostrFilter {
  return isSetKind(kind)
    ? { kinds: [kind], authors: [pubkey], '#d': [identifier ?? ''], limit: 5 }
    : { kinds: [kind], authors: [pubkey], limit: 5 };
}

async function fetchLatestEvent(
  nostr: Nostr,
  pubkey: string,
  kind: number,
  identifier: string | undefined,
  signal?: AbortSignal,
): Promise<NostrEvent | undefined> {
  const events = await nostr.query([listFilter(pubkey, kind, identifier)], { signal: timeout(signal) });
  return newestPerList(
    events.filter((event) => event.kind === kind && eventIdentifier(event) === (isSetKind(kind) ? (identifier ?? '') : undefined)),
    pubkey,
  )[0];
}

function sortLists(lists: Nip51List[]): Nip51List[] {
  return [...lists].sort((a, b) => listTitle(a).localeCompare(listTitle(b)));
}

/** A normal, current set of this kind — not a deleted placeholder nor a deprecated-format list. */
function isRegularSet(list: Nip51List): boolean {
  return !isDeletedPlaceholder(list) && legacyTargetKind(list.kind, list.identifier) === undefined;
}

/** Writes one list's latest state into every cache that shows it. */
function writeListToCache(queryClient: QueryClient, list: Nip51List, owner: boolean) {
  queryClient.setQueryData(nip51ListKey(list.pubkey, list.kind, list.identifier, owner), list);

  const replace = (lists: Nip51List[] | undefined, keep: (list: Nip51List) => boolean) => {
    if (!lists) return lists;
    const others = lists.filter((candidate) => !(candidate.kind === list.kind && candidate.identifier === list.identifier));
    return keep(list) ? sortLists([...others, list]) : others;
  };

  if (isSetKind(list.kind)) {
    queryClient.setQueryData<Nip51List[]>(nip51SetsKey(list.pubkey, list.kind, owner), (lists) => replace(lists, isRegularSet));
  }
  queryClient.setQueryData<Nip51List[]>(nip51OverviewKey(list.pubkey, owner), (lists) =>
    replace(lists, (candidate) => !isDeletedPlaceholder(candidate)),
  );
}

/**
 * One NIP-51 list: a standard list (`identifier` omitted) or a set. Resolves
 * to an empty list when none has been published yet (`eventId` is then undefined).
 */
export function useNip51List<T = Nip51List>(
  pubkey: string | undefined,
  kind: number,
  identifier?: string,
  select?: (list: Nip51List) => T,
) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const owner = Boolean(user && user.pubkey === pubkey);

  return useQuery<Nip51List, Error, T>({
    queryKey: nip51ListKey(pubkey ?? '', kind, identifier, owner),
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      const event = await fetchLatestEvent(nostr, pubkey!, kind, identifier, signal);
      return event ? parseWithDecryption(event, owner ? user : undefined) : emptyList(kind, pubkey!, identifier);
    },
    select,
    staleTime: 60_000,
  });
}

/** Every current set of one kind by `pubkey`, sorted by title. Legacy-format and deleted sets are left out. */
export function useNip51Sets<T = Nip51List[]>(
  pubkey: string | undefined,
  kind: number,
  select?: (lists: Nip51List[]) => T,
) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const owner = Boolean(user && user.pubkey === pubkey);

  return useQuery<Nip51List[], Error, T>({
    queryKey: nip51SetsKey(pubkey ?? '', kind, owner),
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [kind], authors: [pubkey!], limit: 200 }], { signal: timeout(signal) });
      const lists = await parseAll(newestPerList(events.filter((event) => event.kind === kind), pubkey!), owner ? user : undefined);
      return sortLists(lists.filter(isRegularSet));
    },
    select,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * All of `pubkey`'s lists of every supported kind, plus deprecated kind 30001
 * lists, in one relay round-trip. Also seeds the per-list and per-kind caches
 * so opening a list afterwards needs no second fetch (or decryption).
 */
export function useNip51Overview(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const owner = Boolean(user && user.pubkey === pubkey);

  return useQuery<Nip51List[]>({
    queryKey: nip51OverviewKey(pubkey ?? '', owner),
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      const kinds = [...LIST_KINDS.map((info) => info.kind), LEGACY_GENERIC_KIND];
      const events = await nostr.query([{ kinds, authors: [pubkey!], limit: 500 }], { signal: timeout(signal, 8000) });
      const lists = await parseAll(
        newestPerList(events.filter((event) => kinds.includes(event.kind)), pubkey!),
        owner ? user : undefined,
      );

      for (const list of lists) {
        const key = nip51ListKey(list.pubkey, list.kind, list.identifier, owner);
        const cached = queryClient.getQueryData<Nip51List>(key);
        if (!cached || cached.createdAt <= list.createdAt) queryClient.setQueryData(key, list);
      }
      for (const info of LIST_KINDS) {
        if (info.type !== 'set') continue;
        const key = nip51SetsKey(pubkey!, info.kind, owner);
        if (!queryClient.getQueryData(key)) {
          queryClient.setQueryData(key, sortLists(lists.filter((list) => list.kind === info.kind && isRegularSet(list))));
        }
      }

      return sortLists(lists.filter((list) => !isDeletedPlaceholder(list)));
    },
    staleTime: 60_000,
  });
}

export interface ListMutationInput {
  kind: number;
  identifier?: string;
  ops: ListOperation[];
  /** Creating a new set: publish even with no items, and fail if the identifier is taken. */
  create?: boolean;
}

interface ListMutationContext {
  snapshots: [readonly unknown[], unknown][];
}

/**
 * Edits one of the signed-in user's lists. The edit is shown immediately
 * (and rolled back if publishing fails), but what gets published is the edit
 * replayed on a fresh copy of the list fetched right before signing: lists
 * are replaced whole, so writing a stale copy would silently drop anything
 * changed from another client in the meantime.
 *
 * Refuses to write when the list has private items this signer can't
 * decrypt — re-encrypting only what it could read would destroy the rest.
 */
export function useNip51ListMutation() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<Nip51List, Error, ListMutationInput, ListMutationContext>({
    onMutate: async ({ kind, identifier, ops }) => {
      if (!user) return { snapshots: [] };
      const key = nip51ListKey(user.pubkey, kind, identifier, true);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshots: [readonly unknown[], unknown][] = [
        key,
        nip51SetsKey(user.pubkey, kind, true),
        nip51OverviewKey(user.pubkey, true),
      ].map((snapshotKey) => [snapshotKey, queryClient.getQueryData(snapshotKey)]);

      const cached = queryClient.getQueryData<Nip51List>(key);
      if (cached && cached.privateStatus !== 'locked') {
        writeListToCache(queryClient, ops.reduce(applyListOperation, cached), true);
      }
      return { snapshots };
    },
    mutationFn: async ({ kind, identifier, ops, create }) => {
      if (!user) throw new Error('Sign in to edit your lists.');
      const info = listKindInfo(kind);

      for (const op of ops) {
        const added = op.type === 'add' ? [op.tag] : op.type === 'merge' ? [...op.publicItems, ...op.privateItems] : [];
        if (added.some((tag) => !isValidItem(tag, info?.addressKinds))) {
          throw new Error('One of the items isn’t valid for this list.');
        }
      }

      const latestEvent = await fetchLatestEvent(nostr, user.pubkey, kind, identifier);
      const latest = latestEvent ? await parseWithDecryption(latestEvent, user) : emptyList(kind, user.pubkey, identifier);
      if (create && latestEvent && !isDeletedPlaceholder(latest)) {
        throw new Error('You already have a list with this identifier. Pick another one.');
      }
      if (latest.privateStatus === 'locked') {
        throw new Error(
          'This list has private items your signer couldn’t decrypt. To avoid losing them, it can’t be changed here — try the signer that created it.',
        );
      }

      const next = ops.reduce(applyListOperation, latest);
      const privateChanged = JSON.stringify(next.privateItems) !== JSON.stringify(latest.privateItems);
      if (!create && next === latest) return latest;

      // Reuse the existing ciphertext when the private items didn't change,
      // unless it's legacy NIP-04, which is upgraded on every save.
      const content =
        latestEvent && !privateChanged && !latest.legacyEncryption
          ? latestEvent.content
          : await encryptPrivateItems(user.signer, user.pubkey, next.privateItems);

      const template = listEventTemplate(next, content);
      // A replacement must be strictly newer than what relays hold, even if clocks disagree.
      const createdAt = Math.max(Math.floor(Date.now() / 1000), (latestEvent?.created_at ?? 0) + 1);
      const event = await publish.mutateAsync({ ...template, created_at: createdAt });

      return {
        ...next,
        privateStatus: next.privateItems.length > 0 ? 'ok' : 'none',
        legacyEncryption: false,
        createdAt: event.created_at,
        eventId: event.id,
      };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },
    // Written straight into the cache rather than invalidated: right after
    // publishing, the pool's read relay may still serve the previous version,
    // and a refetch racing back with it would clobber the correct state.
    onSuccess: (list) => writeListToCache(queryClient, list, true),
  });
}

/**
 * Deletes one of the signed-in user's sets: an emptied replacement first, so
 * relays that ignore deletions stop serving the items, then a NIP-09 kind 5
 * deletion of the set's address.
 */
export function useDeleteNip51Set() {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<Nip51List, Error, Nip51List>({
    mutationFn: async (list) => {
      if (!user || list.pubkey !== user.pubkey) throw new Error('You can only delete your own lists.');
      if (!isSetKind(list.kind)) throw new Error('Standard lists can be cleared, not deleted.');

      const now = Math.floor(Date.now() / 1000);
      const createdAt = Math.max(now, list.createdAt + 1);
      await publish.mutateAsync({ kind: list.kind, content: '', tags: [['d', list.identifier ?? '']], created_at: createdAt });
      await publish.mutateAsync({
        kind: 5,
        content: 'Deleted list',
        tags: [
          ['a', listAddress(list)],
          ['k', String(list.kind)],
        ],
        created_at: createdAt,
      });
      return { ...emptyList(list.kind, list.pubkey, list.identifier), createdAt };
    },
    onSuccess: (emptied) => writeListToCache(queryClient, emptied, true),
  });
}
