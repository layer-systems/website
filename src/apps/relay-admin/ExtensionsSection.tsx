import { useState } from 'react';
import { Puzzle } from 'lucide-react';

import { useNip86Mutation, type AuditEntry, type Nip86Session } from '@/hooks/useNip86';
import { useToast } from '@/hooks/useToast';
import { TypedConfirmAction, type PendingTypedConfirm } from './dialogs';
import { Section } from './shared';

type AuditFn = (entry: Omit<AuditEntry, 'id' | 'at'>) => void;

/**
 * Relay-specific extensions: advertised method names that are not part of the
 * NIP-86 standard (e.g. a documented event-purge operation). They are kept
 * visually and semantically separate from the core console, and every single
 * one requires typed confirmation — nothing here is assumed to be reversible.
 *
 * The console deliberately does not guess parameters: an extension's argument
 * list is defined by the relay, not by NIP-86, so these operations are
 * triggered without params and the relay's own documentation has the final
 * word on what they do.
 */
export function ExtensionsSection({
  session,
  onResult,
}: {
  session: Nip86Session;
  onResult: AuditFn;
}) {
  const { toast } = useToast();
  const mutation = useNip86Mutation(session, { onResult });
  const [pending, setPending] = useState<PendingTypedConfirm | undefined>(undefined);

  return (
    <Section
      title="Relay-specific extensions"
      description="This relay advertises operations beyond the NIP-86 standard. They are specific to this relay software, may be irreversible, and are never run without typed confirmation."
    >
      <ul className="divide-y divide-border border-t border-dashed border-border">
        {session.extensions.map((method) => (
          <li key={method} className="flex items-center gap-3 px-3 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40">
              <Puzzle className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs font-medium">{method}</p>
              <p className="text-xs text-muted-foreground">
                Not part of NIP-86 — see this relay’s documentation for what it does and what it
                destroys.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setPending({
                  title: `Run ${method}?`,
                  method,
                  phrase: method,
                  effect:
                    'This console sends the operation without parameters. The relay decides the exact behavior; broad or destructive effects (such as purging events) cannot be ruled out.',
                  run: async () => {
                    try {
                      await mutation.mutateAsync({ method, params: [] });
                      toast({ title: `${method} completed` });
                    } catch (error) {
                      toast({
                        title: `${method} failed`,
                        description: error instanceof Error ? error.message : undefined,
                        variant: 'destructive',
                      });
                      throw error;
                    }
                  },
                })
              }
              className="shrink-0 rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Run…
            </button>
          </li>
        ))}
      </ul>

      <TypedConfirmAction pending={pending} onClose={() => setPending(undefined)} />
    </Section>
  );
}
