import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { clientTags } from '@/lib/clientTags';
import {
  buildResponseTags,
  isPollClosed,
  parsePoll,
  POLL_KIND,
  POLL_RESPONSE_KIND,
  type Poll,
} from '@/lib/polls';

const LIST_LIMIT = 60;
/** Responses requested per relay. Reaching it means the relay may hold more. */
export const RESPONSE_LIMIT = 1000;

export type PollScope = 'all' | 'open' | 'mine';

/** Recent polls from the user's read relays, newest first. */
export function usePollList(scope: PollScope, pubkey: string | undefined) {
  const { nostr } = useNostr();
  const author = scope === 'mine' ? pubkey : undefined;

  return useQuery<Poll[]>({
    queryKey: ['nostr', 'polls', scope === 'mine' ? `mine:${author ?? ''}` : 'all'],
    enabled: scope !== 'mine' || Boolean(author),
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = { kinds: [POLL_KIND], limit: LIST_LIMIT, ...(author ? { authors: [author] } : {}) };
      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      return events
        .map(parsePoll)
        .filter((poll): poll is Poll => poll !== null)
        .sort((a, b) => b.event.created_at - a.event.created_at);
    },
    staleTime: 30_000,
  });
}

export function pollQueryKey(id: string, relays: string[] | undefined) {
  return ['nostr', 'poll', id, relays?.join(',') ?? ''];
}

