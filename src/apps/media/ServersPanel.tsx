import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { AppBody } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from '@/hooks/useAppContext';
import { usePublishBlossomServers, type BlossomLibrary } from '@/hooks/useBlossom';
import { useToast } from '@/hooks/useToast';
import { normalizeServerUrl, serverLabel } from '@/lib/blossom';
import { ServerStatusBadge } from './shared';

/**
 * Edits the user's BUD-03 server list (kind 10063). Changes collect in a
 * draft and are published together, so reordering doesn't prompt the signer
 * once per click.
 */
export function ServersPanel({ library }: { library: BlossomLibrary }) {
  const { config, updateConfig } = useAppContext();
  const publish = usePublishBlossomServers();
  const { toast } = useToast();
  const saved = config.blossomServerMetadata.servers;
  const [draft, setDraft] = useState<string[] | null>(null);
  const [input, setInput] = useState('');

  const servers = draft ?? saved;
  const dirty = draft !== null && (draft.length !== saved.length || draft.some((server, index) => server !== saved[index]));
  const mine = new Set(saved.map((server) => normalizeServerUrl(server)));

  const add = () => {
    const value = input.trim();
    if (!value) return;
    const normalized = normalizeServerUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!normalized || !normalized.startsWith('https://')) {
      toast({ title: 'Enter a valid https:// server URL', variant: 'destructive' });
      return;
    }
    if (servers.some((server) => normalizeServerUrl(server) === normalized)) {
      toast({ title: 'That server is already in your list' });
      return;
    }
    setDraft([...servers, normalized]);
    setInput('');
  };

  const move = (index: number, delta: number) => {
    const next = [...servers];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setDraft(next);
  };

  const save = async () => {
    try {
      await publish.mutateAsync(servers);
      setDraft(null);
      toast({ title: 'Server list published' });
    } catch (error) {
      toast({
        title: 'Could not publish your server list',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  return (
    <AppBody>
      <div className="mx-auto max-w-2xl space-y-8 p-4">
        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold tracking-tight">Your servers</h2>
            <p className="text-sm text-muted-foreground">
              Published as your Blossom server list (kind 10063), so other apps know where to find your files. The first server is
              where uploads land first.
            </p>
          </div>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {servers.map((server, index) => (
              <li key={server} className="flex items-center gap-2 px-3 py-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{server}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${serverLabel(server)} up`}
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => move(index, 1)}
                  disabled={index === servers.length - 1}
                  aria-label={`Move ${serverLabel(server)} down`}
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setDraft(servers.filter((item) => item !== server))}
                  aria-label={`Remove ${serverLabel(server)}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
            {servers.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">No servers of your own. Add one below.</li>
            )}
          </ul>

          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && add()}
              placeholder="https://blossom.example.com"
              className="font-mono text-xs"
              aria-label="New server URL"
            />
            <Button onClick={add} variant="outline" className="gap-1.5" disabled={!input.trim()}>
              <Plus className="size-4" aria-hidden /> Add
            </Button>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={publish.isPending}>
                Discard changes
              </Button>
            )}
            <Button onClick={() => void save()} disabled={!dirty || publish.isPending} className="gap-1.5">
              {publish.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save and publish
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="media-app-blossom" className="text-sm">Include the app defaults</Label>
              <p className="text-xs text-muted-foreground">Also use this app’s servers alongside your own. Stored only in this browser.</p>
            </div>
            <Switch
              id="media-app-blossom"
              checked={config.useAppBlossomServers}
              onCheckedChange={(checked) => updateConfig((current) => ({ ...current, useAppBlossomServers: checked }))}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold tracking-tight">Server status</h2>
            <p className="text-sm text-muted-foreground">Every server this app currently uploads to and lists from.</p>
          </div>
          {library.servers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              No servers in use. Add one above or include the app defaults.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {library.states.map((state) => (
                <li key={state.url} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{serverLabel(state.url)}</p>
                    <p className="text-xs text-muted-foreground">
                      {mine.has(state.url) ? 'Your server' : 'App default'}
                      {state.blobCount !== undefined && ` · ${state.blobCount} ${state.blobCount === 1 ? 'file' : 'files'}`}
                    </p>
                  </div>
                  <ServerStatusBadge state={state} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppBody>
  );
}
