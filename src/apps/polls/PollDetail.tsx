import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Info, Loader2, RotateCw } from 'lucide-react';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { PollStatus, PollTypeLabel } from '@/components/nostr/PollCard';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNow } from '@/hooks/useNow';
import { usePollResponses, useVote, type PollResponses } from '@/hooks/usePolls';
import { useToast } from '@/hooks/useToast';
import { isPollClosed, tallyPoll, type Poll, type PollTally } from '@/lib/polls';
import { cn } from '@/lib/utils';

function relayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function PollDetail({ poll }: { poll: Poll }) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const now = useNow();
  const responses = usePollResponses(poll);
  const vote = useVote(poll);
  const closed = isPollClosed(poll, now);

  const tally = useMemo(
    () => (responses.data ? tallyPoll(poll, responses.data.events, now) : undefined),
    [poll, responses.data, now],
  );
  const myChoices = user ? tally?.choices.get(user.pubkey) : undefined;
  // The latest of my own responses, so a changed vote is dated after it.
  const myLatest = useMemo(() => {
    if (!user || !responses.data) return undefined;
    return responses.data.events
      .filter((event) => event.pubkey === user.pubkey)
      .sort((a, b) => b.created_at - a.created_at)[0];
  }, [responses.data, user]);

  const [editing, setEditing] = useState(false);
  const [peek, setPeek] = useState(false);

  const hasVoted = Boolean(myChoices);
  const canVote = Boolean(user) && !closed;
  const showForm = canVote && (!hasVoted || editing) && !peek;
  const showResults = !showForm;

  const submit = async (choices: string[]) => {
    try {
      const outcome = await vote.mutateAsync({ choices, previous: myLatest });
      setEditing(false);
      const total = outcome.accepted.length + outcome.failed.length;
      toast({
        title: hasVoted ? 'Vote changed' : 'Vote sent',
        description:
          outcome.failed.length > 0
            ? `${outcome.accepted.length} of ${total} relays accepted it.`
            : undefined,
      });
    } catch (error) {
      toast({
        title: 'Your vote was not sent',
        description: error instanceof Error ? error.message : 'Publishing failed.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-3">
        <AuthorLine pubkey={poll.event.pubkey} createdAt={poll.event.created_at} />
        <h2 className="whitespace-pre-wrap break-words text-xl font-semibold tracking-tight">{poll.question}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <PollTypeLabel poll={poll} />
          <PollStatus poll={poll} now={now} />
          {tally && (
            <span className="tabular-nums">
              {tally.voters} {tally.voters === 1 ? 'voter' : 'voters'} counted
            </span>
          )}
        </div>
      </header>

      {showForm && (
        <VoteForm
          // Restart from the counted vote whenever it changes.
          key={myChoices?.join(',') ?? ''}
          poll={poll}
          initial={myChoices ?? []}
          pending={vote.isPending}
          hasVoted={hasVoted}
          onSubmit={(choices) => void submit(choices)}
          onCancel={() => setEditing(false)}
          onPeek={() => setPeek(true)}
        />
      )}

      {showResults && (
        <section aria-label="Results" className="space-y-3">
          <ResultsView poll={poll} query={responses} tally={tally} myChoices={myChoices} />
          <div className="flex flex-wrap items-center gap-2">
            {canVote && peek && (
              <Button size="sm" onClick={() => setPeek(false)}>
                Back to voting
              </Button>
            )}
            {canVote && hasVoted && !peek && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Change vote
              </Button>
            )}
          </div>
          {!user && !closed && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3 text-sm">
              <span className="text-muted-foreground">Sign in to vote on this poll.</span>
              <LoginArea className="max-w-60" />
            </div>
          )}
          {closed && <p className="text-sm text-muted-foreground">This poll has closed. New votes are not accepted.</p>}
        </section>
      )}

      <Completeness poll={poll} query={responses} tally={tally} />
      <PublicNotice />
    </div>
  );
}

interface VoteFormProps {
  poll: Poll;
  initial: string[];
  pending: boolean;
  hasVoted: boolean;
  onSubmit: (choices: string[]) => void;
  onCancel: () => void;
  onPeek: () => void;
}

