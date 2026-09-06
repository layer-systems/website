import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCreateSpell, type SpellInput } from '@/hooks/useSpells';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

type AuthorsMode = 'anyone' | 'me' | 'contacts' | 'custom';

export function NewSpellForm({ onDone }: { onDone: () => void }) {
  const { user } = useCurrentUser();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kinds, setKinds] = useState('1');
  const [authorsMode, setAuthorsMode] = useState<AuthorsMode>('anyone');
  const [customAuthors, setCustomAuthors] = useState('');
  const [tagLetter, setTagLetter] = useState('');
  const [tagValues, setTagValues] = useState('');
  const [since, setSince] = useState('');
  const [limit, setLimit] = useState('50');
  const [topics, setTopics] = useState('');

  const create = useCreateSpell();
  const { toast } = useToast();

  const parsedKinds = kinds
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0);

  const isValid = parsedKinds.length > 0;

  const submit = async () => {
    if (!isValid) return;

    const authors: string[] | undefined =
      authorsMode === 'me'
        ? ['$me']
        : authorsMode === 'contacts'
          ? ['$contacts']
          : authorsMode === 'custom'
            ? customAuthors
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            : undefined;

    const input: SpellInput = {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      kinds: parsedKinds,
      authors,
      tagFilter:
        tagLetter.trim() && tagValues.trim()
          ? {
              letter: tagLetter.trim().slice(0, 1),
              values: tagValues
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            }
          : undefined,
      limit: limit.trim() ? Number(limit.trim()) : undefined,
      since: since.trim() || undefined,
      topics: topics
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    };

    try {
      await create.mutateAsync(input);
      toast({ title: 'Spell saved' });
      onDone();
    } catch (error) {
      toast({
        title: 'Could not save spell',
        description: error instanceof Error ? error.message : 'No relay accepted it.',
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return (
      <div className="p-5">
        <p className="text-sm text-muted-foreground">Sign in to save a spell.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">New spell</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A spell is a saved Nostr query — kinds, authors, a tag filter and a time window —
          that you can re-run, share, or come back to later.
        </p>
      </div>

      <Field label="Name (optional)">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Bitcoin from contacts" />
      </Field>

      <Field label="Description (optional)">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          className="min-h-14 resize-none text-[14px]"
        />
      </Field>

      <Field label="Kinds (comma separated)">
        <Input value={kinds} onChange={(event) => setKinds(event.target.value)} placeholder="1, 30023" />
      </Field>

      <Field label="Authors">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['anyone', 'Anyone'],
              ['me', 'Me'],
              ['contacts', 'My contacts'],
              ['custom', 'Custom'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAuthorsMode(mode)}
              aria-pressed={authorsMode === mode}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                authorsMode === mode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {authorsMode === 'custom' && (
          <Input
            value={customAuthors}
            onChange={(event) => setCustomAuthors(event.target.value)}
            placeholder="hex pubkeys, comma separated"
            className="mt-2"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tag filter letter">
          <Input value={tagLetter} onChange={(event) => setTagLetter(event.target.value)} placeholder="t" maxLength={1} />
        </Field>
        <Field label="Tag values">
          <Input value={tagValues} onChange={(event) => setTagValues(event.target.value)} placeholder="bitcoin, nostr" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Since (e.g. 7d, now, or blank)">
          <Input value={since} onChange={(event) => setSince(event.target.value)} placeholder="7d" />
        </Field>
        <Field label="Limit">
          <Input value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="numeric" />
        </Field>
      </div>

      <Field label="Topics (comma separated, for discovery)">
        <Input value={topics} onChange={(event) => setTopics(event.target.value)} placeholder="bitcoin, social" />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!isValid || create.isPending} className="gap-1.5">
          {create.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Save spell
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
