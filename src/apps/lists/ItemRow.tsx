import type { ReactNode } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { ArrowDown, ArrowUp, FileText, Lock, LockOpen, Radio, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthor } from '@/hooks/useAuthor';
import { useRelayStatus } from '@/hooks/useRelayStatus';
import { useWindowManager } from '@/os/useWindowManager';
import { isCalendarEventKind } from '@/lib/calendarEvents';
import { listKindInfo, normalizeRelayUrl } from '@/lib/nip51';
import { displayName, npubOf, tagValue } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import { parseAddressValue, safeImageUrl } from './listUtils';
import { PrivateBadge } from './shared';

export interface ItemControls {
  isPrivate: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onTogglePrivacy: () => void;
  onRemove: () => void;
  /** Private items can't be written without NIP-44; the toggle is disabled then. */
  canMakePrivate: boolean;
  disabled: boolean;
}

interface ItemRowProps {
  tag: string[];
  references: Map<string, NostrEvent> | undefined;
  referencesLoading: boolean;
  /** Opens a referenced list (an `a` item pointing at a set) inside the Lists app. */
  onOpenList: (kind: number, pubkey: string, identifier: string) => void;
  controls?: ItemControls;
  isPrivate: boolean;
}

export function ItemRow({ tag, references, referencesLoading, onOpenList, controls, isPrivate }: ItemRowProps) {
  const [name, value] = tag;

  let content: ReactNode;
  switch (name) {
    case 'p':
      content = <ProfileItem pubkey={value} />;
      break;
    case 'e':
      content = <NoteItem id={value} event={references?.get(value)} loading={referencesLoading} />;
      break;
    case 'a':
      content = (
        <AddressItem address={value} event={references?.get(value)} loading={referencesLoading} onOpenList={onOpenList} />
      );
      break;
    case 'relay':
      content = <RelayItem url={value} />;
      break;
    case 't':
      content = <Chip>#{value}</Chip>;
      break;
    case 'word':
      content = <Chip>“{value}”</Chip>;
      break;
    case 'emoji':
      content = <EmojiItem shortcode={value} url={tag[2]} />;
      break;
    default:
      content = <span className="truncate font-mono text-xs text-muted-foreground">{tag.join(' · ')}</span>;
  }

  return (
    <li className="group flex items-center gap-2 border-b border-border px-4 py-2 last:border-b-0 motion-safe:transition-colors hover:bg-muted/40">
      <div className="min-w-0 flex-1">{content}</div>
      {isPrivate && <Lock className="size-3.5 shrink-0 text-muted-foreground sm:hidden" aria-label="Private" />}
      {isPrivate && <PrivateBadge className="hidden shrink-0 sm:inline-flex" />}
      {controls && <Controls controls={controls} />}
    </li>
  );
}