function VoteForm({ poll, initial, pending, hasVoted, onSubmit, onCancel, onPeek }: VoteFormProps) {
  const [selection, setSelection] = useState<string[]>(initial);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selection.length > 0) onSubmit(selection);
  };

  // Keep the poll's option order, whatever order boxes were ticked in.
  const toggle = (id: string, on: boolean) =>
    setSelection((current) =>
      on
        ? poll.options.map((option) => option.id).filter((item) => item === id || current.includes(item))
        : current.filter((item) => item !== id),
    );

  const rowClass = (active: boolean) =>
    cn(
      'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50',
      active && 'border-primary bg-primary/5',
    );

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Vote">
      <fieldset className="space-y-2" disabled={pending}>
        <legend className="mb-2 text-sm text-muted-foreground">
          {poll.pollType === 'multiplechoice' ? 'Choose one or more options.' : 'Choose one option.'}
        </legend>
        {poll.pollType === 'singlechoice' ? (
          <RadioGroup
            value={selection[0] ?? ''}
            onValueChange={(value) => setSelection([value])}
            className="gap-2"
            aria-label="Options"
          >
            {poll.options.map((option) => (
              <label key={option.id} className={rowClass(selection[0] === option.id)}>
                <RadioGroupItem value={option.id} />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            ))}
          </RadioGroup>
        ) : (
          <div className="grid gap-2" role="group" aria-label="Options">
            {poll.options.map((option) => {
              const checked = selection.includes(option.id);
              return (
                <label key={option.id} className={rowClass(checked)}>
                  <Checkbox checked={checked} onCheckedChange={(value) => toggle(option.id, value === true)} />
                  <span className="min-w-0 break-words">{option.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={selection.length === 0 || pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? 'Sending…' : hasVoted ? 'Change vote' : 'Vote'}
        </Button>
        {hasVoted ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onPeek}>
            Show results
          </Button>
        )}
      </div>
    </form>
  );
}

interface ResultsViewProps {
  poll: Poll;
  query: ReturnType<typeof usePollResponses>;
  tally: PollTally | undefined;
  myChoices: string[] | undefined;
}

function ResultsView({ poll, query, tally, myChoices }: ResultsViewProps) {
  if (query.isPending) {
    return (
      <div className="space-y-2" aria-label="Loading results">
        {poll.options.map((option) => (
          <Skeleton key={option.id} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (query.isError || !tally) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
        <span>Results couldn’t be loaded.</span>
        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
          <RotateCw className="size-3.5" aria-hidden /> Try again
        </Button>
      </div>
    );
  }

  const leader = Math.max(0, ...Object.values(tally.counts));

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {poll.options.map((option) => {
          const count = tally.counts[option.id] ?? 0;
          const percent = tally.voters > 0 ? Math.round((count / tally.voters) * 100) : 0;
          const mine = myChoices?.includes(option.id) ?? false;
          return (
            <li
              key={option.id}
              className={cn(
                'relative isolate overflow-hidden rounded-lg border border-border px-3 py-2.5 text-sm',
                mine && 'border-primary',
              )}
            >
              <div
                aria-hidden
                className={cn(
                  'absolute inset-y-0 left-0 -z-10 motion-safe:transition-[width] motion-safe:duration-500',
                  count > 0 && count === leader ? 'bg-primary/20' : 'bg-muted',
                )}
                style={{ width: `${percent}%` }}
              />
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-words font-medium">
                  {option.label}
                  {mine && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-normal text-primary">
                      <Check className="size-3" aria-hidden /> Your vote
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {count} · {percent}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {poll.pollType === 'multiplechoice' && tally.voters > 0 && (
        <p className="text-xs text-muted-foreground">
          Percentages are of voters; each voter can pick several options, so they can add up to more than 100%.
        </p>
      )}
      {tally.voters === 0 && <p className="text-sm text-muted-foreground">No votes have reached this client yet.</p>}
    </div>
  );
}

function Completeness({ poll, query, tally }: Omit<ResultsViewProps, 'myChoices'>) {
  const data: PollResponses | undefined = query.data;

  let summary: string;
  let warn = false;
  if (query.isPending) summary = 'Asking the poll’s relays for responses…';
  else if (query.isError || !data) {
    summary = 'No responses could be fetched.';
    warn = true;
  } else if (data.source === 'fallback') {
    summary = 'This poll names no relays for responses, so these are only the responses your own relays returned.';
    warn = true;
  } else {
    const answered = data.relays.filter((relay) => relay.ok).length;
    const truncated = data.relays.some((relay) => relay.truncated);
    if (answered === 0) {
      summary = `None of the poll’s ${data.relays.length} relays answered. The results are empty, not zero.`;
      warn = true;
    } else if (answered < data.relays.length || truncated) {
      summary = `Partial results: ${answered} of ${data.relays.length} poll relays answered${truncated ? ', and at least one may hold more responses than were fetched' : ''}.`;
      warn = true;
    } else {
      summary = `All ${data.relays.length} poll ${data.relays.length === 1 ? 'relay' : 'relays'} answered.`;
    }
  }

  return (
    <section
      aria-label="How complete these results are"
      className={cn(
        'space-y-2 rounded-lg border p-3 text-sm',
        warn ? 'border-warning/50 bg-warning/5' : 'border-border bg-muted/30',
      )}
    >
      <div className="flex items-start gap-2">
        {warn ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <p className="min-w-0 flex-1">{summary}</p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          aria-label="Reload results"
        >
          {query.isFetching ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCw className="size-3.5" aria-hidden />}
          Reload
        </Button>
      </div>
      {data && data.relays.length > 0 && (
        <ul className="space-y-1 pl-6 text-xs text-muted-foreground">
          {data.relays.map((relay) => (
            <li key={relay.url} className="flex min-w-0 items-center gap-2">
              <span
                className={cn('size-2 shrink-0 rounded-full', relay.ok ? 'bg-success' : 'bg-destructive')}
                aria-hidden
              />
              <span className="truncate font-mono">{relayHost(relay.url)}</span>
              <span className="ml-auto shrink-0 tabular-nums">
                {relay.ok ? `${relay.count}${relay.truncated ? '+' : ''} responses` : 'no answer'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tally && (tally.ignored > 0 || tally.superseded > 0) && (
        <p className="pl-6 text-xs text-muted-foreground">
          {tally.superseded > 0 && `${tally.superseded} earlier ${tally.superseded === 1 ? 'response was' : 'responses were'} replaced by the same voter’s later vote. `}
          {tally.ignored > 0 && `${tally.ignored} ${tally.ignored === 1 ? 'response was' : 'responses were'} ignored: unknown options, or sent outside the poll’s time limits.`}
        </p>
      )}
      {poll.relays.length > 0 && poll.endsAt !== undefined && (
        <p className="pl-6 text-xs text-muted-foreground">Only responses dated before the closing time count.</p>
      )}
    </section>
  );
}

function PublicNotice() {
  return (
    <aside className="flex gap-2 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p>
        <span className="font-medium text-foreground">Votes are public.</span> A vote is a signed Nostr event that names
        your choice, so anyone can see who voted for what. Only your latest vote counts. Results are what reached this
        client from the poll’s relays: relays can miss, hold back or drop votes, and anyone can vote from many accounts,
        so the result is neither anonymous nor tamper-proof.
      </p>
    </aside>
  );
}
