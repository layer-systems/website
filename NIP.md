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

- [NIP-F4: Podcasts](https://github.com/nostr-protocol/nips/blob/master/F4.md) (draft,
  optional) — the Podcasts app (`src/apps/podcasts/`, parsing in `src/lib/podcasts.ts`)
  reads and publishes show metadata (kind 10154) and episodes (kind 54). The show's
  public key **is** the show identity: metadata and episode queries always constrain
  `authors` to that key, and publishing always signs as the active account. Episodes
  require a `title` and at least one `audio` tag with an `https://` URL (other schemes
  are dropped); the optional third `audio` element is the media type. A
  `content-warning` tag (NIP-36) is honoured and may be set when publishing. Episodes
  and metadata carry a NIP-31 `alt` tag. No tags are added beyond the NIP.
- [NIP-51: Lists](https://github.com/nostr-protocol/nips/blob/master/51.md) — favorite
  podcasts (kind 10054, `p` items) are edited as a whole-list replacement through the
  shared list mutation: the newest list is read from every read relay first, writes are
  refused after an incomplete read, and `url` entries, other tags and private items are
  preserved. Authored podcasts (kind 10064) confirm `p`-tag host claims.

### NIP-F4 authored-podcasts kind: 10064, not 10164

NIP-F4's prose (at the time of writing) says the authored-podcasts counter-claim "is
the `kind:10164` event", but the NIP's own example event, NIP-51's standard-list table
and the NIP index all define **kind 10064** ("Authored podcasts"). This client reads and
writes **10064** only. A `p` tag in kind 10154 is displayed as a confirmed host/editor
only when that person's newest, self-signed kind 10064 lists the show's key; otherwise
it is shown as an unconfirmed claim.

## Adopted third-party kinds

- **Kind `1301` (NIP-101e / deployed RUNSTR fitness dialect)** — the Workouts app
  publishes regular workout records using the interoperable `exercise`, `duration`,
  `distance`, `elevation_gain`, `workout_start_time`, heart-rate, `cadence`, `source`
  and `t` tags. It includes the required human-readable `alt` tag. No custom schema
  extensions are introduced.

- **Kind `777` ("Spell")** — a third-party draft NIP from the
  [Grimoire](https://github.com/purrgrammer/grimoire) client, adopted as-is for interop.
  See `docs/apps.md` ("Spells are a third-party kind") and `src/hooks/useSpells.ts`.

Anything else (kinds 0, 1, 3, 5, 6, 16, 9802, 10002, 10003, 22242, 30023, 30311, 31337,
39701, …) follows the official NIPs as implemented in `src/hooks/` and `src/lib/`.