/** One poll by id, asking the identifier's relay hints as well. */
export function usePoll(id: string | undefined, relays: string[] | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: pollQueryKey(id ?? '', relays),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query([{ ids: [id!], limit: 1 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        relays,
      });
      return event ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface RelayFetch {
  url: string;
  ok: boolean;
  /** Responses this relay returned. */
  count: number;
  /** The relay returned as many responses as we asked for, so it may hold more. */
  truncated: boolean;
}

export interface PollResponses {
  events: NostrEvent[];
  /** Per-relay outcome when the poll names relays; empty for the fallback. */
  relays: RelayFetch[];
  /** `poll` when the poll's own relays were asked, `fallback` when it named none. */
  source: 'poll' | 'fallback';
}

export function pollResponsesKey(pollId: string) {
  return ['nostr', 'poll-responses', pollId];
}

/**
 * Fetches kind 1018 responses from the relays the poll names, each relay on
 * its own so the result can say exactly which ones answered. A poll that
 * names no relays falls back to the user's read relays, and says so.
 */
export function usePollResponses(poll: Poll | undefined) {
  const { nostr } = useNostr();

  return useQuery<PollResponses>({
    queryKey: pollResponsesKey(poll?.event.id ?? ''),
    enabled: Boolean(poll),
    queryFn: async ({ signal }) => {
      if (!poll) return { events: [], relays: [], source: 'fallback' };
      const filter: NostrFilter = {
        kinds: [POLL_RESPONSE_KIND],
        '#e': [poll.event.id],
        limit: RESPONSE_LIMIT,
        ...(poll.endsAt !== undefined ? { until: poll.endsAt } : {}),
      };
      const timeout = () => AbortSignal.any([signal, AbortSignal.timeout(7000)]);

      if (poll.relays.length === 0) {
        const events = await nostr.query([filter], { signal: timeout() });
        return { events, relays: [], source: 'fallback' };
      }

      const pool = nostr as NPool<NRelay1>;
      const settled = await Promise.allSettled(
        poll.relays.map((url) => pool.relay(url).query([filter], { signal: timeout() })),
      );
      if (signal.aborted) throw new Error('Cancelled');

      const events = new Map<string, NostrEvent>();
      const relays: RelayFetch[] = settled.map((result, index) => {
        if (result.status === 'rejected') return { url: poll.relays[index], ok: false, count: 0, truncated: false };
        for (const event of result.value) events.set(event.id, event);
        return {
          url: poll.relays[index],
          ok: true,
          count: result.value.length,
          truncated: result.value.length >= RESPONSE_LIMIT,
        };
      });

      return { events: [...events.values()], relays, source: 'poll' };
    },
    staleTime: 20_000,
  });
}

export interface PublishOutcome {
  event: NostrEvent;
  accepted: string[];
  failed: string[];
}

/** Sends a signed event to each relay separately and reports where it landed. */
async function publishTo(pool: NPool<NRelay1>, event: NostrEvent, targets: string[]): Promise<PublishOutcome> {
  const signal = AbortSignal.timeout(6000);
  const results = await Promise.allSettled(targets.map((url) => pool.relay(url).event(event, { signal })));
  const accepted = targets.filter((_, index) => results[index].status === 'fulfilled');
  const failed = targets.filter((_, index) => results[index].status === 'rejected');
  if (accepted.length === 0) throw new Error('No relay accepted the event. Check your connection and try again.');
  return { event, accepted, failed };
}

function writeRelays(relays: { url: string; write: boolean }[]): string[] {
  return relays.filter((relay) => relay.write).map((relay) => relay.url);
}

/**
 * Publishes a kind 1018 response to the poll's relays (NIP-88), or to the
 * user's write relays if the poll names none. The new response is merged into
 * the cached results straight away, so the vote shows even while relays catch up.
 */
export function useVote(poll: Poll | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();

  return useMutation<PublishOutcome, Error, { choices: string[]; previous?: NostrEvent }>({
    mutationFn: async ({ choices, previous }) => {
      if (!user) throw new Error('Sign in to vote.');
      if (!poll) throw new Error('The poll is not loaded.');
      if (isPollClosed(poll)) throw new Error('This poll has closed.');

      const tags = buildResponseTags(poll, choices);
      if (tags.length < 2) throw new Error('Choose an option first.');

      // A second vote in the same second would tie with the first and could
      // lose the NIP-01 tie-break, so it is dated one second later.
      const now = Math.floor(Date.now() / 1000);
      const createdAt = previous && previous.created_at >= now ? previous.created_at + 1 : now;
      if (poll.endsAt !== undefined && createdAt > poll.endsAt) throw new Error('This poll has closed.');

      const event = await user.signer.signEvent({
        kind: POLL_RESPONSE_KIND,
        content: '',
        tags: clientTags(POLL_RESPONSE_KIND, tags, config.publishClientTag !== false),
        created_at: createdAt,
      });

      const targets = poll.relays.length > 0 ? poll.relays : writeRelays(config.relayMetadata.relays);
      return publishTo(nostr as NPool<NRelay1>, event, targets);
    },
    onSuccess: ({ event }) => {
      if (!poll) return;
      queryClient.setQueryData<PollResponses>(pollResponsesKey(poll.event.id), (current) =>
        current ? { ...current, events: [...current.events.filter((item) => item.id !== event.id), event] } : current,
      );
    },
  });
}

/**
 * Publishes a kind 1068 poll to the user's write relays — where people will
 * discover it — and to the relays it names for responses.
 */
export function useCreatePoll() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();

  return useMutation<PublishOutcome, Error, { content: string; tags: string[][]; relays: string[] }>({
    mutationFn: async ({ content, tags, relays }) => {
      if (!user) throw new Error('Sign in to create a poll.');
      const event = await user.signer.signEvent({
        kind: POLL_KIND,
        content,
        tags: clientTags(POLL_KIND, tags, config.publishClientTag !== false),
        created_at: Math.floor(Date.now() / 1000),
      });
      const targets = [...new Set([...writeRelays(config.relayMetadata.relays), ...relays])];
      return publishTo(nostr as NPool<NRelay1>, event, targets);
    },
    onSuccess: ({ event }) => {
      queryClient.setQueryData(pollQueryKey(event.id, undefined), event);
      void queryClient.invalidateQueries({ queryKey: ['nostr', 'polls'] });
    },
  });
}
