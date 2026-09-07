import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AuditEntry } from '@/hooks/useNip86';
import { ListEmpty, Section } from './shared';

const STATUS_LABEL: Record<AuditEntry['status'], string> = {
  ok: 'OK',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_TONE: Record<AuditEntry['status'], string> = {
  ok: 'text-success',
  failed: 'text-destructive',
  cancelled: 'text-muted-foreground',
};

/**
 * The session audit log: every management operation with its target, result
 * and operator-safe error detail. Entries are kept in memory only (never
 * persisted), capped, and contain no secrets — the "Copy" export is safe to
 * paste into an incident report.
 */
export function AuditSection({
  audit,
  onClear,
}: {
  audit: AuditEntry[];
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const lines = audit
      .map((entry) =>
        [
          new Date(entry.at).toISOString(),
          entry.status.toUpperCase().padEnd(9),
          entry.method,
          `→ ${entry.target}`,
          entry.detail ? `(${entry.detail})` : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (permissions); the log stays on screen.
    }
  };

  return (
    <Section
      title="Session audit log"
      description="Every operation this window performed, newest last. Kept in memory only; cleared when the window closes."
      actions={
        audit.length > 0 ? (
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={copy}>
              {copied ? (
                <Check className="size-3.5 text-success" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onClear}>
              Clear
            </Button>
          </div>
        ) : undefined
      }
    >
      {audit.length === 0 ? (
        <ListEmpty title="No operations yet" hint="Operations you run against this relay will appear here." />
      ) : (
        <ol className="divide-y divide-border border-t border-border" aria-live="polite">
          {[...audit].reverse().map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {new Date(entry.at).toLocaleTimeString()}
              </span>
              <span className={cn('shrink-0 font-medium', STATUS_TONE[entry.status])}>
                {STATUS_LABEL[entry.status]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-mono">{entry.method}</span>{' '}
                <span className="text-muted-foreground">→ {entry.target}</span>
                {entry.detail && (
                  <span className="block truncate text-muted-foreground" title={entry.detail}>
                    {entry.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
