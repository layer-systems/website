import { useId, useState, type FormEvent } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCreatePoll } from '@/hooks/usePolls';
import { useToast } from '@/hooks/useToast';
import {
  buildPollEvent,
  MAX_OPTION_LABEL,
  MAX_OPTIONS,
  MAX_POLL_RELAYS,
  MAX_QUESTION,
  type PollType,
} from '@/lib/polls';

interface CreatePollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (event: NostrEvent) => void;
}

/** `YYYY-MM-DDTHH:mm` in local time, the format `datetime-local` expects. */
function toLocalInput(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreatePollDialog({ open, onOpenChange, onCreated }: CreatePollDialogProps) {
  const { user } = useCurrentUser();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New poll</DialogTitle>
          <DialogDescription>
            A public NIP-88 poll. Anyone can see the question, the options and who voted for what.
          </DialogDescription>
        </DialogHeader>
        {user ? (
          // Remounting on open starts every poll from a clean form.
          open && <PollForm onCancel={() => onOpenChange(false)} onCreated={onCreated} />
        ) : (
          <LoginRequired action="create a poll" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PollForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (event: NostrEvent) => void }) {
  const { config } = useAppContext();
  const { toast } = useToast();
  const create = useCreatePoll();
  const ids = useId();

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [pollType, setPollType] = useState<PollType>('singlechoice');
  const [closes, setCloses] = useState(true);
  const [endsAt, setEndsAt] = useState(() => toLocalInput(Math.floor(Date.now() / 1000) + 7 * 24 * 3600));
  // Responses go where the author's own relays are, unless they choose others.
  const [relays, setRelays] = useState(() =>
    config.relayMetadata.relays
      .filter((relay) => relay.write)
      .slice(0, 3)
      .map((relay) => relay.url)
      .join('\n'),
  );
  const [error, setError] = useState<string | null>(null);
  const [minEnd] = useState(() => toLocalInput(Math.floor(Date.now() / 1000) + 120));

  const setOption = (index: number, value: string) =>
    setOptions((current) => current.map((option, at) => (at === index ? value : option)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    let end: number | undefined;
    if (closes) {
      const parsed = new Date(endsAt).getTime();
      if (!endsAt || !Number.isFinite(parsed)) {
        setError('Pick a closing time, or choose “No closing time”.');
        return;
      }
      end = Math.floor(parsed / 1000);
    }

    const relayList = relays.split(/[\s,]+/).filter(Boolean);
    const draft = buildPollEvent({ question, options, pollType, endsAt: end, relays: relayList });
    if (!draft.ok) {
      setError(draft.error);
      return;
    }

    try {
      const outcome = await create.mutateAsync({
        content: draft.content,
        tags: draft.tags,
        relays: draft.tags.filter(([name]) => name === 'relay').map(([, url]) => url),
      });
      toast({
        title: 'Poll published',
        description:
          outcome.failed.length > 0
            ? `${outcome.accepted.length} of ${outcome.accepted.length + outcome.failed.length} relays accepted it.`
            : undefined,
      });
      onCreated(outcome.event);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Publishing failed. Your poll is still here to retry.');
    }
  };

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-question`}>Question</Label>
        <Textarea
          id={`${ids}-question`}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={MAX_QUESTION}
          placeholder="What should we build next?"
          rows={2}
          autoFocus
          required
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">Options</legend>
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={option}
              onChange={(event) => setOption(index, event.target.value)}
              maxLength={MAX_OPTION_LABEL}
              placeholder={`Option ${index + 1}`}
              aria-label={`Option ${index + 1}`}
              onKeyDown={(event) => {
                // Enter in the last filled option adds the next one.
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (index === options.length - 1 && option.trim() && options.length < MAX_OPTIONS) {
                    setOptions((current) => [...current, '']);
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => setOptions((current) => current.filter((_, at) => at !== index))}
              disabled={options.length <= 2}
              aria-label={`Remove option ${index + 1}`}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setOptions((current) => [...current, ''])}
          disabled={options.length >= MAX_OPTIONS}
        >
          <Plus className="size-3.5" aria-hidden /> Add option
        </Button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">Voters can pick</legend>
        <RadioGroup value={pollType} onValueChange={(value) => setPollType(value as PollType)} className="gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <RadioGroupItem value="singlechoice" /> One option
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <RadioGroupItem value="multiplechoice" /> Several options
          </label>
        </RadioGroup>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">Closing time</legend>
        <RadioGroup
          value={closes ? 'closes' : 'open'}
          onValueChange={(value) => setCloses(value === 'closes')}
          className="gap-2 sm:grid-cols-2"
        >
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <RadioGroupItem value="closes" /> Closes at a set time
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <RadioGroupItem value="open" /> No closing time
          </label>
        </RadioGroup>
        {closes && (
          <Input
            type="datetime-local"
            value={endsAt}
            min={minEnd}
            onChange={(event) => setEndsAt(event.target.value)}
            aria-label="Closing time"
          />
        )}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-relays`}>Relays for responses</Label>
        <Textarea
          id={`${ids}-relays`}
          value={relays}
          onChange={(event) => setRelays(event.target.value)}
          rows={3}
          className="font-mono text-xs"
          placeholder="wss://relay.example.com"
          spellCheck={false}
          aria-describedby={`${ids}-relays-hint`}
        />
        <p id={`${ids}-relays-hint`} className="text-xs text-muted-foreground">
          One per line, up to {MAX_POLL_RELAYS}. Voters send their responses here and results are read from here. Relays
          that reject backdated events and keep votes give the most reliable result.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {create.isPending ? 'Publishing…' : 'Publish poll'}
        </Button>
      </DialogFooter>
    </form>
  );
}
