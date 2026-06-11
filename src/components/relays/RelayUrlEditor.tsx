import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeRelayUrl } from '@/lib/relayLists';

interface RelayUrlEditorProps {
  relays: string[];
  onChange: (relays: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function RelayUrlEditor({
  relays,
  onChange,
  disabled,
  placeholder = 'wss://relay.example.com',
}: RelayUrlEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const addRelay = () => {
    try {
      const normalized = normalizeRelayUrl(draft);
      if (relays.includes(normalized)) {
        setError('That relay is already in this list.');
        return;
      }
      onChange([...relays, normalized]);
      setDraft('');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid relay URL.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addRelay();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className="font-mono text-sm"
        />
        <Button type="button" size="icon" onClick={addRelay} disabled={disabled || !draft.trim()} title="Add relay">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add relay</span>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {relays.length ? (
        <div className="divide-y rounded-md border">
          {relays.map((relay) => (
            <div key={relay} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-sm" title={relay}>{relay}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(relays.filter((candidate) => candidate !== relay))}
                disabled={disabled}
                title="Remove relay"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove {relay}</span>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No relays in this list yet.
        </div>
      )}
    </div>
  );
}
