import type { NostrEvent } from '@nostrify/nostrify';

// Public, synthetic wire-shaped fixtures. No signature validity is implied.
export const AUTHOR = 'ab'.repeat(32);
export const OTHER_AUTHOR = 'cd'.repeat(32);
export const ROOT_ID = '12'.repeat(32);
export const PARENT_ID = '34'.repeat(32);

export function event(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: '56'.repeat(32), pubkey: AUTHOR, kind: 1,
    created_at: 1_700_000_000, tags: [], content: '', sig: '00'.repeat(64),
    ...overrides,
  };
}
