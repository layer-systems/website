import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * App default relays. Used as the initial `relayMetadata` for new users and as
 * a fallback when the user has no NIP-65 relay list configured (e.g. during
 * nostrconnect handshakes before any user relays have been loaded).
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    { url: 'wss://relay.ditto.pub/', read: true, write: true },
    { url: 'wss://relay.dreamith.to/', read: true, write: true },
    { url: 'wss://relay.primal.net/', read: false, write: true },
    { url: 'wss://nos.lol/', read: false, write: true },
  ],
  updatedAt: 0,
};

/**
 * Indexer ("purple pages") relays that collect profile, contact-list and
 * NIP-65 relay-list events from across the network. A new device only knows
 * the app defaults, so these are where it looks up the user's relay list, and
 * where the app announces it.
 */
export const INDEXER_RELAYS = [
  'wss://purplepag.es/',
  'wss://user.kindpag.es/',
  'wss://indexer.coracle.social/',
];
