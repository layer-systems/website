import { useState } from 'react';
import type { NostrMetadata } from '@nostrify/nostrify';
import { Check, Copy, UserRound } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthors } from '@/hooks/useAuthors';
import { useWindowManager } from '@/os/useWindowManager';
import { npubOf, profileName, sanitizeUrl, shortNpub } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';

/** Profile data already resolved by a batched `useAuthors` query. */
export interface ResolvedProfile {
  metadata?: NostrMetadata;
  loading: boolean;
}

/**
 * Identity cell for a pubkey: avatar and display name, with the npub
 * underneath. Names and pictures are untrusted — names render as plain text,
 * pictures go through `sanitizeUrl()`, and the npub is always visible so a
 * copied display name cannot pass for someone else. The hex key stays
 * available as the npub's tooltip.
 *
 * Pass `profile` when a list has batch-fetched its profiles; without it the
 * cell fetches its own profile (a one-key batch, so a missing profile falls
 * back to the npub at once instead of waiting out retries).
 */
export function PubkeyLabel({
  pubkey,
  profile,
  fullNpub,
  className,
}: {
  pubkey: string;
  profile?: ResolvedProfile;
  /** Show the whole npub (wrapped) instead of the shortened form — for confirmations. */
  fullNpub?: boolean;
  className?: string;
}) {
  const { openApp } = useWindowManager();
  const own = useAuthors(profile ? undefined : [pubkey]);
  const metadata = profile ? profile.metadata : own.data?.get(pubkey);
  const loading = profile ? profile.loading : own.isLoading;

  const npub = npubOf(pubkey);
  const name = profileName(metadata);
  const picture = sanitizeUrl(metadata?.picture);
  const label = name ?? shortNpub(pubkey);

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Avatar className="size-7">
        {picture && <AvatarImage src={picture} alt="" />}
        <AvatarFallback className="text-[10px]">
          {name ? name.slice(0, 2).toUpperCase() : <UserRound className="size-3.5" aria-hidden />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        {loading ? (
          <>
            <Skeleton className="mb-1 h-3.5 w-28" />
            <span title={pubkey} className="block truncate font-mono text-[11px] text-muted-foreground">
              {shortNpub(pubkey)}
            </span>
          </>
        ) : (
          <>
            <span className={cn('block truncate text-sm font-medium', !name && 'font-mono text-xs')} title={name ? name : pubkey}>
              {label}
            </span>
            {name && (
              <span
                title={pubkey}
                className={cn(
                  'block font-mono text-[11px] text-muted-foreground',
                  fullNpub ? 'break-all' : 'truncate',
                )}
              >
                {fullNpub ? npub : shortNpub(pubkey)}
              </span>
            )}
            {!name && fullNpub && (
              <span title={pubkey} className="block break-all font-mono text-[11px] text-muted-foreground">
                {npub}
              </span>
            )}
          </>
        )}
      </div>
      <CopyNpubButton npub={npub} label={label} />
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={`Open the profile of ${label}`}
        title="Open profile"
        onClick={() => openApp('profile', { pubkey })}
      >
        <UserRound className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function CopyNpubButton({ npub, label }: { npub: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(npub);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (permissions); the npub stays on screen.
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={copied ? 'Copied npub' : `Copy the npub of ${label}`}
      title="Copy npub"
      onClick={copy}
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}

/**
 * Live preview under a pubkey input: once the value decodes to a key, show
 * who it resolves to before the operator confirms.
 */
export function PubkeyInputPreview({ pubkey }: { pubkey: string | undefined }) {
  if (!pubkey) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-2 py-1.5" aria-live="polite">
      <p className="pb-1 text-[11px] text-muted-foreground">Resolves to</p>
      <PubkeyLabel pubkey={pubkey} fullNpub />
    </div>
  );
}
