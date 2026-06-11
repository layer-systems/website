import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookHeart,
  Check,
  CircleAlert,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RadioTower,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useRelayLists } from '@/hooks/useRelayLists';
import { useToast } from '@/hooks/useToast';
import {
  FAVORITE_RELAYS_KIND,
  normalizeRelayUrl,
  parseFavoriteRelays,
  parseRelayList,
  RELAY_LIST_KIND,
  RELAY_SET_KIND,
  type RelayEntry,
  type RelaySet,
} from '@/lib/relayLists';
import { RelayUrlEditor } from './RelayUrlEditor';

interface RelayListManagerProps {
  pubkey: string;
}

interface RelaySetDraft {
  identifier: string;
  title: string;
  description: string;
  relays: string[];
  event?: RelaySet['event'];
}

const emptySetDraft: RelaySetDraft = {
  identifier: '',
  title: '',
  description: '',
  relays: [],
};

function RelayListEditor({
  relays,
  onChange,
  disabled,
}: {
  relays: RelayEntry[];
  onChange: (relays: RelayEntry[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const addRelay = () => {
    try {
      const url = normalizeRelayUrl(draft);
      if (relays.some((relay) => relay.url === url)) {
        setError('That relay is already in your list.');
        return;
      }
      onChange([...relays, { url, mode: 'both' }]);
      setDraft('');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid relay URL.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addRelay();
            }
          }}
          placeholder="wss://relay.example.com"
          className="font-mono text-sm"
          disabled={disabled}
          aria-invalid={Boolean(error)}
        />
        <Button type="button" size="icon" onClick={addRelay} disabled={disabled || !draft.trim()} title="Add relay">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add relay</span>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {relays.length ? (
        <div className="divide-y rounded-md border">
          {relays.map((relay) => (
            <div key={relay.url} className="grid min-w-0 gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_130px_32px] sm:items-center">
              <span className="truncate font-mono text-sm" title={relay.url}>{relay.url}</span>
              <Select
                value={relay.mode}
                onValueChange={(mode: RelayEntry['mode']) =>
                  onChange(relays.map((candidate) => candidate.url === relay.url ? { ...candidate, mode } : candidate))
                }
                disabled={disabled}
              >
                <SelectTrigger aria-label={`Usage for ${relay.url}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Read + write</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="write">Write</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(relays.filter((candidate) => candidate.url !== relay.url))}
                disabled={disabled}
                title="Remove relay"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove {relay.url}</span>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Add the relays where people should find your events and mentions.
        </div>
      )}
    </div>
  );
}

export function RelayListManager({ pubkey }: RelayListManagerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const relayLists = useRelayLists(pubkey);
  const publish = useNostrPublish();
  const [relayEntries, setRelayEntries] = useState<RelayEntry[]>([]);
  const [favoriteRelays, setFavoriteRelays] = useState<string[]>([]);
  const [setDraft, setSetDraft] = useState<RelaySetDraft | null>(null);
  const [deletingSet, setDeletingSet] = useState<RelaySet | null>(null);
  const [activeSave, setActiveSave] = useState<'routing' | 'favorites' | 'set' | 'delete' | null>(null);

  useEffect(() => {
    setRelayEntries(parseRelayList(relayLists.data?.relayListEvent));
  }, [relayLists.data?.relayListEvent]);

  useEffect(() => {
    setFavoriteRelays(parseFavoriteRelays(relayLists.data?.favoritesEvent));
  }, [relayLists.data?.favoritesEvent]);

  const readCount = relayEntries.filter((relay) => relay.mode !== 'write').length;
  const writeCount = relayEntries.filter((relay) => relay.mode !== 'read').length;
  const setRelayCount = useMemo(
    () => relayLists.data?.relaySets.reduce((total, set) => total + set.relays.length, 0) ?? 0,
    [relayLists.data?.relaySets],
  );

  const finishSave = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['relay-lists', pubkey] });
    toast({ title: 'Published', description: message });
  };

  const saveRoutingRelays = async () => {
    setActiveSave('routing');
    try {
      await publish.mutateAsync({
        kind: RELAY_LIST_KIND,
        created_at: Math.floor(Date.now() / 1000),
        content: '',
        tags: relayEntries.map(({ url, mode }) => mode === 'both' ? ['r', url] : ['r', url, mode]),
      });
      await finishSave('Your NIP-65 read/write relay list is up to date.');
    } catch (error) {
      toast({ title: 'Could not publish relay list', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setActiveSave(null);
    }
  };

  const saveFavorites = async () => {
    setActiveSave('favorites');
    try {
      const linkedSets = relayLists.data?.favoritesEvent?.tags.filter(([name]) => name === 'a') ?? [];
      await publish.mutateAsync({
        kind: FAVORITE_RELAYS_KIND,
        created_at: Math.floor(Date.now() / 1000),
        content: relayLists.data?.favoritesEvent?.content ?? '',
        tags: [...favoriteRelays.map((url) => ['relay', url]), ...linkedSets],
      });
      await finishSave('Your favorite relay feeds are up to date.');
    } catch (error) {
      toast({ title: 'Could not publish favorites', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setActiveSave(null);
    }
  };

  const openSetEditor = (set?: RelaySet) => {
    setSetDraft(set ? {
      identifier: set.identifier,
      title: set.title,
      description: set.description,
      relays: set.relays,
      event: set.event,
    } : { ...emptySetDraft, identifier: crypto.randomUUID() });
  };

  const saveRelaySet = async () => {
    if (!setDraft || !setDraft.title.trim()) return;
    setActiveSave('set');
    try {
      const tags = [
        ['d', setDraft.identifier],
        ['title', setDraft.title.trim()],
        ...(setDraft.description.trim() ? [['description', setDraft.description.trim()]] : []),
        ...setDraft.relays.map((url) => ['relay', url]),
      ];
      await publish.mutateAsync({
        kind: RELAY_SET_KIND,
        created_at: Math.floor(Date.now() / 1000),
        content: setDraft.event?.content ?? '',
        tags,
      });
      setSetDraft(null);
      await finishSave('Your named relay set has been published.');
    } catch (error) {
      toast({ title: 'Could not publish relay set', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setActiveSave(null);
    }
  };

  const deleteRelaySet = async () => {
    if (!deletingSet?.event) return;
    setActiveSave('delete');
    try {
      await publish.mutateAsync({
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        content: 'Relay set removed by its author.',
        tags: [
          ['e', deletingSet.event.id],
          ['a', `${RELAY_SET_KIND}:${pubkey}:${deletingSet.identifier}`],
          ['k', String(RELAY_SET_KIND)],
        ],
      });
      setDeletingSet(null);
      await finishSave('A NIP-09 deletion request was published for the relay set.');
    } catch (error) {
      toast({ title: 'Could not delete relay set', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setActiveSave(null);
    }
  };

  if (relayLists.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-80 w-full" /></div>;
  }

  if (relayLists.isError) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div><p className="font-medium">Relay lists could not be loaded.</p><p className="text-muted-foreground">Check your connection and try again.</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border lg:grid-cols-4">
        {[
          { label: 'Read relays', value: readCount },
          { label: 'Write relays', value: writeCount },
          { label: 'Favorites', value: favoriteRelays.length },
          { label: 'Relays in sets', value: setRelayCount },
        ].map((stat) => (
          <div key={stat.label} className="bg-background px-4 py-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="routing" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="routing" className="gap-2 py-2.5"><RadioTower className="h-4 w-4" /><span className="hidden sm:inline">Read / write</span><span className="sm:hidden">Routing</span></TabsTrigger>
          <TabsTrigger value="favorites" className="gap-2 py-2.5"><BookHeart className="h-4 w-4" />Favorites</TabsTrigger>
          <TabsTrigger value="sets" className="gap-2 py-2.5"><Layers3 className="h-4 w-4" />Relay sets</TabsTrigger>
        </TabsList>

        <TabsContent value="routing">
          <Card>
            <CardHeader>
              <CardTitle>Read and write relays</CardTitle>
              <CardDescription>Kind 10002 tells other clients where to find your events and where to send your mentions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <RelayListEditor relays={relayEntries} onChange={setRelayEntries} disabled={Boolean(activeSave)} />
              <div className="flex justify-end">
                <Button onClick={saveRoutingRelays} disabled={Boolean(activeSave)}>
                  {activeSave === 'routing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Publish kind 10002
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="favorites">
          <Card>
            <CardHeader>
              <CardTitle>Favorite relay feeds</CardTitle>
              <CardDescription>Kind 10012 is your public shortlist of relays worth browsing directly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <RelayUrlEditor relays={favoriteRelays} onChange={setFavoriteRelays} disabled={Boolean(activeSave)} />
              <div className="flex justify-end">
                <Button onClick={saveFavorites} disabled={Boolean(activeSave)}>
                  {activeSave === 'favorites' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Publish kind 10012
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sets" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Named relay sets</h3>
              <p className="text-sm text-muted-foreground">Reusable kind 30002 groups for publishing, reading, or sharing.</p>
            </div>
            <Button onClick={() => openSetEditor()} disabled={Boolean(activeSave)}><Plus className="h-4 w-4" />New set</Button>
          </div>

          {relayLists.data?.relaySets.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {relayLists.data.relaySets.map((set) => (
                <Card key={set.identifier}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{set.title}</CardTitle>
                        <CardDescription className="mt-1 line-clamp-2">{set.description || `${set.relays.length} relay${set.relays.length === 1 ? '' : 's'}`}</CardDescription>
                      </div>
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => openSetEditor(set)} title="Edit relay set"><Pencil className="h-4 w-4" /><span className="sr-only">Edit {set.title}</span></Button>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => setDeletingSet(set)} title="Delete relay set"><Trash2 className="h-4 w-4" /><span className="sr-only">Delete {set.title}</span></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {set.relays.slice(0, 4).map((relay) => <p key={relay} className="truncate font-mono text-xs text-muted-foreground" title={relay}>{relay}</p>)}
                      {set.relays.length > 4 ? <p className="text-xs text-muted-foreground">+{set.relays.length - 4} more</p> : null}
                      {!set.relays.length ? <p className="text-sm text-muted-foreground">This set is empty.</p> : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-6 py-12 text-center">
              <Layers3 className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 font-medium">No named relay sets</p>
              <p className="mt-1 text-sm text-muted-foreground">Create one for a community, topic, or publishing workflow.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(setDraft)} onOpenChange={(open) => !open && setSetDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{setDraft?.event ? 'Edit relay set' : 'Create relay set'}</DialogTitle>
            <DialogDescription>Publish a named, addressable kind 30002 relay group.</DialogDescription>
          </DialogHeader>
          {setDraft ? (
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label htmlFor="relay-set-title">Name</Label>
                <Input id="relay-set-title" value={setDraft.title} onChange={(event) => setSetDraft({ ...setDraft, title: event.target.value })} placeholder="Local community" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="relay-set-description">Description</Label>
                <Textarea id="relay-set-description" value={setDraft.description} onChange={(event) => setSetDraft({ ...setDraft, description: event.target.value })} placeholder="What this relay set is useful for" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Relays</Label>
                <RelayUrlEditor relays={setDraft.relays} onChange={(relays) => setSetDraft({ ...setDraft, relays })} disabled={activeSave === 'set'} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetDraft(null)} disabled={activeSave === 'set'}>Cancel</Button>
            <Button onClick={saveRelaySet} disabled={!setDraft?.title.trim() || activeSave === 'set'}>
              {activeSave === 'set' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Publish set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingSet)} onOpenChange={(open) => !open && setDeletingSet(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deletingSet?.title}?</DialogTitle>
            <DialogDescription>This publishes a NIP-09 deletion request. Copies already held by clients or relays may remain available.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingSet(null)} disabled={activeSave === 'delete'}>Cancel</Button>
            <Button variant="destructive" onClick={deleteRelaySet} disabled={activeSave === 'delete'}>
              {activeSave === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Publish deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

