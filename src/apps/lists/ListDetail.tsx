import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRightLeft, Copy, Lock, Pencil, ShieldAlert, Trash2 } from 'lucide-react';
import { AppBody, AppLayout, AppSectionTitle, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDeleteNip51Set, useNip51List, useNip51ListMutation, type ListMutationInput } from '@/hooks/useNip51Lists';
import { useToast } from '@/hooks/useToast';
import {
  isItemTag,
  isSetKind,
  isValidItem,
  itemKey,
  legacyTargetKind,
  listKindInfo,
  listNaddr,
  listTitle,
  visiblePrivateItems,
  type ListOperation,
  type Nip51List,
} from '@/lib/nip51';
import { displayName, relativeTime } from '@/lib/nostrUtils';
import { AddItemForm } from './AddItemForm';
import { ItemRow } from './ItemRow';
import { EditDetailsDialog } from './ListDialogs';
import { safeImageUrl, useReferencedEvents } from './listUtils';
import { KindIcon, PrivateBadge } from './shared';

interface ListDetailProps {
  pubkey: string;
  kind: number;
  identifier?: string;
  onBack: () => void;
  onOpenList: (kind: number, pubkey: string, identifier?: string) => void;
}

export function ListDetail({ pubkey, kind, identifier, onBack, onOpenList }: ListDetailProps) {
  const { user } = useCurrentUser();
  const owner = user?.pubkey === pubkey;
  const query = useNip51List(pubkey, kind, isSetKind(kind) ? (identifier ?? '') : undefined);
  const author = useAuthor(pubkey);
  const info = listKindInfo(kind);
  const list = query.data;

  const title = list ? listTitle(list) : (info?.name ?? 'List');

  return (
    <AppLayout>
      <AppToolbar>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden />
          Lists
        </Button>
        <span className="min-w-0 truncate text-[13px] font-medium">{title}</span>
        {list && <Toolbar list={list} owner={owner} onDeleted={onBack} />}
      </AppToolbar>

      <AppBody>
        {query.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError || !list ? (
          <EmptyState
            title="Couldn’t load this list"
            hint="None of your relays responded. Check the Relays app or try again."
            action={
              <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : isSetKind(kind) && !list.eventId ? (
          <EmptyState title="List not found" hint="It may have been deleted, or your relays don’t carry it." />
        ) : (
          <ListBody
            list={list}
            owner={owner}
            ownerName={displayName(pubkey, author.data?.metadata)}
            onOpenList={onOpenList}
          />
        )}
      </AppBody>
    </AppLayout>
  );
}

function Toolbar({ list, owner, onDeleted }: { list: Nip51List; owner: boolean; onDeleted: () => void }) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteSet = useDeleteNip51Set();
  const mutation = useNip51ListMutation();
  const set = isSetKind(list.kind);
  const legacy = legacyTargetKind(list.kind, list.identifier) !== undefined;
  const hasItems = list.publicItems.length > 0 || visiblePrivateItems(list).length > 0;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${listNaddr(list)}`);
      toast({
        title: 'Link copied',
        description: visiblePrivateItems(list).length > 0 ? 'Private items stay visible only to you.' : undefined,
      });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const confirm = async () => {
    try {
      if (set) {
        await deleteSet.mutateAsync(list);
        toast({ title: 'List deleted' });
        onDeleted();
      } else {
        await mutation.mutateAsync({ kind: list.kind, ops: [{ type: 'clear' }] });
        toast({ title: 'List cleared' });
      }
    } catch (error) {
      toast({
        title: set ? 'Could not delete the list' : 'Could not clear the list',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {set && list.eventId && !legacy && (
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={copyLink}>
          <Copy className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Share</span>
          <span className="sr-only sm:hidden">Copy link</span>
        </Button>
      )}
      {owner && set && !legacy && (
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Edit</span>
          <span className="sr-only sm:hidden">Edit details</span>
        </Button>
      )}
      {owner && (set ? list.eventId : hasItems) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={list.privateStatus === 'locked' && !set}
        >
          <Trash2 className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{set ? 'Delete' : 'Clear'}</span>
          <span className="sr-only sm:hidden">{set ? 'Delete list' : 'Clear list'}</span>
        </Button>
      )}

      {editOpen && <EditDetailsDialog list={list} open={editOpen} onOpenChange={setEditOpen} />}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{set ? `Delete “${listTitle(list)}”?` : `Clear your ${listTitle(list).toLowerCase()}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {set
                ? 'A deletion request goes to your relays, and the list is emptied so relays that ignore deletions stop showing its items. This can’t be undone.'
                : 'Every public and private item is removed from this list. This can’t be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirm();
              }}
              disabled={deleteSet.isPending || mutation.isPending}
            >
              {set ? 'Delete' : 'Clear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ListBody({
  list,
  owner,
  ownerName,
  onOpenList,
}: {
  list: Nip51List;
  owner: boolean;
  ownerName: string;
  onOpenList: (kind: number, pubkey: string, identifier?: string) => void;
}) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const mutation = useNip51ListMutation();
  const info = listKindInfo(list.kind);
  const image = safeImageUrl(list.image);
  const legacyTarget = legacyTargetKind(list.kind, list.identifier);

  const publicItems = useMemo(() => list.publicItems.filter((tag) => isItemTag(list.kind, tag)), [list]);
  const privateItems = useMemo(() => (owner ? visiblePrivateItems(list) : []), [list, owner]);
  const allItems = useMemo(() => [...publicItems, ...privateItems], [publicItems, privateItems]);
  const references = useReferencedEvents(allItems);

  const locked = list.privateStatus === 'locked';
  const editable = owner && Boolean(info) && legacyTarget === undefined && !locked;
  const canEncrypt = Boolean(user?.signer.nip44);

  const run = async (ops: ListOperation[], failure: string): Promise<boolean> => {
    const input: ListMutationInput = { kind: list.kind, identifier: list.identifier, ops };
    try {
      await mutation.mutateAsync(input);
      return true;
    } catch (error) {
      toast({
        title: failure,
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const renderItems = (items: string[][], isPrivate: boolean) => (
    <ul>
      {items.map((tag, index) => {
        const key = itemKey(tag);
        return (
          <ItemRow
            key={key}
            tag={tag}
            isPrivate={isPrivate}
            references={references.data}
            referencesLoading={references.isLoading}
            onOpenList={onOpenList}
            controls={
              editable
                ? {
                    isPrivate,
                    canMoveUp: index > 0,
                    canMoveDown: index < items.length - 1,
                    canMakePrivate: canEncrypt,
                    disabled: mutation.isPending,
                    onMove: (direction) => run([{ type: 'move', key, direction }], 'Could not reorder'),
                    onTogglePrivacy: () =>
                      run([{ type: 'setPrivacy', key, private: !isPrivate }], isPrivate ? 'Could not make public' : 'Could not make private'),
                    onRemove: () => run([{ type: 'remove', key }], 'Could not remove the item'),
                  }
                : undefined
            }
          />
        );
      })}
    </ul>
  );

  return (
    <>
      <header className="flex gap-3 border-b border-border px-4 py-4">
        {image ? (
          <img src={image} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <KindIcon kind={list.kind} className="size-6" />
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-lg font-semibold tracking-tight break-words">{listTitle(list)}</h1>
          <p className="text-xs text-muted-foreground">
            {info?.name ?? `Kind ${list.kind}`}
            {!owner && ` · by ${ownerName}`}
            {list.createdAt > 0 && ` · updated ${relativeTime(list.createdAt)}`}
          </p>
          {list.description && <p className="text-sm break-words">{list.description}</p>}
          {isSetKind(list.kind) && (
            <p className="truncate font-mono text-[11px] text-muted-foreground">d: {list.identifier}</p>
          )}
        </div>
      </header>

      {legacyTarget !== undefined && owner && <LegacyBanner list={list} targetKind={legacyTarget} />}

      {owner && locked && (
        <Notice icon={<ShieldAlert className="size-4" aria-hidden />}>
          This list has private items your signer couldn’t decrypt. They’re kept safe, but the list can’t be edited
          here until you use a signer that can read them.
        </Notice>
      )}
      {owner && list.legacyEncryption && !locked && editable && (
        <Notice icon={<Lock className="size-4" aria-hidden />}>
          Private items use older NIP-04 encryption. They’ll be re-encrypted with NIP-44 the next time you change this list.
        </Notice>
      )}
      {owner && isSetKind(list.kind) && legacyTarget === undefined && (
        <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          Anyone with the share link sees the public items. Private items are encrypted and visible only to you.
        </p>
      )}

      {editable && info && (
        <AddItemForm
          key={`${list.kind}:${list.identifier ?? ''}`}
          info={info}
          canEncrypt={canEncrypt}
          pending={mutation.isPending}
          onAdd={(tag, isPrivate) => run([{ type: 'add', tag, private: isPrivate }], 'Could not add the item')}
        />
      )}

      <AppSectionTitle>Public · {publicItems.length}</AppSectionTitle>
      {publicItems.length > 0 ? (
        renderItems(publicItems, false)
      ) : (
        <p className="px-4 pb-3 text-sm text-muted-foreground">
          {owner ? info?.description ?? 'No public items.' : 'No public items.'}
        </p>
      )}

      {owner ? (
        <>
          <AppSectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" aria-hidden />
              Private · {locked ? 'locked' : privateItems.length}
            </span>
          </AppSectionTitle>
          {locked ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Encrypted items this signer can’t open.</p>
          ) : privateItems.length > 0 ? (
            renderItems(privateItems, true)
          ) : (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              No private items. Use the lock button on an item, or tick “Add as private”, to hide it from everyone else.
            </p>
          )}
        </>
      ) : (
        locked && (
          <p className="px-4 py-3">
            <PrivateBadge label="This list also has private items only its owner can see." />
          </p>
        )
      )}
    </>
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2 border-b border-border bg-muted/40 px-4 py-3 text-sm" role="status">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

/**
 * Deprecated kind 30000/30001 lists: offer to move their items into the
 * matching standard list, then to delete the old one once nothing is left.
 */
function LegacyBanner({ list, targetKind }: { list: Nip51List; targetKind: number }) {
  const { toast } = useToast();
  const target = useNip51List(list.pubkey, targetKind);
  const mutation = useNip51ListMutation();
  const deleteSet = useDeleteNip51Set();
  const targetInfo = listKindInfo(targetKind);

  const migratable = (tags: string[][]) =>
    tags.filter((tag) => isItemTag(targetKind, tag) && isValidItem(tag, targetInfo?.addressKinds));
  const publicItems = migratable(list.publicItems);
  const privateItems = migratable(list.privateItems);
  const existing = new Set([...(target.data?.publicItems ?? []), ...(target.data?.privateItems ?? [])].map(itemKey));
  const remaining = [...publicItems, ...privateItems].filter((tag) => !existing.has(itemKey(tag))).length;
  const locked = list.privateStatus === 'locked' || target.data?.privateStatus === 'locked';

  const migrate = async () => {
    try {
      await mutation.mutateAsync({ kind: targetKind, ops: [{ type: 'merge', publicItems, privateItems }] });
      toast({ title: `Moved ${remaining} item${remaining === 1 ? '' : 's'} to ${targetInfo?.name}` });
    } catch (error) {
      toast({
        title: 'Migration failed',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  const remove = async () => {
    try {
      await deleteSet.mutateAsync(list);
      toast({ title: 'Legacy list deleted' });
    } catch (error) {
      toast({
        title: 'Could not delete the legacy list',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-2 border-b border-border bg-muted/40 px-4 py-3" role="status">
      <p className="flex items-start gap-2 text-sm">
        <ArrowRightLeft className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          This is a legacy list in an old format. Current clients use your <strong>{targetInfo?.name}</strong> list
          instead.
        </span>
      </p>
      {target.isLoading ? (
        <Skeleton className="h-8 w-40" />
      ) : remaining > 0 ? (
        <Button size="sm" onClick={migrate} disabled={locked || mutation.isPending}>
          Move {remaining} item{remaining === 1 ? '' : 's'} to {targetInfo?.name}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Every item is already in {targetInfo?.name}.</span>
          <Button size="sm" variant="outline" onClick={remove} disabled={deleteSet.isPending}>
            Delete legacy list
          </Button>
        </div>
      )}
      {locked && <p className="text-xs text-muted-foreground">Private items couldn’t be decrypted, so migration is unavailable.</p>}
    </div>
  );
}
