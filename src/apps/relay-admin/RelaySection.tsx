import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useNip86Mutation,
  type AuditEntry,
  type Nip86Session,
} from '@/hooks/useNip86';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/nostrUtils';
import { sanitizeIconUrl as validateIconUrl } from '@/lib/nip86';
import { Field, FormDialog } from './dialogs';
import { Section } from './shared';

type AuditFn = (entry: Omit<AuditEntry, 'id' | 'at'>) => void;

type PresentationMethod = 'changerelayname' | 'changerelaydescription' | 'changerelayicon';

const FIELDS: Record<
  PresentationMethod,
  { title: string; label: string; description: string; placeholder: string; multiline?: boolean }
> = {
  changerelayname: {
    title: 'Change relay name',
    label: 'Relay name',
    description: 'The name the relay publishes in its NIP-11 information document.',
    placeholder: 'My relay',
  },
  changerelaydescription: {
    title: 'Change relay description',
    label: 'Description',
    description: 'The description the relay publishes in its NIP-11 information document.',
    placeholder: 'What this relay is for, who may use it, …',
    multiline: true,
  },
  changerelayicon: {
    title: 'Change relay icon',
    label: 'Icon URL',
    description: 'An https:// image URL the relay publishes as its icon.',
    placeholder: 'https://example.com/icon.png',
  },
};

/**
 * Relay presentation: name, description and icon as published in the relay's
 * NIP-11 document. The current values come from the discovery-time NIP-11
 * fetch and are shown read-only; each change previews before it is sent. The
 * list re-reads the document on demand rather than trusting the mutation.
 */
export function RelayPresentationSection({
  session,
  onResult,
}: {
  session: Nip86Session;
  onResult: AuditFn;
}) {
  const { toast } = useToast();
  const mutation = useNip86Mutation(session, { onResult });
  const [editing, setEditing] = useState<PresentationMethod | undefined>(undefined);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [openFor, setOpenFor] = useState<PresentationMethod | undefined>(undefined);

  const available = (Object.keys(FIELDS) as PresentationMethod[]).filter((method) =>
    session.methods.includes(method),
  );

  const current = (method: PresentationMethod): string | undefined =>
    method === 'changerelayname'
      ? session.info?.name
      : method === 'changerelaydescription'
        ? session.info?.description
        : session.info?.icon;

  // Render-phase reset when a different field is opened.
  if (editing !== openFor) {
    setOpenFor(editing);
    setValue(editing ? (current(editing) ?? '') : '');
    setError(undefined);
  }

  const iconPreview = editing === 'changerelayicon' ? sanitizeUrl(value.trim()) : undefined;
  const iconValid =
    editing === 'changerelayicon'
      ? typeof validateIconUrl(value) === 'string'
        ? undefined
        : (validateIconUrl(value) as { error: string }).error
      : undefined;

  const submit = async () => {
    if (!editing) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter a value.');
      return;
    }
    if (editing === 'changerelayicon') {
      const result = validateIconUrl(trimmed);
      if (typeof result !== 'string') {
        setError(result.error);
        return;
      }
    }
    try {
      await mutation.mutateAsync({ method: editing, params: [trimmed] });
      toast({ title: `${FIELDS[editing].label} updated` });
      setEditing(undefined);
    } catch (cause) {
      toast({
        title: 'The relay refused the change',
        description: cause instanceof Error ? cause.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <Section
      title="Relay presentation"
      description="Name, description and icon as published in the relay’s NIP-11 information document. Only the fields this relay advertises can be changed."
    >
      <ul className="divide-y divide-border border-t border-border">
        {available.map((method) => {
          const field = FIELDS[method];
          const existing = current(method);
          return (
            <li key={method} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{field.label}</p>
                {existing ? (
                  method === 'changerelayicon' ? (
                    <span className="mt-1 flex items-center gap-2">
                      <IconPreview url={existing} />
                      <span className="truncate font-mono text-xs text-muted-foreground" title={existing}>
                        {existing}
                      </span>
                    </span>
                  ) : (
                    <p className="truncate text-xs text-muted-foreground" title={existing}>
                      {existing}
                    </p>
                  )
                ) : (
                  <p className="text-xs italic text-muted-foreground">not set</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => setEditing(method)}
              >
                Change
              </Button>
            </li>
          );
        })}
      </ul>

      <FormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(undefined)}
        title={editing ? FIELDS[editing].title : ''}
        description={editing ? FIELDS[editing].description : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(undefined)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={mutation.isPending || !value.trim() || Boolean(iconValid)}>
              {mutation.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Save
            </Button>
          </>
        }
      >
        <Field
          id="presentation-value"
          label={editing ? FIELDS[editing].label : ''}
          error={error ?? iconValid}
        >
          {editing === 'changerelaydescription' ? (
            <Textarea
              id="presentation-value"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(undefined);
              }}
              placeholder={FIELDS[editing].placeholder}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'presentation-value-error' : undefined}
              autoFocus
            />
          ) : (
            <Input
              id="presentation-value"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(undefined);
              }}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              placeholder={editing ? FIELDS[editing].placeholder : undefined}
              aria-invalid={Boolean(error ?? iconValid)}
              aria-describedby={error ?? iconValid ? 'presentation-value-error' : undefined}
              className={editing === 'changerelayicon' ? 'font-mono text-xs' : undefined}
              autoFocus
            />
          )}
        </Field>
        {editing === 'changerelayicon' && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
            {iconPreview ? (
              <IconPreview url={iconPreview} large />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-md bg-muted">
                <Globe className="size-5 text-muted-foreground" aria-hidden />
              </span>
            )}
            <p className="text-xs text-muted-foreground">
              {iconPreview ? 'Preview of the new icon.' : 'Enter a valid https:// URL to preview the icon.'}
            </p>
          </div>
        )}
      </FormDialog>
    </Section>
  );
}

function IconPreview({ url, large }: { url: string; large?: boolean }) {
  const safe = sanitizeUrl(url);
  if (!safe) return null;
  return (
    <img
      src={safe}
      alt=""
      className={large ? 'size-10 rounded-md object-cover' : 'size-6 rounded-md object-cover'}
      loading="lazy"
    />
  );
}
