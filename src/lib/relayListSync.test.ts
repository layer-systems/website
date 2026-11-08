import type { NostrEvent } from '@nostrify/nostrify';
import { describe, expect, it } from 'vitest';
import type { RelayMetadata } from '@/contexts/AppContext';
import { APP_RELAYS } from '@/lib/appRelays';
import { planRelayListEdit, RELAY_LIST_PENDING, RELAY_LIST_UNKNOWN } from './relayListSync';

const published: NostrEvent = {
  id: 'published',
  kind: 10002,
  pubkey: 'owner',
  created_at: 1_000,
  tags: [['r', 'wss://mine.example/'], ['r', 'wss://inbox.example/', 'read']],
  content: '',
  sig: '',
};
const mine: RelayMetadata = {
  relays: [
    { url: 'wss://mine.example/', read: true, write: true },
    { url: 'wss://inbox.example/', read: true, write: false },
  ],
  updatedAt: 1_000,
};

describe('planRelayListEdit', () => {
  it('edits locally without publishing when signed out', () => {
    expect(planRelayListEdit(APP_RELAYS, { status: 'signed-out' }, null)).toEqual({ ok: true, base: APP_RELAYS, publish: false });
  });

  it('refuses edits until the published list has been looked up', () => {
    expect(planRelayListEdit(APP_RELAYS, { status: 'pending' }, null)).toEqual({ ok: false, error: RELAY_LIST_PENDING });
    expect(planRelayListEdit(APP_RELAYS, { status: 'error' }, null)).toEqual({ ok: false, error: RELAY_LIST_UNKNOWN });
  });

  it('edits the published list, not the defaults, when it is newer', () => {
    const plan = planRelayListEdit(APP_RELAYS, { status: 'success', event: published }, null);
    expect(plan).toEqual({ ok: true, base: mine, publish: true });
  });

  it('publishes edits to a local list that matches the published one', () => {
    expect(planRelayListEdit(mine, { status: 'success', event: published }, null)).toMatchObject({ ok: true, publish: true });
  });

  it('keeps default-derived edits local when nothing is published', () => {
    expect(planRelayListEdit(APP_RELAYS, { status: 'success', event: null }, null)).toMatchObject({
      ok: true,
      base: APP_RELAYS,
      publish: false,
    });
  });

  it('keeps diverged local changes local unless this device published them', () => {
    const local = { ...mine, updatedAt: 2_000 };
    const remote = { status: 'success', event: published } as const;
    expect(planRelayListEdit(local, remote, null)).toMatchObject({ publish: false });
    expect(planRelayListEdit(local, remote, 2_000)).toMatchObject({ publish: true });
    expect(planRelayListEdit(local, { status: 'success', event: null }, 2_000)).toMatchObject({ publish: true });
  });

  it('ignores a published list without read and write relays', () => {
    const broken = { ...published, created_at: 5_000, tags: [['r', 'wss://mine.example/', 'read']] };
    expect(planRelayListEdit(APP_RELAYS, { status: 'success', event: broken }, null)).toMatchObject({
      base: APP_RELAYS,
      publish: false,
    });
  });
});
