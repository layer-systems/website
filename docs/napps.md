# Napps

Nostr can host whole web apps. A **nsite** ([NIP-5A](https://github.com/nostr-protocol/nips/blob/master/5A.md))
is a static site: a signed manifest maps each path to the sha256 of a file stored on
Blossom. A **napp** (kind `35130`, from the [nostrapps](https://github.com/eskema/nostrapps)
launcher) is an nsite that also expects a launcher. The launcher gives it a signer, an
event store and *actions*, such as "open this profile", that other apps can handle.
A desktop OS for Nostr can run these apps in its own windows.

This document describes what ships today and what a napp bridge would need.

## What ships: the Napps app (spike)

`src/apps/napps` with `src/lib/nsites.ts` and `src/hooks/useNsites.ts`:

- **Directory.** It lists root sites (15128), named sites (35128) and napps (35130) from
  the user's read relays plus `relay.nsite.lol`, `nos.lol` and `nostr.mom`, where
  manifests are usually published. Results can be narrowed to Everyone, Following or
  Mine, and to Sites or Napps. The search box also accepts an `naddr`, an `npub` or a
  gateway hostname, to open a site that isn't listed.
- **Runner.** It opens an nsite in a LAYER window as a sandboxed iframe on a public NIP-5A
  gateway (`nsite.lol` by default, configurable). The iframe loads the canonical address
  `<npub>.<gateway>` or `<pubkeyB36><d>.<gateway>`, so every site runs on its own origin,
  apart from LAYER and from every other site.
- **Napps are handed off.** A napp gets a card and a detail view, and a link to
  `nostrapps.com/#app=<naddr>`. That page sends `frame-ancestors 'none'`, so it opens in
  a new tab.
- **Deep links.** An `naddr` of kind 15128, 35128 or 35130 opens the Napps app.

The runner does **not** give sites a signer. A site that wants to sign asks for
the user's NIP-07 extension or a NIP-46 bunker itself, exactly as it would in a tab.

## Why there is no bridge yet

A bridge means LAYER, rather than each app, holds the signer. The app calls
`window.nostr.signEvent()`, LAYER shows a permission prompt, and the user's signer signs.
To do that, a script that defines `window.nostr` must run inside the app's document
before the app's own code. So LAYER must serve the app's files from an origin it
controls, and inject the script there. nostrapps does it this way: a service worker on
the app's origin serves files from Blossom and injects `bridge.js` into every HTML
response.

The origin is the hard part.

| Option | Why it does not work |
|---|---|
| Serve apps from `layer.systems` itself | The private key of a local login is in this origin's `localStorage`. Any app could read it. Ruled out. |
| `srcdoc` / `blob:` iframe with an opaque origin | It inherits LAYER's CSP (`script-src 'self'`). Relative URLs (`/assets/app.js`) cannot be resolved, and an opaque origin cannot register a service worker or use `localStorage`. Almost no real app would start. |
| One shared sandbox origin (for example `apps.layer.systems`) | Apps on the same origin can reach into each other's windows (`parent.frames[i]`) and call another app's `window.nostr`, which uses *that* app's grants. Per-app permissions would mean nothing. |
| A public gateway (`nsite.lol`) | Serves each app on its own origin (the spike uses this), but we cannot inject anything into the pages it serves. Gateways also only resolve kinds 15128/35128, not napps. |
| Embed `nostrapps.com` | Refuses framing, and would use its own login, not LAYER's. |

The working setup needs **one origin per app under a domain LAYER controls**. That means
a wildcard DNS record and a wildcard TLS certificate, such as `*.apps.layer.systems`. The
same static runtime files must be served on every subdomain, without an SPA fallback.
GitHub Pages, where LAYER is deployed, supports neither. A small static host that does
(Cloudflare Pages or Workers, or Caddy on a VPS) would be needed for the sandbox domain
only. LAYER itself can stay on GitHub Pages.

## Proposed design for the bridge

1. **Sandbox host** (`*.apps.<domain>`, a separate static deploy). Each napp gets one
   label, for example `<pubkeyB36><d>`, as nostrapps already does. The host serves only
   three files:
   - `boot.html` registers the service worker, then accepts the file list from LAYER
     after checking `event.origin` against LAYER's exact origin.
   - `sw.js` serves `path` → Blossom blob by sha256, verifies every hash, injects the
     bridge into HTML and sets a CSP that allows only the network the napp was granted.
   - `bridge.js` defines `window.nostr`, `window.nostrdb` and `window.napp` as
     `postMessage` RPC to the parent.

   nostrapps' runtime (MIT) already speaks this protocol:
   `{ __nostrapps: "rpc", id, method, params, instanceId }`. Reusing it would make
   existing napps run unchanged.
2. **Host side in LAYER** (a `NappFrame` next to today's `SiteFrame`):
   - Answer only messages whose `event.source` is that window's iframe **and** whose
     `event.origin` is the napp's expected subdomain.
   - `getPublicKey` needs the `identity` grant. `signEvent` needs `write`, with a prompt
     that shows the kind and content, optionally remembered per kind.
     `nip04`/`nip44` encrypt and decrypt are granted separately. Grants are stored per
     account and per napp address (`35130:<pubkey>:<d>`). The bridge never exposes a key,
     only signer calls.
   - `nostrdb.query/subscribe` run through LAYER's relay pool. Publishing goes through the
     same path as `useNostrPublish`, after the grant check.
   - Calls are rate-limited, and pending prompts are cancelled when the window closes.
3. **Actions.** These are what make LAYER more than a launcher:
   - Napp → LAYER: `napp.action("profile", pubkey)` opens LAYER's Profile app, `view:1`
     opens Notes, `view:30023` opens the Reader, and `hashtag` opens Search.
   - LAYER → napp: a napp that registers `view:<kind>` for a kind LAYER doesn't render
     becomes the handler for it. The user picks a handler when there are several, and
     the choice can be remembered.
4. **Napplets (NIP-5D)** use a different shell API (`window.napplet`, with no
   `window.nostr`). They can be added to the same host once the spec settles.

## Decisions needed before building the bridge

- **Sandbox domain and host.** Which domain, and who runs the wildcard host?
- **Compatibility target.** Implement nostrapps' bridge protocol (napps run unchanged
  today), NIP-5D napplets, or both?
- **Permission UX.** Prompt on every signature, or allow "always for this kind" grants?
