import { BarChart3, CheckSquare, CircleDot, Clock3 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AuthorLine } from './AuthorLine';
import { Button } from '@/components/ui/button';
import { useWindowManager } from '@/os/useWindowManager';
import { absoluteTime, encodeRelayHints, relativeTime } from '@/lib/nostrUtils';
import { isPollClosed, parsePoll, type Poll } from '@/lib/polls';
import { cn } from '@/lib/utils';

const PREVIEW_OPTIONS = 4;

/** "Closes in 3 days", "Closed 2 hours ago" or "No closing time". */
export function PollStatus({ poll, now, className }: { poll: Poll; now?: number; className?: string }) {
  const closed = isPollClosed(poll, now);
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Clock3 className="size-3.5 shrink-0" aria-hidden />
      {poll.endsAt === undefined ? (
        'No closing time'
      ) : (
        <time dateTime={new Date(poll.endsAt * 1000).toISOString()} title={absoluteTime(poll.endsAt)}>
          {closed ? 'Closed' : 'Closes'} {relativeTime(poll.endsAt)}
        </time>
      )}
    </span>
  );
}

export function PollTypeLabel({ poll, className }: { poll: Poll; className?: string }) {
  const multiple = poll.pollType === 'multiplechoice';
  const Icon = multiple ? CheckSquare : CircleDot;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {multiple ? 'Multiple choice' : 'Single choice'}
    </span>
  );
}

interface PollCardProps {
  /** A kind 1068 event; anything that is not a votable poll renders nothing. */
  event: NostrEvent;
  /** Relay hints to pass on when the poll is opened. */
  relays?: string[];
  /** Overrides the default action of opening the poll in the Polls app. */
  onOpen?: (poll: Poll) => void;
  /** Unix seconds to judge open/closed against; a list passes one shared clock. */
  now?: number;
  className?: string;
}

/**
 * A NIP-88 poll as one row in a list: author, question, the first few options
 * and its status. Opening it hands over to the Polls app, which owns voting
 * and results — so any feed that meets a kind 1068 event can show it.
 */
export function PollCard({ event, relays, onOpen, now, className }: PollCardProps) {
  const { openApp } = useWindowManager();
  const poll = parsePoll(event);
  if (!poll) return null;

  const closed = isPollClosed(poll, now);
  const hints = encodeRelayHints(relays);
  const open = () => (onOpen ? onOpen(poll) : openApp('polls', { id: event.id, ...(hints ? { relays: hints } : {}) }));
  const hidden = poll.options.length - PREVIEW_OPTIONS;
  const headingId = `poll-${event.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn('group border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40', className)}
    >
      <AuthorLine pubkey={event.pubkey} createdAt={event.created_at} />
      <div className="mt-2 sm:pl-11">
        <h3 id={headingId} className="text-[15px] font-semibold leading-snug">
          <button
            type="button"
            onClick={open}
            className="whitespace-pre-wrap break-words text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {poll.question}
          </button>
        </h3>
        <ul className="mt-2 space-y-1" aria-label="Options">
          {poll.options.slice(0, PREVIEW_OPTIONS).map((option) => (
            <li
              key={option.id}
              className="truncate rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm"
            >
              {option.label}
            </li>
          ))}
        </ul>
        {hidden > 0 && <p className="mt-1 text-xs text-muted-foreground">+{hidden} more</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <PollTypeLabel poll={poll} />
          <PollStatus poll={poll} now={now} />
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1.5 px-2 text-xs"
            onClick={open}
            aria-label={`${closed ? 'See results of' : 'Vote on'} the poll: ${poll.question.slice(0, 80)}`}
          >
            <BarChart3 className="size-3.5" aria-hidden />
            {closed ? 'Results' : 'Vote'}
          </Button>
        </div>
      </div>
    </article>
  );
}
