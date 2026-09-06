import { Fragment, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { useWindowManager } from '@/os/useWindowManager';
import { displayName, sanitizeUrl } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';

/** URLs and bare `nostr:`/bech32 references, in one pass. */
const TOKEN_RE =
  /(https?:\/\/[^\s<>"']+)|(?:nostr:)?((?:npub|nprofile|note|nevent|naddr)1[023456789acdefghjklmnpqrstuvwxyz]+)/gi;

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'url'; value: string }
  | { kind: 'ref'; value: string };

function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ kind: 'text', value: content.slice(lastIndex, index) });
    }
    if (match[1]) {
      tokens.push({ kind: 'url', value: match[1] });
    } else if (match[2]) {
      tokens.push({ kind: 'ref', value: match[2] });
    }
    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) {
    tokens.push({ kind: 'text', value: content.slice(lastIndex) });
  }
  return tokens;
}

/**
 * Renders note text: links, inline media and Nostr references.
 *
 * References become window openers rather than navigations — clicking a
 * mention raises a Profile window next to the note you were reading, which is
 * the whole point of running this as a desktop.
 */
export function NoteContent({ content, className }: { content: string; className?: string }) {
  const tokens = useMemo(() => tokenize(content), [content]);

  return (
    <div className={cn('whitespace-pre-wrap break-words text-[15px] leading-relaxed', className)}>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case 'text':
            return <Fragment key={index}>{token.value}</Fragment>;
          case 'url':
            return <UrlToken key={index} url={token.value} />;
          case 'ref':
            return <RefToken key={index} value={token.value} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

function UrlToken({ url }: { url: string }) {
  const safe = sanitizeUrl(url);
  if (!safe) return <>{url}</>;

  if (IMAGE_RE.test(safe)) {
    return (
      <img
        src={safe}
        alt=""
        loading="lazy"
        className="my-2 max-h-96 w-auto max-w-full rounded-lg border border-border object-contain"
      />
    );
  }

  if (VIDEO_RE.test(safe)) {
    return (
      <video
        src={safe}
        controls
        preload="metadata"
        className="my-2 max-h-96 w-full rounded-lg border border-border"
      />
    );
  }

  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
    >
      {safe.replace(/^https?:\/\//, '')}
    </a>
  );
}

function RefToken({ value }: { value: string }) {
  const { openApp } = useWindowManager();

  const decoded = useMemo(() => {
    try {
      return nip19.decode(value);
    } catch {
      return null;
    }
  }, [value]);

  const pubkey =
    decoded?.type === 'npub'
      ? decoded.data
      : decoded?.type === 'nprofile'
        ? decoded.data.pubkey
        : undefined;

  const author = useAuthor(pubkey);

  if (!decoded) return <>{value}</>;

  if (pubkey) {
    return (
      <button
        type="button"
        onClick={() => openApp('profile', { pubkey })}
        className="font-medium text-primary hover:underline"
      >
        @{displayName(pubkey, author.data?.metadata)}
      </button>
    );
  }

  if (decoded.type === 'note' || decoded.type === 'nevent') {
    const id = decoded.type === 'note' ? decoded.data : decoded.data.id;
    return (
      <button
        type="button"
        onClick={() => openApp('notes', { id })}
        className="font-medium text-primary hover:underline"
      >
        note:{id.slice(0, 8)}
      </button>
    );
  }

  if (decoded.type === 'naddr') {
    const { pubkey: author_, kind, identifier } = decoded.data;
    return (
      <button
        type="button"
        onClick={() =>
          openApp('articles', { pubkey: author_, kind: String(kind), identifier })
        }
        className="font-medium text-primary hover:underline"
      >
        {identifier || 'article'}
      </button>
    );
  }

  return <>{value}</>;
}
