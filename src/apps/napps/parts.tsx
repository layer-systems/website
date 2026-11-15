import { useState, type FormEvent } from 'react';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
  DEFAULT_NSITE_GATEWAY,
  isGatewayAllowed,
  NAPP_KIND,
  normalizeGatewayHost,
  nsiteIconUrl,
  type Nsite,
} from '@/lib/nsites';
import { cn } from '@/lib/utils';

/** Icon tile colours, picked from the site address so a site keeps its colour. */
const TILE_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-fuchsia-500 to-purple-600',
  'from-cyan-500 to-sky-600',
  'from-teal-500 to-cyan-700',
];

function gradientFor(site: Nsite): string {
  let hash = 0;
  for (const char of `${site.pubkey}${site.identifier}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TILE_GRADIENTS[Math.abs(hash) % TILE_GRADIENTS.length];
}

/**
 * The site's own icon, loaded from Blossom by hash, or a lettered tile. Images
 * are loaded with no referrer, and an SVG in an `<img>` cannot run script.
 */
export function SiteIcon({ site, name, className }: { site: Nsite; name: string; className?: string }) {
  const url = nsiteIconUrl(site);
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;

  return (
    <span
      className={cn(
        'relative isolate flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[24%] shadow-sm ring-1 ring-black/5',
        showImage ? 'bg-muted' : cn('bg-linear-to-br text-white', gradientFor(site)),
        className,
      )}
      aria-hidden
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span className="absolute inset-0 -z-10 bg-linear-to-b from-white/25 to-transparent" />
          <span className="text-lg font-semibold drop-shadow-sm">{name.slice(0, 1).toUpperCase() || '?'}</span>
        </>
      )}
    </span>
  );
}

export function KindBadge({ site }: { site: Nsite }) {
  const napp = site.kind === NAPP_KIND;
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium',
        napp
          ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
          : 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
      )}
      title={napp ? 'A napp: an nsite with launcher capabilities' : 'An nsite: a static website hosted on Nostr and Blossom'}
    >
      {napp ? 'Napp' : 'Site'}
    </span>
  );
}

export function GatewayDialog({
  open,
  onOpenChange,
  gateway,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gateway: string;
  onSave: (host: string) => void;
}) {
  const [value, setValue] = useState(gateway);
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const host = normalizeGatewayHost(value);
    if (!isGatewayAllowed(host, window.location.hostname)) {
      setError('Enter a hostname such as nsite.lol, without a path. It cannot be this site’s own host.');
      return;
    }
    onSave(host);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(gateway);
          setError(undefined);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Site gateway</DialogTitle>
            <DialogDescription>
              Sites are served by a NIP-5A gateway. Each site gets its own subdomain of it, so it runs
              apart from LAYER and cannot read your keys.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="nsite-gateway">Gateway host</Label>
            <div className="relative">
              <Globe className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="nsite-gateway"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(undefined);
                }}
                placeholder={DEFAULT_NSITE_GATEWAY}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'nsite-gateway-error' : undefined}
                className="pl-8"
              />
            </div>
            {error && (
              <p id="nsite-gateway-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setValue(DEFAULT_NSITE_GATEWAY);
                setError(undefined);
              }}
            >
              Use default
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
