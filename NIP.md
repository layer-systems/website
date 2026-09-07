# NIPs and custom schemas

This project defines **no custom event kinds**. It implements and adopts the following
protocols:

## Implemented NIPs

- [NIP-86: Relay Management API](https://github.com/nostr-protocol/nips/blob/master/86.md)
  (draft, optional) — the Relay Admin app (`src/apps/relay-admin/`) is a management client.
  Requests are JSON-RPC-like POSTs over HTTP(S) on the relay's own URI with the
  `application/nostr+json+rpc` content type, authorized with a NIP-98 event (kind 27235)
  whose `u` tag is the relay URL and whose `payload` tag binds it to the request body.
  The client treats `supportedmethods` as the source of truth and only calls methods the
  relay advertised; advertised names outside the standard method list are treated as
  relay-specific extensions and kept visually and semantically separate. No generic
  event-purge/delete method is assumed — NIP-86 does not define one.
- [NIP-98: HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md) — used for
  NIP-86 authorization (with the NIP-86-required `payload` tag) and for Blossom uploads.
- [NIP-11: Relay Information Document](https://github.com/nostr-protocol/nips/blob/master/11.md)
  — read at connect time to show relay identity in Relay Admin.
- [NIP-17: Private Direct Messages](https://github.com/nostr-protocol/nips/blob/master/17.md)
  (draft, optional) — the Messages app (`src/apps/messages/`, protocol layer in
  `src/lib/dm.ts`). Chat messages are unsigned kind `14` rumors, sealed by the sender
  into kind `13` with [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md)
  and gift-wrapped (kind `1059`, [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md))
  with a throwaway key — one wrap for the recipient and one sender copy, so history is
  recoverable on any client holding the keys. Seal/wrap timestamps are randomized up to
  two days into the past. The recipient copy is published to the relays from the
  recipient's kind `10050` inbox list; a sender without that list gets the message on
  their own relays plus a warning that the recipient may not be reachable. The
  seal↔rumor pubkey check mandated by the NIP is enforced on unwrap, and rumors whose
  room (author + `p` tags) does not include the viewer are dropped.
- [NIP-04: Encrypted Direct Messages](https://github.com/nostr-protocol/nips/blob/master/04.md)
  (deprecated) — kind `4` legacy DMs are read for backwards compatibility and used for
  sending only when the signer offers no NIP-44 encryption; the UI labels that fallback
  visibly (weaker crypto, public sender/recipient metadata) and never downgrades a
  NIP-44-capable signer to it.

## Adopted third-party kinds

- **Kind `777` ("Spell")** — a third-party draft NIP from the
  [Grimoire](https://github.com/purrgrammer/grimoire) client, adopted as-is for interop.
  See `docs/apps.md` ("Spells are a third-party kind") and `src/hooks/useSpells.ts`.

Anything else (kinds 0, 1, 3, 4, 5, 6, 13, 14, 16, 9802, 10002, 10003, 10050, 22242,
30023, 30311, 31337, 39701, …) follows the official NIPs as implemented in `src/hooks/`
and `src/lib/`.
