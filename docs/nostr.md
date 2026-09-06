# Nostr data layer

The template's infrastructure is unchanged: `NostrProvider` owns a single `NPool`, and
data is read through `useNostr()` + TanStack Query. This document covers what was added on
top and the rules that keep relay content safe to render.

## Reading

Every query follows the same shape: a `queryKey` that includes **everything** the result
depends on, an abort signal combined with a timeout, and validation before the data
reaches a component.

```ts
useQuery<NostrEvent[]>({
  queryKey: ['nostr', 'feed', scope, authors.length],
  queryFn: async ({ signal }) => {
    const events = await nostr.query([filter], {
      signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      relays,                       // optional hints, see below
    });
    return events.filter(isRenderable).sort((a, b) => b.created_at - a.created_at);
  },
  staleTime: 30_000,
});
```

**Validate before rendering.** Relays return blanks, oddities and events that do not match
what their kind promises. Each app defines a small predicate — `isRenderableNote` requires
non-empty content on a kind 1; `isRenderableArticle` additionally requires a `d` tag,
without which an addressable event cannot be addressed at all.

Custom hooks:

| Hook | Purpose |
|---|---|
| `useFollows(pubkey)` / `useMyFollows()` | The pubkeys in a kind 3 contact list |
| `useRelayStatus()` | Live socket state of every configured relay, sampled each second |
| `useRelayHints()` | The first two read relays, for embedding in identifiers we hand out |

## Relay hints

This is the single change that made deep links actually work.

A `nprofile`, `nevent` or `naddr` can carry relay hints, and the event it points at very
often lives on a relay the reader does not subscribe to. Discarding the hints means a
shared link resolves only for people who happen to read the same relays as the sender —
which, in testing, was most of the time a failure.

The flow is symmetric:

- **Incoming** — `NIP19Page` decodes the identifier and passes the hints on as a `relays`
  param (comma-separated). Apps read them with `decodeRelayHints(params.relays)` and hand
  them to `nostr.query(..., { relays })`.
- **Outgoing** — "Copy link" in `NoteCard` and the Reader embeds `useRelayHints()` into the
  identifier it encodes, so links leaving this client carry the same courtesy.

`encodeRelayHints` / `decodeRelayHints` in `src/lib/nostrUtils.ts` accept only `ws://` and
`wss://` URLs.

## Publishing

Through `useNostrPublish()` (kind, content, tags). Two places write events:

- **`Composer`** — kind 1. Replies carry NIP-10 tags: `['e', id, '', 'root']` plus
  `['p', authorPubkey]`.
- **Follow button** — kind 3, the complete list, read back before writing.

Failures surface as a toast with the underlying message; they are never swallowed.

## Rendering untrusted content

Everything below arrived from a stranger's relay. The rules are not optional.

**URLs.** `sanitizeUrl()` parses the URL and returns it only if the protocol is `https:`,
`http:`, `mailto:` or `nostr:`. `javascript:` and `data:` never survive it. It guards every
`href` and `src` in the app — avatars, banners, article images, links inside note text.

**Note text.** `NoteContent` tokenises the raw string into text, URLs and NIP-19
references and renders each as an element. Nothing is ever passed to
`dangerouslySetInnerHTML`.

**Markdown.** `react-markdown` builds a React tree and never touches `innerHTML`, so raw
HTML inside an article body is inert by construction — that is why it was chosen over
`marked` or `markdown-it`, which return HTML strings you must remember to sanitize.
Additionally:

- `rehype-sanitize` runs as a second line of defence. Strictly redundant while
  `rehype-raw` is absent, but it stops a future change from quietly opening a hole.
- A custom `urlTransform` routes every link and image through `sanitizeUrl`.
- **`rehype-raw` is deliberately not installed.** Adding it means overturning this
  decision on purpose.

**External links** get `target="_blank"` with `rel="noopener noreferrer nofollow"`.

## Nostr references open windows

`components.a` in the Markdown renderer and `RefToken` in `NoteContent` intercept
`nostr:` URIs and bare `npub`/`nprofile`/`note`/`nevent`/`naddr` strings, and turn them
into **window openers** rather than navigations:

```
npub / nprofile  → openApp('profile', { pubkey })
note / nevent    → openApp('notes', { id })
naddr            → openApp('articles', { pubkey, kind, identifier })
```

Clicking a mention raises a Profile window next to the note you were reading instead of
taking the page away from you. This is the point at which the app stops feeling like a
website — and it is only cleanly possible because the Markdown renderer hands us
components instead of an HTML string.
