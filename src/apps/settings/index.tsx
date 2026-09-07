import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { LoginArea } from '@/components/auth/LoginArea';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useDecodedImage } from '@/hooks/useDecodedImage';
import { useWindowManager } from '@/os/useWindowManager';
import { desktopApps } from '@/os/registry';
import { useIconLayout } from '@/os/useIconLayout';
import { useToast } from '@/hooks/useToast';
import { npubOf } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import {
  CURATED_WALLPAPERS,
  DEFAULT_CURATED_ID,
  isSafeWallpaperUrl,
  MAX_WALLPAPER_URL_LENGTH,
  resolveCurated,
  type WallpaperFit,
} from '@/lib/wallpaper';
import type { Theme } from '@/contexts/AppContext';
import type { AppProps } from '@/os/types';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsApp({ setTitle }: AppProps) {
  useEffect(() => setTitle('Settings'), [setTitle]);

  return (
    <AppLayout>
      <AppToolbar>
        <span className="text-[13px] font-medium">Settings</span>
      </AppToolbar>

      <AppBody className="px-6 py-5">
        <div className="mx-auto max-w-xl space-y-8">
          <AccountSection />
          <Separator />
          <AppearanceSection />
          <Separator />
          <WallpaperSection />
          <Separator />
          <RelaySection />
          <Separator />
          <MediaSection />
          <Separator />
          <IconLayoutSection />
          <Separator />
          <SessionSection />
        </div>
      </AppBody>
    </AppLayout>
  );
}

