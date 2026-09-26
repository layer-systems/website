import { useId, useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RelayListResult } from '@/hooks/useRelayList';
import { normalizeRelayUrl, relayLabel } from '@/lib/relayList';
import { probeRelay } from './latency';

type Feedback =
  | { kind: 'error'; message: string }
  | { kind: 'unreachable'; url: string }
  | { kind: 'added'; message: string };

/**
 * Address field for new relays. Validation happens before anything leaves the
 * browser; the optional connection test catches typos that are valid URLs but
 * point at nothing, while still letting the user add a relay that is merely
 * down right now.
 */
export function AddRelayForm({
  onAdd,
  existing,
}: {
  onAdd: (url: string) => RelayListResult;
  existing: string[];
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [test, setTest] = useState(true);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  const commit = (url: string) => {
    const result = onAdd(url);
    if (!result.ok) {
      setFeedback({ kind: 'error', message: result.error });
      return;
    }
    setDraft('');
    setFeedback({ kind: 'added', message: `Added ${relayLabel(url)}.` });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = normalizeRelayUrl(draft);
    if (!parsed.ok) {
      setFeedback({ kind: 'error', message: parsed.error });
      return;
    }
    if (existing.includes(parsed.url)) {
      setFeedback({ kind: 'error', message: 'That relay is already in your list.' });
      return;
    }
    if (!test) {
      commit(parsed.url);
      return;
    }

    setTesting(true);
    setFeedback(undefined);
    try {
      const latency = await probeRelay(parsed.url);
      if (latency === null) setFeedback({ kind: 'unreachable', url: parsed.url });
      else commit(parsed.url);
    } finally {
      setTesting(false);
    }
  };

  const invalid = feedback?.kind === 'error';

  return (
    <form onSubmit={submit} className="space-y-2 border-b border-border px-3 py-3" noValidate>
      <Label htmlFor={`${id}-url`} className="text-xs font-medium">
        Add a relay
      </Label>
      <div className="flex gap-2">
        <Input
          id={`${id}-url`}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (feedback) setFeedback(undefined);
          }}
          placeholder="wss://relay.example.com"
          className="h-8 min-w-0 font-mono text-xs"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="url"
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-feedback`}
          disabled={testing}
        />
        <Button type="submit" size="sm" className="h-8 shrink-0 gap-1.5" disabled={testing || !draft.trim()}>
          {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {testing ? 'Testing…' : 'Add'}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-test`}
          checked={test}
          onCheckedChange={(checked) => setTest(checked === true)}
          disabled={testing}
        />
        <Label htmlFor={`${id}-test`} className="text-xs font-normal text-muted-foreground">
          Test the connection before adding
        </Label>
      </div>

      <div id={`${id}-feedback`} aria-live="polite" className="text-xs empty:hidden">
        {feedback?.kind === 'error' && <p className="text-destructive">{feedback.message}</p>}
        {feedback?.kind === 'added' && <p className="text-muted-foreground">{feedback.message}</p>}
        {feedback?.kind === 'unreachable' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-destructive">
              {relayLabel(feedback.url)} did not answer within 5 seconds.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => commit(feedback.url)}
            >
              Add anyway
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
