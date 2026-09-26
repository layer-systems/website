import { ArrowUpRight, Radio } from 'lucide-react';
import { relayLabel } from '@/lib/relayList';

export function RelayRows({ relays }: { relays: { url: string; detail?: string }[] }) {
  return (
    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
      {relays.map(({ url, detail }) => (
        <li key={url} className="flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-primary ring-1 ring-border/70">
            <Radio className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs font-medium" title={url}>{relayLabel(url)}</p>
            {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
          </div>
          <a
            href={url.replace(/^wss:\/\//, 'https://')}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`Open information for ${relayLabel(url)}`}
          >
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
