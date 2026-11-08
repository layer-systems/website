import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { LiveBuffer } from '@/lib/liveEvents';
import FeedApp from './index';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  live: { events: [], overflow: false } as LiveBuffer,
  dismiss: vi.fn(),
}));
vi.mock('@nostrify/react', () => ({ useNostr: () => ({ nostr: { query: mocks.query } }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: undefined }) }));
vi.mock('@/hooks/useMuteList', () => ({ useMutedPubkeys: () => [] }));
vi.mock('@/hooks/useFeedScope', () => ({ useFeedScope: () => ({
  scope: 'global', authors: null, queryKey: ['global'], label: 'Global', setScope: vi.fn(),
}) }));
vi.mock('@/os/useWindowManager', () => ({ useWindowManager: () => ({ openApp: vi.fn() }) }));
vi.mock('@/components/nostr/FeedScopeSelect', () => ({ FeedScopeSelect: () => null }));
vi.mock('@/components/nostr/NoteCard', () => ({ NoteCard: ({ event }: { event: NostrEvent }) => <article>{event.content}</article> }));
vi.mock('./Composer', () => ({ Composer: () => null }));
vi.mock('@/hooks/useLiveEvents', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/useLiveEvents')>(),
  useLiveEvents: () => ({ ...mocks.live, dismiss: mocks.dismiss }),
}));

function note(id: string, created_at: number): NostrEvent {
  return { id, pubkey: 'alice', content: id, created_at, kind: 1, tags: [], sig: '' };
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.dismiss.mockReset();
  mocks.live = { events: [], overflow: false };
});

describe('live feed', () => {
  it('offers a delayed post once, accepts it without losing it to an in-flight history refresh', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const initial = note('Already visible', 200);
    mocks.query.mockResolvedValue([initial]);
    const page = () => <QueryClientProvider client={client}>
      <FeedApp windowId="feed" params={{}} setTitle={vi.fn()} setParams={vi.fn()} />
    </QueryClientProvider>;
    const view = render(page());
    await screen.findByText('Already visible');

    // This event arrives later, but its author's timestamp is older.
    const late = note('Delayed post', 150);
    mocks.live = { events: [late, initial], overflow: false };
    view.rerender(page());
    expect(screen.queryByText('Delayed post')).not.toBeInTheDocument();
    const show = screen.getByRole('button', { name: 'Show 1 new post' });

    let completeHistory: ((events: NostrEvent[]) => void) | undefined;
    mocks.query.mockImplementationOnce(() => new Promise<NostrEvent[]>((resolve) => { completeHistory = resolve; }));
    act(() => { void client.refetchQueries({ queryKey: ['nostr', 'feed', 'global'] }); });
    fireEvent.click(show);
    await screen.findByText('Delayed post');
    expect(mocks.dismiss).toHaveBeenCalledWith(['Delayed post', 'Already visible']);
    await act(async () => { completeHistory?.([initial]); });
    await waitFor(() => expect(screen.getByText('Delayed post')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /new post/ })).not.toBeInTheDocument();
    view.unmount();
    client.clear();
  });
});
