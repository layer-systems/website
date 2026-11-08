import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { NostrEvent, NPool } from '@nostrify/nostrify';
import { LIVE_LIMIT, LIVE_RENEW_MS, subscribeLiveEvents, type LiveBuffer } from './liveEvents';

type Message = ReturnType<NPool['req']> extends AsyncIterable<infer T> ? T : never;

function fakePool() {
  const streams: { signal: AbortSignal | undefined; send: (message: Message) => void }[] = [];
  const req = vi.fn<NPool['req']>((_filters, options) => {
    const queue: Message[] = [];
    let wake: (() => void) | undefined;
    const signal = options?.signal;
    const onAbort = () => wake?.();
    signal?.addEventListener('abort', onAbort);
    streams.push({ signal, send: (message) => { queue.push(message); wake?.(); } });
    return (async function* () {
      try {
        while (!signal?.aborted) {
          const message = queue.shift();
          if (message) yield message;
          else await new Promise<void>((resolve) => { wake = resolve; });
        }
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    })();
  });
  return { req, streams };
}

function event(id: string, extra: Partial<NostrEvent> = {}): NostrEvent {
  return { id, pubkey: 'alice', kind: 1, content: id, tags: [], created_at: Math.floor(Date.now() / 1000), sig: '', ...extra };
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
let cleanups: (() => void)[];
beforeEach(() => { vi.useFakeTimers(); cleanups = []; });
afterEach(() => { cleanups.forEach((release) => release()); vi.useRealTimers(); });

function setup(policy = { rootNotesOnly: true, excludeAuthors: ['muted'] }) {
  const pool = fakePool();
  const client = new QueryClient();
  const attach = (identity = 'feed', filters = [{ kinds: [1] }]) => {
    const release = subscribeLiveEvents(pool, client, identity, filters, policy);
    cleanups.push(release);
    return release;
  };
  const buffer = (identity = 'feed') => client.getQueryData<LiveBuffer>(['nostr', 'live', identity]);
  return { pool, client, attach, buffer };
}

describe('live subscriptions', () => {
  it('shares a stream and closes it only after the last consumer leaves', () => {
    const { pool, attach } = setup();
    const first = attach();
    const second = attach();
    expect(pool.req).toHaveBeenCalledTimes(1);
    first(); cleanups.shift();
    expect(pool.streams[0].signal?.aborted).toBe(false);
    second(); cleanups.shift();
    expect(pool.streams[0].signal?.aborted).toBe(true);
    vi.advanceTimersByTime(LIVE_RENEW_MS * 2);
    expect(pool.req).toHaveBeenCalledTimes(1);
  });

  it('keeps receiving after EOSE and deduplicates repeated events', async () => {
    const { pool, client, attach, buffer } = setup();
    // A rapid remount can retain the cache while creating a fresh stream.
    client.setQueryData(['nostr', 'live', 'feed'], { events: [event('cached')], overflow: false });
    attach();
    pool.streams[0].send(['EOSE', 'sub']);
    pool.streams[0].send(['EVENT', 'sub', event('cached')]);
    pool.streams[0].send(['EVENT', 'sub', event('one')]);
    pool.streams[0].send(['EVENT', 'sub', event('one')]);
    await flush();
    expect(buffer()?.events.map((entry) => entry.id)).toEqual(['one', 'cached']);
    expect(pool.streams[0].signal?.aborted).toBe(false);
  });

  it('renews a silently stuck iterator and retries a CLOSED message', async () => {
    const { pool, attach } = setup();
    attach();
    await vi.advanceTimersByTimeAsync(LIVE_RENEW_MS);
    expect(pool.streams[0].signal?.aborted).toBe(true);
    expect(pool.req).toHaveBeenCalledTimes(2);
    pool.streams[1].send(['CLOSED', 'sub', 'error']);
    await flush();
    expect(pool.streams[1].signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(pool.req).toHaveBeenCalledTimes(3);
  });

  it('retries transport errors and retains catch-up coverage during silent outages', async () => {
    const { pool, attach } = setup();
    pool.req.mockImplementationOnce(() => { throw new Error('offline'); });
    attach();
    const originalSince = pool.req.mock.calls[0][0][0].since;
    await vi.advanceTimersByTimeAsync(3000);
    expect(pool.req).toHaveBeenCalledTimes(2);
    // No EOSE while offline: local time alone must not advance the cursor.
    await vi.advanceTimersByTimeAsync(LIVE_RENEW_MS * 4);
    expect(pool.req.mock.calls.at(-1)?.[0][0].since).toBe(originalSince);
  });

  it('ignores late messages after release and separates relay configurations', async () => {
    const { pool, attach, buffer } = setup();
    const release = attach('old-relays');
    release(); cleanups.shift();
    cleanups.push(subscribeLiveEvents(pool, new QueryClient(), 'new-relay-routing', [{ kinds: [1] }], {}, ['wss://new.example']));
    expect(pool.req.mock.calls[1][1]?.relays).toEqual(['wss://new.example']);
    // A different relay snapshot has its own cache and cannot receive old events.
    attach('new-relays');
    pool.streams[0].send(['EVENT', 'sub', event('stale')]);
    pool.streams[2].send(['EVENT', 'sub', event('current')]);
    await flush();
    expect(buffer('old-relays')).toBeUndefined();
    expect(buffer('new-relays')?.events[0].id).toBe('current');
  });

  it('reconnects on return to the tab and online, and removes listeners on release', () => {
    const { pool, attach } = setup();
    const release = attach();
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pool.req).toHaveBeenCalledTimes(3);
    release(); cleanups.shift();
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pool.req).toHaveBeenCalledTimes(3);
  });

  it('accepts late events and filters irrelevant traffic before it can evict posts', async () => {
    const { pool, attach, buffer } = setup();
    attach();
    pool.streams[0].send(['EVENT', 'sub', event('newer')]);
    pool.streams[0].send(['EVENT', 'sub', event('late', { created_at: Math.floor(Date.now() / 1000) - 60 })]);
    await flush();
    for (let i = 0; i < LIVE_LIMIT + 1; i++) {
      pool.streams[0].send(['EVENT', 'sub', event(`muted-${i}`, { pubkey: 'muted' })]);
      pool.streams[0].send(['EVENT', 'sub', event(`reply-${i}`, { tags: [['e', 'parent', '', 'reply']] })]);
      pool.streams[0].send(['EVENT', 'sub', event(`blank-${i}`, { content: '  ' })]);
      await flush();
    }
    expect(buffer()?.events.map((entry) => entry.id)).toEqual(['late', 'newer']);
    expect(buffer()?.overflow).toBe(false);
  });

  it('bounds by arrival order, signals overflow and does not replay acknowledged events', async () => {
    const { pool, client, attach, buffer } = setup();
    attach();
    for (let i = 0; i <= LIVE_LIMIT; i++) {
      pool.streams[0].send(['EVENT', 'sub', event(`note-${i}`, { created_at: Math.floor(Date.now() / 1000) - i })]);
      await flush();
    }
    expect(buffer()?.events).toHaveLength(LIVE_LIMIT);
    expect(buffer()?.events[0].id).toBe('note-100');
    expect(buffer()?.overflow).toBe(true);
    client.setQueryData(['nostr', 'live', 'feed'], { events: [], overflow: false });
    await vi.advanceTimersByTimeAsync(LIVE_RENEW_MS);
    pool.streams[1].send(['EVENT', 'sub', event('note-100')]);
    await flush();
    expect(buffer()?.events).toEqual([]);
  });

  it('isolates changed recipients and rejects events outside the relay filters', async () => {
    const { pool, client } = setup();
    cleanups.push(subscribeLiveEvents(pool, client, 'alice', [{ kinds: [1], '#p': ['alice'] }], {}));
    cleanups.push(subscribeLiveEvents(pool, client, 'bob', [{ kinds: [1], '#p': ['bob'] }], {}));
    pool.streams[0].send(['EVENT', 'sub', event('wrong', { tags: [['p', 'bob']] })]);
    pool.streams[1].send(['EVENT', 'sub', event('right', { tags: [['p', 'bob']] })]);
    await flush();
    expect(client.getQueryData(['nostr', 'live', 'alice'])).toBeUndefined();
    expect(client.getQueryData<LiveBuffer>(['nostr', 'live', 'bob'])?.events[0].id).toBe('right');
  });
});
