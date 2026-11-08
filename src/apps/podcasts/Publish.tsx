import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Info, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { Markdown } from '@/apps/articles/Markdown';
import { useBlossomServers, useBlossomUpload } from '@/hooks/useBlossom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { parseItemInput } from '@/lib/nip51';
import { npubOf, shortNpub } from '@/lib/nostrUtils';
import {
  PODCAST_EPISODE_KIND,
  PODCAST_ROLES,
  buildEpisodeTags,
  buildMetadataTags,
  parseEpisode,
  safeHttpsUrl,
  type AudioSource,
  type PodcastRole,
  type PodcastShow,
} from '@/lib/podcasts';
import { useOwnShow, usePublishEpisode, usePublishShow } from './hooks';
import { Artwork } from './shared';

/** Stable keys for editable rows. */
let rowKeys = 0;
function newRowKey() {
  rowKeys += 1;
  return rowKeys;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Alert({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={tone === 'error'
        ? 'rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive'
        : 'rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground'}
    >
      {children}
    </p>
  );
}

/**
 * Uploads one file to the user's Blossom servers. Upload failures are kept
 * apart from publishing failures, so it is clear which step to retry.
 */
function UploadButton({
  accept,
  kind,
  label,
  onUploaded,
}: {
  accept: string;
  kind: 'audio' | 'image';
  label: string;
  onUploaded: (url: string, type: string | undefined) => void;
}) {
  const servers = useBlossomServers();
  const upload = useBlossomUpload();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    if (!file.type.startsWith(`${kind}/`)) {
      setError(`Choose ${kind === 'audio' ? 'an audio' : 'an image'} file.`);
      return;
    }
    try {
      const { descriptor } = await upload.mutateAsync({
        file,
        servers,
        onProgress: (step) => setProgress(step.phase === 'uploading' ? `Uploading ${Math.round(step.fraction * 100)}%` : `${step.phase[0].toUpperCase()}${step.phase.slice(1)}…`),
      });
      const url = safeHttpsUrl(descriptor.url);
      if (!url) throw new Error('The server returned a URL that isn’t https.');
      onUploaded(url, descriptor.type || file.type || undefined);
    } catch (reason) {
      setError(`Upload failed: ${errorText(reason, 'the media server rejected the file.')}`);
    } finally {
      setProgress(undefined);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => void onFile(event.target.files?.[0])} />
      <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={upload.isPending || servers.length === 0} onClick={() => input.current?.click()}>
        {upload.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Upload className="size-3.5" aria-hidden />}
        {upload.isPending ? progress ?? 'Uploading…' : label}
      </Button>
      {servers.length === 0 && <p className="text-xs text-muted-foreground">Add a Blossom media server in Settings to upload files.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function Publish({ onPublished }: { onPublished: (id: string) => void }) {
  const { user } = useCurrentUser();
  const own = useOwnShow();

  if (!user) return <LoginRequired action="publish a podcast" />;

  return (
    <div className="space-y-6 p-4">
      <div className="flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">This account is the show.</p>
          <p className="text-muted-foreground">
            In NIP-F4 every podcast is its own Nostr key. Everything here is signed by the account you’re signed in with
            (<span className="font-mono">{shortNpub(user.pubkey)}</span>), so that key <em>is</em> the show identity. You can’t
            publish for another show’s key. To run a separate show, sign in with an account dedicated to it.
          </p>
        </div>
      </div>

      {own.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-32 w-full" /></div>
      ) : (
        <ShowForm key={own.show?.eventId ?? 'new'} initial={own.show} pubkey={user.pubkey} loadFailed={own.isError} />
      )}
      <EpisodeForm hasShow={Boolean(own.show)} showTitle={own.show?.title} showImage={own.show?.image} onPublished={onPublished} />
    </div>
  );
}

interface PersonRow {
  key: number;
  value: string;
  role: PodcastRole | '';
}

function ShowForm({ initial, pubkey, loadFailed }: { initial?: PodcastShow; pubkey: string; loadFailed: boolean }) {
  const id = useId();
  const publish = usePublishShow();
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [image, setImage] = useState(initial?.image ?? '');
  const [websites, setWebsites] = useState(initial?.websites.join('\n') ?? '');
  const [people, setPeople] = useState<PersonRow[]>(
    () => initial?.people.map((person, index) => ({ key: index, value: npubOf(person.pubkey), role: person.role ?? '' })) ?? [],
  );
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const parsedPeople = [];
    for (const row of people.filter((candidate) => candidate.value.trim())) {
      const parsed = parseItemInput('p', row.value);
      if (!parsed.ok) {
        setError(`“${row.value}”: ${parsed.error}`);
        return;
      }
      parsedPeople.push({ pubkey: parsed.tag[1], role: row.role || undefined });
    }
    const input = { title, description, image, websites: websites.split(/\s+/), people: parsedPeople };
    const check = buildMetadataTags(input, pubkey);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    try {
      await publish.mutateAsync((previous) => {
        const result = buildMetadataTags(input, pubkey, previous);
        if (!result.ok) throw new Error(result.error);
        return result.tags;
      });
      toast({ title: initial ? 'Show updated' : 'Show published' });
    } catch (reason) {
      setError(`Publishing failed: ${errorText(reason, 'your relays didn’t accept the update.')} Your edits are still here.`);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight">{initial ? 'Show details' : 'Create your show'}</h2>
        <p className="text-sm text-muted-foreground">Published as NIP-F4 podcast metadata (kind 10154). Saving replaces the previous version.</p>
      </div>
      {loadFailed && <Alert tone="info">Your current show details couldn’t be loaded. Saving will re-check your relays first and stop if they don’t answer.</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <Field label="Title" htmlFor={`${id}-title`}>
            <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
          </Field>
          <Field label="Description" htmlFor={`${id}-description`}>
            <Textarea id={`${id}-description`} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={5000} />
          </Field>
        </div>
        <Artwork src={safeHttpsUrl(image)} alt="Cover preview" className="size-28 rounded-xl" />
      </div>
      <Field label="Cover image URL" htmlFor={`${id}-image`} hint="https:// only. Square artwork works best.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id={`${id}-image`} type="url" inputMode="url" value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://…" />
          <UploadButton accept="image/*" kind="image" label="Upload image" onUploaded={(url) => setImage(url)} />
        </div>
      </Field>
      <Field label="Websites" htmlFor={`${id}-websites`} hint="One https:// URL per line.">
        <Textarea id={`${id}-websites`} value={websites} onChange={(event) => setWebsites(event.target.value)} rows={2} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">People</legend>
        <p className="text-xs text-muted-foreground">
          Listing someone is only a claim. Listeners see it as confirmed once that person adds this show to their own authored-podcasts list
          (they can do it from the show’s page).
        </p>
        {people.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Person (npub or hex key)"
              value={row.value}
              onChange={(event) => setPeople((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, value: event.target.value } : candidate))}
              placeholder="npub1…"
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <select
              aria-label="Role"
              value={row.role}
              onChange={(event) => setPeople((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, role: event.target.value as PodcastRole | '' } : candidate))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="">No role</option>
              {PODCAST_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <Button type="button" size="icon" variant="ghost" aria-label="Remove person" onClick={() => setPeople((rows) => rows.filter((candidate) => candidate.key !== row.key))}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setPeople((rows) => [...rows, { key: newRowKey(), value: '', role: 'host' }])}>
          <Plus className="size-3.5" aria-hidden /> Add person
        </Button>
      </fieldset>

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={publish.isPending}>
          {publish.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {publish.isPending ? 'Publishing…' : initial ? 'Save show details' : 'Publish show'}
        </Button>
      </div>
    </form>
  );
}

interface SourceRow extends AudioSource {
  key: number;
}

function EpisodeForm({
  hasShow,
  showTitle,
  showImage,
  onPublished,
}: {
  hasShow: boolean;
  showTitle?: string;
  showImage?: string;
  onPublished: (id: string) => void;
}) {
  const id = useId();
  const { user } = useCurrentUser();
  const publish = usePublishEpisode();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [notes, setNotes] = useState('');
  const [sources, setSources] = useState<SourceRow[]>([{ key: 0, url: '', type: '' }]);
  const [sensitive, setSensitive] = useState(false);
  const [warning, setWarning] = useState('');
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string>();

  const input = {
    title,
    description,
    image,
    sources: sources.filter((source) => source.url.trim()).map(({ url, type }) => ({ url: url.trim(), type: type?.trim() || undefined })),
    contentWarning: sensitive ? warning : undefined,
  };
  const built = buildEpisodeTags(input);

  // Exactly what a reader will parse, so the preview can't promise more than the event holds.
  const previewEpisode = built.ok && user
    ? parseEpisode({ id: '0'.repeat(64), pubkey: user.pubkey, kind: PODCAST_EPISODE_KIND, created_at: 0, tags: built.tags, content: notes, sig: '' })
    : undefined;

  const updateSource = (key: number, patch: Partial<SourceRow>) =>
    setSources((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const reset = () => {
    setTitle(''); setDescription(''); setImage(''); setNotes(''); setSensitive(false); setWarning(''); setPreview(false);
    setSources([{ key: newRowKey(), url: '', type: '' }]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    try {
      const published = await publish.mutateAsync({ tags: built.tags, notes });
      toast({ title: 'Episode published', description: 'Episodes can’t be edited after publishing.' });
      reset();
      onPublished(published.id);
    } catch (reason) {
      setError(`Publishing failed: ${errorText(reason, 'your relays didn’t accept the episode.')} Nothing was lost — try again.`);
    }
  };

  return (
    <form className="space-y-4 border-t border-border pt-6" onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight">New episode</h2>
        <p className="text-sm text-muted-foreground">
          Published as a NIP-F4 episode (kind 54){showTitle ? ` of “${showTitle}”` : ''}. Episodes are regular events: once published they can’t be edited in place.
        </p>
      </div>
      {!hasShow && <Alert tone="info">Publish your show details first, so listeners see a title and cover next to this episode.</Alert>}

      <Field label="Title" htmlFor={`${id}-title`}>
        <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required />
      </Field>
      <Field label="Short description" htmlFor={`${id}-description`}>
        <Textarea id={`${id}-description`} value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={2000} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Audio</legend>
        <p className="text-xs text-muted-foreground">An https:// URL, or upload a file to your Blossom servers. Add more sources as fallbacks (e.g. another format or mirror).</p>
        {sources.map((source, index) => (
          <div key={source.key} className="flex flex-wrap items-start gap-2">
            <Input
              aria-label={`Audio URL ${index + 1}`}
              type="url"
              inputMode="url"
              value={source.url}
              onChange={(event) => updateSource(source.key, { url: event.target.value })}
              placeholder="https://…/episode.mp3"
              className="min-w-0 flex-1 basis-56"
            />
            <Input
              aria-label={`Media type ${index + 1}`}
              value={source.type ?? ''}
              onChange={(event) => updateSource(source.key, { type: event.target.value })}
              placeholder="audio/mpeg"
              className="w-32"
            />
            <UploadButton accept="audio/*" kind="audio" label="Upload" onUploaded={(url, type) => updateSource(source.key, { url, type: type ?? '' })} />
            {sources.length > 1 && (
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove audio source ${index + 1}`} onClick={() => setSources((rows) => rows.filter((row) => row.key !== source.key))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {sources.length < 4 && (
          <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setSources((rows) => [...rows, { key: newRowKey(), url: '', type: '' }])}>
            <Plus className="size-3.5" aria-hidden /> Add another source
          </Button>
        )}
      </fieldset>

      <Field label="Episode artwork URL (optional)" htmlFor={`${id}-image`} hint="Falls back to the show cover.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id={`${id}-image`} type="url" inputMode="url" value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://…" />
          <UploadButton accept="image/*" kind="image" label="Upload image" onUploaded={(url) => setImage(url)} />
        </div>
      </Field>

      <Field label="Show notes (Markdown)" htmlFor={`${id}-notes`}>
        <Textarea id={`${id}-notes`} value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} className="font-mono text-sm" />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-cw`} checked={sensitive} onCheckedChange={(checked) => setSensitive(checked === true)} />
          <Label htmlFor={`${id}-cw`}>Add a content warning</Label>
        </div>
        {sensitive && <Input aria-label="Content warning reason" value={warning} onChange={(event) => setWarning(event.target.value)} placeholder="Reason (optional)" maxLength={200} />}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setPreview((open) => !open)} aria-expanded={preview} disabled={!previewEpisode}>
          {preview ? 'Hide preview' : 'Preview'}
        </Button>
        <Button type="submit" disabled={publish.isPending}>
          {publish.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {publish.isPending ? 'Publishing…' : 'Publish episode'}
        </Button>
      </div>
      {!built.ok && (title || input.sources.length > 0) && <p className="text-right text-xs text-muted-foreground">{built.error}</p>}
      {error && <Alert tone="error">{error}</Alert>}

      {preview && previewEpisode && (
        <section aria-label="Episode preview" className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex gap-3">
            <Artwork src={previewEpisode.image ?? showImage} className="size-20" />
            <div className="min-w-0">
              <p className="font-semibold">{previewEpisode.title}</p>
              <p className="text-sm text-muted-foreground">{showTitle ?? 'Your show'}</p>
              {previewEpisode.contentWarning !== undefined && <p className="text-xs text-muted-foreground">Content warning{previewEpisode.contentWarning ? `: ${previewEpisode.contentWarning}` : ''}</p>}
            </div>
          </div>
          {previewEpisode.description && <p className="whitespace-pre-wrap text-sm">{previewEpisode.description}</p>}
          <audio controls preload="none" src={previewEpisode.sources[0].url} className="w-full" aria-label="Test the first audio source">
            Your browser can’t play this audio.
          </audio>
          {previewEpisode.notes.trim() && <div className="border-t border-border pt-2 text-sm"><Markdown>{previewEpisode.notes}</Markdown></div>}
        </section>
      )}
    </form>
  );
}
