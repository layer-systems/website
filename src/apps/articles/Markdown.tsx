import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { nip19 } from 'nostr-tools';
import { useWindowManager } from '@/os/useWindowManager';
import { sanitizeUrl } from '@/lib/nostrUtils';

/**
 * `react-markdown` builds a React tree and never touches `innerHTML`, so raw
 * HTML inside relay-sourced article bodies is inert without us doing anything.
 * `rehype-sanitize` is kept as a second line of defence: it costs almost
 * nothing and stops a future `rehype-raw` from quietly opening a hole.
 */
const PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeSanitize];

/** Only protocols that cannot execute script survive into an href or src. */
function urlTransform(url: string): string {
  return sanitizeUrl(url) ?? '';
}

export function Markdown({ children }: { children: string }) {
  const { openApp } = useWindowManager();

  const components = useMemo<Components>(
    () => ({
      h1: ({ children: content }) => (
        <h1 className="mt-8 mb-3 text-2xl font-semibold tracking-tight first:mt-0">{content}</h1>
      ),
      h2: ({ children: content }) => (
        <h2 className="mt-7 mb-3 text-xl font-semibold tracking-tight first:mt-0">{content}</h2>
      ),
      h3: ({ children: content }) => (
        <h3 className="mt-6 mb-2 text-lg font-semibold tracking-tight first:mt-0">{content}</h3>
      ),
      p: ({ children: content }) => <p className="my-3 leading-7">{content}</p>,
      ul: ({ children: content }) => <ul className="my-3 list-disc space-y-1 pl-6">{content}</ul>,
      ol: ({ children: content }) => <ol className="my-3 list-decimal space-y-1 pl-6">{content}</ol>,
      blockquote: ({ children: content }) => (
        <blockquote className="my-4 border-l-2 border-primary/40 pl-4 text-muted-foreground italic">
          {content}
        </blockquote>
      ),
      hr: () => <hr className="my-8 border-border" />,
      code: ({ className, children: content }) => {
        const isBlock = typeof className === 'string' && className.startsWith('language-');
        if (isBlock) {
          return <code className="font-mono text-[13px]">{content}</code>;
        }
        return (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{content}</code>
        );
      },
      pre: ({ children: content }) => (
        <pre className="os-scroll my-4 overflow-x-auto rounded-lg border border-border bg-muted/60 p-4">
          {content}
        </pre>
      ),
      table: ({ children: content }) => (
        <div className="os-scroll my-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">{content}</table>
        </div>
      ),
      th: ({ children: content }) => (
        <th className="border-b border-border bg-muted/50 px-3 py-2 text-left font-semibold">
          {content}
        </th>
      ),
      td: ({ children: content }) => (
        <td className="border-b border-border px-3 py-2 last:border-b-0">{content}</td>
      ),
      img: ({ src, alt }) => {
        const safe = typeof src === 'string' ? sanitizeUrl(src) : undefined;
        if (!safe) return null;
        return (
          <img
            src={safe}
            alt={alt ?? ''}
            loading="lazy"
            className="my-4 rounded-lg border border-border"
          />
        );
      },
      // A nostr: link inside an article opens a window rather than navigating
      // away — the reader keeps its place while the mention appears beside it.
      a: ({ href, children: content }) => {
        const target = typeof href === 'string' ? href : '';

        if (target.startsWith('nostr:')) {
          const identifier = target.slice('nostr:'.length);
          return (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                try {
                  const decoded = nip19.decode(identifier);
                  if (decoded.type === 'npub') openApp('profile', { pubkey: decoded.data });
                  else if (decoded.type === 'nprofile')
                    openApp('profile', { pubkey: decoded.data.pubkey });
                  else if (decoded.type === 'note') openApp('notes', { id: decoded.data });
                  else if (decoded.type === 'nevent') openApp('notes', { id: decoded.data.id });
                  else if (decoded.type === 'naddr')
                    openApp('articles', {
                      pubkey: decoded.data.pubkey,
                      kind: String(decoded.data.kind),
                      identifier: decoded.data.identifier,
                    });
                } catch {
                  // An unparseable reference simply does nothing.
                }
              }}
            >
              {content}
            </button>
          );
        }

        const safe = sanitizeUrl(target);
        if (!safe) return <>{content}</>;

        return (
          <a
            href={safe}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
          >
            {content}
          </a>
        );
      },
    }),
    [openApp],
  );

  return (
    <ReactMarkdown
      remarkPlugins={PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      urlTransform={urlTransform}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
