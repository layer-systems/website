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

## Adopted third-party kinds

- **Kind `1301` (NIP-101e / deployed RUNSTR fitness dialect)** — the Workouts app
  publishes regular workout records using the interoperable `exercise`, `duration`,
  `distance`, `elevation_gain`, `workout_start_time`, heart-rate, `cadence`, `source`
  and `t` tags. It includes the required human-readable `alt` tag. No custom schema
  extensions are introduced.

- **Kind `777` ("Spell")** — a third-party draft NIP from the
  [Grimoire](https://github.com/purrgrammer/grimoire) client, adopted as-is for interop.
  See `docs/apps.md` ("Spells are a third-party kind") and `src/hooks/useSpells.ts`.

- **Kind `31337` (music track)** — an addressable audio-track convention used by
  existing music clients. Its [NIP proposal](https://github.com/nostr-protocol/nips/pull/1043)
  was closed without merging, so this is an adopted third-party format, not an
  official NIP. Music requires `d`, `title`, and a playable HTTPS audio URL in a
  NIP-92 `imeta` tag (with `url` as a compatibility fallback). It publishes
  `c` tags with `artist` and optional `album` roles, plus optional `image`,
  `duration`, and `alt`. The app accepts older events with `media` or `url`
  tags and the `subject` title fallback. A track's identity is
  `31337:<author-pubkey>:<d>`; edits replace that same address.

- **Kind `30004` (NIP-51 curation set, music extension)** — Music uses the
  existing curation-set kind for named public playlists. Each `a` item points
  to a kind `31337` track; item order is playback order. Playlist `d` values
  start with `music-` so shared `naddr` links open Music, while other curation
  sets continue to open Lists. The signed-in user's liked tracks use
  `d=music-favorites`. Music updates lists through the shared NIP-51 mutation
  hook, which reads the latest author-owned version before replacement.

Anything else (kinds 0, 1, 3, 5, 6, 16, 9802, 10002, 10003, 22242, 30023, 30311,
39701, …) follows the official NIPs as implemented in `src/hooks/` and `src/lib/`.