function Controls({ controls }: { controls: ItemControls }) {
  const { isPrivate, canMoveUp, canMoveDown, onMove, onTogglePrivacy, onRemove, canMakePrivate, disabled } = controls;
  const toggleDisabled = disabled || (!isPrivate && !canMakePrivate);

  return (
    <div className="flex shrink-0 items-center">
      <Button variant="ghost" size="icon" className="size-8" aria-label="Move up" disabled={disabled || !canMoveUp} onClick={() => onMove(-1)}>
        <ArrowUp className="size-3.5" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Move down" disabled={disabled || !canMoveDown} onClick={() => onMove(1)}>
        <ArrowDown className="size-3.5" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={isPrivate ? 'Make public' : 'Make private'}
        title={
          !isPrivate && !canMakePrivate
            ? 'Your signer can’t encrypt with NIP-44'
            : isPrivate
              ? 'Make public'
              : 'Make private'
        }
        disabled={toggleDisabled}
        onClick={onTogglePrivacy}
      >
        {isPrivate ? <LockOpen className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
      </Button>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Remove" disabled={disabled} onClick={onRemove}>
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[13px]">
      {children}
    </span>
  );
}

function ProfileItem({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const { openApp } = useWindowManager();
  const name = displayName(pubkey, author.data?.metadata);
  const picture = safeImageUrl(author.data?.metadata?.picture);

  return (
    <button
      type="button"
      onClick={() => openApp('profile', { pubkey })}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Avatar className="size-8">
        {picture && <AvatarImage src={picture} alt="" />}
        <AvatarFallback className="text-[11px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium">{name}</span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground">{npubOf(pubkey).slice(0, 20)}…</span>
      </span>
    </button>
  );
}

function NoteItem({ id, event, loading }: { id: string; event: NostrEvent | undefined; loading: boolean }) {
  const { openApp } = useWindowManager();
  const author = useAuthor(event?.pubkey);
  const snippet = event?.content.replace(/\s+/g, ' ').trim().slice(0, 160);

  return (
    <button
      type="button"
      onClick={() => openApp('notes', { id })}
      className="flex w-full min-w-0 items-start gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
    >
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        {event ? (
          <>
            <span className="block truncate text-xs text-muted-foreground">{displayName(event.pubkey, author.data?.metadata)}</span>
            <span className="line-clamp-2 text-[14px]">{snippet || 'Empty note'}</span>
          </>
        ) : (
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {loading ? 'Loading note…' : `Note not found · ${id.slice(0, 12)}…`}
          </span>
        )}
      </span>
    </button>
  );
}

function AddressItem({
  address,
  event,
  loading,
  onOpenList,
}: {
  address: string;
  event: NostrEvent | undefined;
  loading: boolean;
  onOpenList: (kind: number, pubkey: string, identifier: string) => void;
}) {
  const { openApp } = useWindowManager();
  const parts = parseAddressValue(address);
  const author = useAuthor(parts?.pubkey);

  if (!parts) {
    return <span className="truncate font-mono text-xs text-muted-foreground">{address}</span>;
  }

  const listInfo = listKindInfo(parts.kind);
  const title =
    (event && (tagValue(event, 'title') || tagValue(event, 'name'))) || parts.identifier || `Kind ${parts.kind}`;
  const typeLabel = listInfo?.noun ?? (parts.kind === 30023 ? 'article' : parts.kind === 34550 ? 'community' : `kind ${parts.kind}`);

  const open = () => {
    if (listInfo) onOpenList(parts.kind, parts.pubkey, parts.identifier);
    else if (isCalendarEventKind(parts.kind)) openApp('calendar', { pubkey: parts.pubkey, kind: String(parts.kind), identifier: parts.identifier });
    else openApp('articles', { pubkey: parts.pubkey, kind: String(parts.kind), identifier: parts.identifier });
  };
  const openable = Boolean(listInfo) || parts.kind === 30023 || isCalendarEventKind(parts.kind);

  const body = (
    <span className="min-w-0">
      <span className="block truncate text-[14px] font-medium">{loading && !event ? 'Loading…' : title}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {typeLabel} · {displayName(parts.pubkey, author.data?.metadata)}
      </span>
    </span>
  );

  return openable ? (
    <button
      type="button"
      onClick={open}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
    >
      {body}
    </button>
  ) : (
    body
  );
}

function RelayItem({ url }: { url: string }) {
  const { relays } = useRelayStatus();
  const normalized = normalizeRelayUrl(url);
  const status = relays.find((relay) => normalizeRelayUrl(relay.url) === normalized);
  const connected = status?.state === 'open';
  const label = connected ? 'Connected' : status ? status.state === 'idle' ? 'In your pool, idle' : status.state : 'Not in your pool';

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Radio className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate font-mono text-[13px]">{url}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-muted-foreground/50')} aria-hidden />
          {label}
        </span>
      </span>
    </span>
  );
}

function EmojiItem({ shortcode, url }: { shortcode: string; url: string | undefined }) {
  const src = safeImageUrl(url);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {src ? (
        <img src={src} alt="" className="size-7 shrink-0 rounded object-contain" loading="lazy" />
      ) : (
        <span className="size-7 shrink-0 rounded bg-muted" aria-hidden />
      )}
      <span className="truncate font-mono text-[13px]">:{shortcode}:</span>
      {!src && <span className="text-xs text-muted-foreground">(no safe image)</span>}
    </span>
  );
}