function IconLayoutSection() {
  const { toast } = useToast();
  const appIds = desktopApps().map((app) => app.id);
  // Reset uses a deterministic, measurement-free registry order. The desktop
  // clamps it to its actual surface on render; mobile reflows into its columns.
  const { reset } = useIconLayout(appIds, { columns: 8, rows: 16 });

  const resetAndToast = (profile: 'desktop' | 'mobile' | 'both') => {
    reset(profile);
    toast({ title: profile === 'both' ? 'All icon layouts reset' : `${profile === 'desktop' ? 'Desktop' : 'Mobile'} icon layout reset` });
  };

  return (
    <Section
      title="Home screen layout"
      description="Arrange icons by dragging them. On a keyboard, press Space to pick up an icon, use the arrow keys to move it, then press Enter to drop."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => resetAndToast('desktop')}>Reset desktop</Button>
        <Button variant="outline" onClick={() => resetAndToast('mobile')}>Reset mobile</Button>
        <Button variant="outline" onClick={() => resetAndToast('both')}>Reset both</Button>
      </div>
    </Section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function AccountSection() {
  const { user } = useCurrentUser();

  return (
    <Section title="Account" description="The Nostr identity this session signs with.">
      {user ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <p className="min-w-0 truncate font-mono text-xs">{npubOf(user.pubkey)}</p>
          <LoginArea />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground">Not signed in.</p>
          <LoginArea />
        </div>
      )}
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <Section title="Appearance" description="Applies to the desktop and every window.">
      <div className="flex gap-2">
        {THEMES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={theme === option.value}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              theme === option.value
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-border hover:bg-muted',
            )}
          >
            {theme === option.value && <Check className="size-3.5" aria-hidden />}
            {option.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

const MAX_WALLPAPER_FILE_BYTES = 5 * 1024 * 1024;
const MAX_WALLPAPER_DIMENSION = 6000;
// GIFs are excluded: the upload path always re-encodes to JPEG, which would
// silently drop animation/transparency, so we don't advertise GIF support.
const ALLOWED_WALLPAPER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function WallpaperSection() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { mutateAsync: uploadFile, isPending: uploading } = useUploadFile();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selection = config.wallpaper.selection;
  const [urlDraft, setUrlDraft] = useState(selection.source === 'url' ? selection.url : '');
  const [fit, setFit] = useState<WallpaperFit>(selection.source === 'url' ? selection.presentation.fit : 'cover');
  const [dim, setDim] = useState(selection.source === 'url' ? selection.presentation.dim : 0);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | undefined>(undefined);
  const preview = useDecodedImage(pendingPreviewUrl);

  // Keep the draft/presentation fields in sync if the saved selection changes
  // from elsewhere (e.g. the desktop context menu's curated shortcut, or
  // another open Settings window), so this form never shows a stale value.
  // Adjusted during render (mirroring useLocalStorage's "key changed" reset
  // pattern) rather than in a useEffect, since setState synchronously at the
  // top of an effect body is flagged by react-hooks/set-state-in-effect.
  const [trackedSelection, setTrackedSelection] = useState(selection);
  if (trackedSelection !== selection) {
    setTrackedSelection(selection);
    setUrlDraft(selection.source === 'url' ? selection.url : '');
    setFit(selection.source === 'url' ? selection.presentation.fit : 'cover');
    setDim(selection.source === 'url' ? selection.presentation.dim : 0);
    setPendingPreviewUrl(undefined);
  }


  const applyCurated = (id: string) => {
    updateConfig((current) => ({ ...current, wallpaper: { version: 1, selection: { source: 'curated', id } } }));
    setPendingPreviewUrl(undefined);
    toast({ title: `Wallpaper set to ${resolveCurated(id).name}` });
  };

  const requestPreview = () => {
    const trimmed = urlDraft.trim();
    if (!isSafeWallpaperUrl(trimmed)) {
      toast({ title: 'Enter a valid https:// image URL', variant: 'destructive' });
      return;
    }
    if (trimmed.length > MAX_WALLPAPER_URL_LENGTH) {
      toast({ title: 'That URL is too long', description: `URLs must be ${MAX_WALLPAPER_URL_LENGTH} characters or fewer.`, variant: 'destructive' });
      return;
    }
    setPendingPreviewUrl(trimmed);
  };

  const applyUrl = () => {
    const previewedUrl = preview.url;
    if (preview.status !== 'ready' || !previewedUrl || previewedUrl !== urlDraft.trim()) {
      toast({ title: 'Preview the image before saving it', variant: 'destructive' });
      return;
    }
    if (previewedUrl.length > MAX_WALLPAPER_URL_LENGTH) {
      toast({ title: 'That URL is too long', description: `URLs must be ${MAX_WALLPAPER_URL_LENGTH} characters or fewer.`, variant: 'destructive' });
      return;
    }
    updateConfig((current) => ({
      ...current,
      wallpaper: { version: 1, selection: { source: 'url', url: previewedUrl, presentation: { fit, dim } } },
    }));
    toast({ title: 'Wallpaper saved' });
  };

  const onFileSelected = async (file: File | undefined) => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (!ALLOWED_WALLPAPER_TYPES.has(file.type)) {
      toast({ title: 'Unsupported image type', description: 'Use JPEG, PNG, or WebP.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_WALLPAPER_FILE_BYTES) {
      toast({ title: 'Image is too large', description: 'The wallpaper image must be 5 MB or smaller.', variant: 'destructive' });
      return;
    }
    if (!user) {
      toast({ title: 'Sign in required', description: 'Sign in to upload your own image as a wallpaper.', variant: 'destructive' });
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const tooLarge = bitmap.width > MAX_WALLPAPER_DIMENSION || bitmap.height > MAX_WALLPAPER_DIMENSION;
      if (tooLarge) {
        bitmap.close();
        toast({ title: 'Image dimensions too large', description: `Each side must be ${MAX_WALLPAPER_DIMENSION}px or smaller.`, variant: 'destructive' });
        return;
      }

      // Re-encoding through a canvas drops EXIF and any other embedded
      // metadata from the original file before it ever leaves the device.
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        throw new Error('This browser cannot process images.');
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Could not process that image.');

      const sanitizedFile = new File([blob], 'wallpaper.jpg', { type: 'image/jpeg' });
      const tags = await uploadFile(sanitizedFile);
      const uploadedUrl = tags.find(([name, value]) => name === 'url' && value)?.[1];
      if (!uploadedUrl || !isSafeWallpaperUrl(uploadedUrl)) throw new Error('Upload did not return a safe image URL.');
      if (uploadedUrl.length > MAX_WALLPAPER_URL_LENGTH) throw new Error(`Upload returned a URL longer than ${MAX_WALLPAPER_URL_LENGTH} characters.`);

      setUrlDraft(uploadedUrl);
      setPendingPreviewUrl(uploadedUrl);
      toast({ title: 'Uploaded', description: 'Preview it below, then save it as your wallpaper.' });
    } catch (error) {
      toast({
        title: 'Could not upload that image',
        description: error instanceof Error ? error.message : 'Please try a different file.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Section
      title="Wallpaper"
      description="Personalize the desktop background. Curated patterns recolor with your theme and never leave the device; a custom image is saved only in this browser."
    >
      <RadioGroup
        value={selection.source === 'curated' ? selection.id : ''}
        onValueChange={applyCurated}
        aria-label="Curated wallpapers"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {CURATED_WALLPAPERS.map((option) => {
          const active = selection.source === 'curated' && selection.id === option.id;
          return (
            <label
              key={option.id}
              htmlFor={`wallpaper-${option.id}`}
              className={cn(
                'flex cursor-pointer flex-col gap-2 rounded-lg border p-2 text-left transition-colors',
                'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
                active ? 'border-primary bg-accent' : 'border-border hover:bg-muted',
              )}
            >
              <div
                className={cn('h-16 w-full rounded-md border border-border/60', option.className)}
                aria-hidden="true"
              />
              <div className="flex items-center gap-2">
                <RadioGroupItem value={option.id} id={`wallpaper-${option.id}`} />
                <p className="min-w-0 truncate text-xs font-medium">{option.name}</p>
                {active && <Check className="ml-auto size-3.5 shrink-0 text-primary" aria-hidden />}
              </div>
            </label>
          );
        })}
      </RadioGroup>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="wallpaper-url" className="text-sm">Custom image</Label>
          <p className="text-xs text-muted-foreground">
            Must be an https:// URL. Loading a remote image reveals your IP address and the
            time you viewed it to whoever hosts it — it is not previewed until you ask.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            id="wallpaper-url"
            value={urlDraft}
            onChange={(event) => { setUrlDraft(event.target.value); setPendingPreviewUrl(undefined); }}
            placeholder="https://example.com/wallpaper.jpg"
            className="font-mono text-xs"
          />
          <Button variant="outline" onClick={requestPreview} disabled={!urlDraft.trim()}>
            Preview
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload an image'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Upload a local image to use as wallpaper"
            onChange={(event) => { void onFileSelected(event.target.files?.[0]); }}
          />
          {!user && (
            <span className="text-xs text-muted-foreground">
              Sign in to upload your own image (stored on your Blossom server, which may make it publicly accessible).
            </span>
          )}
        </div>

        <div aria-live="polite">
          {preview.status === 'loading' && (
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
              Loading preview…
            </div>
          )}
          {preview.status === 'error' && (
            <p className="text-xs text-destructive">
              Couldn’t load that image. Your current wallpaper has not changed.
            </p>
          )}
          {preview.status === 'ready' && preview.url && (
            <img
              src={preview.url}
              alt="Wallpaper preview"
              referrerPolicy="no-referrer"
              className={cn(
                'h-24 w-full rounded-md border border-border bg-muted',
                fit === 'contain' ? 'object-contain' : 'object-cover',
              )}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <fieldset className="flex items-center gap-2">
            <legend className="text-xs text-muted-foreground">Fit</legend>
            <div className="flex overflow-hidden rounded-md border border-border">
              {(['cover', 'contain'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFit(option)}
                  aria-pressed={fit === option}
                  className={cn(
                    'px-2 py-1 text-xs capitalize transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    fit === option ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex min-w-40 flex-1 items-center gap-2">
            <Label htmlFor="wallpaper-dim" className="shrink-0 text-xs text-muted-foreground">
              Dim {dim}%
            </Label>
            <Slider
              id="wallpaper-dim"
              value={[dim]}
              min={0}
              max={80}
              step={5}
              onValueChange={([value]) => setDim(value)}
              aria-label="Overlay darkness"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={applyUrl} disabled={preview.status !== 'ready'}>
            Save wallpaper
          </Button>
          <Button variant="outline" onClick={() => applyCurated(DEFAULT_CURATED_ID)}>
            Reset to default
          </Button>
        </div>
      </div>
    </Section>
  );
}

function RelaySection() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');

  const relays = config.relayMetadata.relays;

  const addRelay = () => {
    const value = draft.trim();
    if (!value) return;

    let url: string;
    try {
      const parsed = new URL(value.startsWith('ws') ? value : `wss://${value}`);
      if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') throw new Error('bad protocol');
      url = parsed.href;
    } catch {
      toast({ title: 'That is not a valid relay URL', variant: 'destructive' });
      return;
    }

    if (relays.some((relay) => relay.url === url)) {
      toast({ title: 'That relay is already in your list' });
      return;
    }

    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: [...relays, { url, read: true, write: true }],
        updatedAt: Math.floor(Date.now() / 1000),
      },
    }));
    setDraft('');
  };

  const update = (url: string, patch: { read?: boolean; write?: boolean }) => {
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: relays.map((relay) => (relay.url === url ? { ...relay, ...patch } : relay)),
        updatedAt: Math.floor(Date.now() / 1000),
      },
    }));
  };

  const remove = (url: string) => {
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: relays.filter((relay) => relay.url !== url),
        updatedAt: Math.floor(Date.now() / 1000),
      },
    }));
  };

  return (
    <Section
      title="Relays"
      description="Read relays supply your feeds; write relays receive what you publish."
    >
      <ul className="divide-y divide-border rounded-lg border border-border">
        {relays.map((relay) => (
          <li key={relay.url} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {relay.url.replace(/^wss:\/\//, '').replace(/\/$/, '')}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={relay.read}
                onCheckedChange={(checked) => update(relay.url, { read: checked })}
                aria-label={`Read from ${relay.url}`}
              />
              read
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={relay.write}
                onCheckedChange={(checked) => update(relay.url, { write: checked })}
                aria-label={`Write to ${relay.url}`}
              />
              write
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => remove(relay.url)}
              aria-label={`Remove ${relay.url}`}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </li>
        ))}
        {relays.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            No relays. Add one below.
          </li>
        )}
      </ul>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && addRelay()}
          placeholder="wss://relay.example.com"
          className="font-mono text-xs"
          aria-label="New relay URL"
        />
        <Button onClick={addRelay} className="gap-1.5" disabled={!draft.trim()}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
    </Section>
  );
}

function MediaSection() {
  const { config, updateConfig } = useAppContext();

  return (
    <Section
      title="Media servers"
      description="Blossom servers store the images and files you upload."
    >
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="app-blossom" className="text-sm">
            Include the app defaults
          </Label>
          <p className="text-xs text-muted-foreground">
            Falls back to this app’s servers alongside your own.
          </p>
        </div>
        <Switch
          id="app-blossom"
          checked={config.useAppBlossomServers}
          onCheckedChange={(checked) =>
            updateConfig((current) => ({ ...current, useAppBlossomServers: checked }))
          }
        />
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {config.blossomServerMetadata.servers.map((server) => (
          <li key={server} className="truncate px-3 py-2 font-mono text-xs">
            {server}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SessionSection() {
  const { resetSession } = useWindowManager();
  const { toast } = useToast();

  return (
    <Section
      title="Session"
      description="Your open windows and their positions are remembered between visits."
    >
      <Button
        variant="outline"
        onClick={() => {
          resetSession();
          toast({ title: 'Session reset' });
        }}
      >
        Close everything and forget the layout
      </Button>
    </Section>
  );
}
