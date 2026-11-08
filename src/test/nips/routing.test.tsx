import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NIP19Page } from '@/pages/NIP19Page';
import type { AppParams } from '@/os/types';
import { AUTHOR, ROOT_ID } from './fixtures';

// Exercise the real route decoder; replace only the expensive desktop and 404 view.
vi.mock('@/components/os/OsShell', () => ({
  OsShell: ({ boot }: { boot: { appId: string; params: AppParams } }) => (
    <output data-testid="boot">{JSON.stringify(boot)}</output>
  ),
}));
vi.mock('@/pages/NotFound', () => ({ default: () => <p>Not found</p> }));

afterEach(cleanup);

function open(identifier: string) {
  render(<MemoryRouter initialEntries={[`/${identifier}`]}>
    <Routes><Route path="/:nip19" element={<NIP19Page />} /></Routes>
  </MemoryRouter>);
}

describe('NIP-19 — root identifier routes', () => {
  it('19-VECTOR: routes the published NIP-19 npub example using its expected hex key', () => {
    open('npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6');
    expect(JSON.parse(screen.getByTestId('boot').textContent ?? '')).toEqual({
      appId: 'profile', params: { pubkey: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d' },
    });
  });

  it.each([
    [nip19.noteEncode(ROOT_ID), 'notes', { id: ROOT_ID }],
    [nip19.nprofileEncode({ pubkey: AUTHOR, relays: ['wss://relay.example.com'] }), 'profile', { pubkey: AUTHOR, relays: 'wss://relay.example.com' }],
    [nip19.neventEncode({ id: ROOT_ID, relays: ['wss://relay.example.com'] }), 'notes', { id: ROOT_ID, relays: 'wss://relay.example.com' }],
    [nip19.naddrEncode({ kind: 30023, pubkey: AUTHOR, identifier: 'article', relays: ['wss://relay.example.com'] }), 'articles', { kind: '30023', pubkey: AUTHOR, identifier: 'article', relays: 'wss://relay.example.com' }],
    [nip19.naddrEncode({ kind: 30000, pubkey: AUTHOR, identifier: 'friends' }), 'lists', { kind: '30000', pubkey: AUTHOR, identifier: 'friends' }],
    [nip19.naddrEncode({ kind: 31922, pubkey: AUTHOR, identifier: 'meetup' }), 'calendar', { kind: '31922', pubkey: AUTHOR, identifier: 'meetup' }],
  ])('19-ROUTE: %s opens %s with decoded parameters', (identifier, appId, params) => {
    open(identifier);
    expect(JSON.parse(screen.getByTestId('boot').textContent ?? '')).toEqual({ appId, params });
  });

  it.each([
    'npub1invalid', 'unknown1identifier',
    // Synthetic test key only. A valid nsec must still never open a public route.
    nip19.nsecEncode(new Uint8Array(32).fill(1)),
  ])('19-REJECT: unsupported, malformed or private identifiers yield 404 (%s)', (identifier) => {
    open(identifier);
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.queryByTestId('boot')).not.toBeInTheDocument();
  });
});
