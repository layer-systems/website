import { describe, expect, it } from 'vitest';
import type { NostrRelayEOSE, NostrRelayEVENT } from '@nostrify/nostrify';
import { queryBeforeWrite } from './replaceableLists';

describe('queryBeforeWrite', () => {
  it('rejects an aborted read even when the transport ends silently', async () => {
    const controller = new AbortController();
    const transport = { async *req(): AsyncGenerator<NostrRelayEOSE> {
      controller.abort(new Error('timeout'));
      yield ['EOSE', 'sub'];
    } };
    await expect(queryBeforeWrite(transport, [], controller.signal)).rejects.toThrow('timeout');
  });
  it('waits for EOSE rather than stopping at the filter limit', async () => {
    const transport = { async *req(): AsyncGenerator<NostrRelayEVENT | NostrRelayEOSE> {
      yield ['EVENT', 'sub', { kind: 3, id: 'old', pubkey: 'owner', created_at: 1, tags: [], content: '', sig: '' }];
      yield ['EVENT', 'sub', { kind: 3, id: 'new', pubkey: 'owner', created_at: 2, tags: [], content: '', sig: '' }];
      yield ['EOSE', 'sub'];
    } };
    expect(await queryBeforeWrite(transport, [{ kinds: [3], limit: 1 }])).toHaveLength(2);
  });
});
