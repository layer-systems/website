# Apps

An app is a component that renders inside a window. It receives its window's parameters,
can rename its window and can rewrite its own parameters — and knows nothing else about
the OS.

## The registry

`src/os/registry.ts` is the single source of truth. Adding an entry there is all it takes
for an app to appear on the desktop, in the **Go** menu, in the command palette and in the
About app. There is no router change, no menu update, no icon grid to edit.

```ts
interface AppDefinition {
  id: string;              // 'feed' — also the ?app= value and the window id prefix
  title: string;           // default window title
  description: string;     // one line, shown in the palette and About
  icon: LucideIcon;
  category: 'social' | 'tools' | 'system';
  component: LazyExoticComponent<ComponentType<AppProps>>;
  defaultSize: Size;       // capped to the viewport by fitSize()
  minSize: Size;           // enforced while resizing
  resizable?: boolean;     // default true
  singleton?: boolean;     // default true — a second open focuses the existing window
  showOnDesktop?: boolean; // default true
  requiresAuth?: boolean;
}
```

Every `component` is a `React.lazy(() => import('@/apps/<id>'))`, so each app is its own
code-split chunk and the initial bundle contains only the shell. `WindowFrame` supplies
the `<Suspense>` skeleton and an `ErrorBoundary` around it — a crashing app takes down its
own window, not the desktop.

## The contract

```ts
interface AppProps {
  windowId: string;
  params: AppParams;                  // Record<string, string>
  setTitle: (title: string) => void;  // truncated to 48 chars by the reducer
  setParams: (params: AppParams) => void;
}
```

**`params` is the app's navigation state, not local state.** Putting the current
selection in `params` rather than `useState` buys three things at once: the URL describes
what is on screen, a reload restores it, and the state survives the remount when the
window switches between the desktop and mobile shells. The Reader does this with the
selected article; the Feed keeps its scope in local state because a tab choice is not
worth a URL.

`setTitle` is normally called from an effect once the content is known:

```tsx
useEffect(() => {
  setTitle(name ? `Profile — ${name}` : 'Profile');
}, [name, setTitle]);
```

## Adding an app

1. Create `src/apps/<id>/index.tsx` with a **default export** taking `AppProps`.
2. Build the UI from the `AppChrome` primitives (see [`styleguide.md`](./styleguide.md)) so
   it fills its window instead of centring a column like a web page.
3. Add an entry to `APPS` in `src/os/registry.ts`.
4. If the app should be reachable by a NIP-19 identifier, map that identifier to it in
   `src/pages/NIP19Page.tsx`.
5. Run `npm run test`.

A minimal app:

```tsx
import { useEffect } from 'react';
import { AppBody, AppLayout, AppToolbar } from '@/components/os/AppChrome';
import type { AppProps } from '@/os/types';

export default function ExampleApp({ setTitle }: AppProps) {
  useEffect(() => setTitle('Example'), [setTitle]);

  return (
    <AppLayout>
      <AppToolbar>
        <span className="text-[13px] font-medium">Example</span>
      </AppToolbar>
      <AppBody className="p-4">…</AppBody>
    </AppLayout>
  );
}
```

## The eleven apps

| App | `id` | Params | Notes |
|---|---|---|---|
| Feed | `feed` | — | kind 1 timeline, Following/Global, composer (⌘↵ publishes) |
| Profile | `profile` | `pubkey`, `relays?` | kind 0 metadata, the author's notes, follow/unfollow |
| Note | `notes` | `id?`, `relays?` | One note and its replies, or a blank local draft when `id` is absent. **Not** a singleton |
| Reader | `articles` | `pubkey?`, `identifier?`, `kind?`, `relays?` | NIP-23 long-form, `react-markdown`, NIP-84 highlights |
| Bookmarks | `bookmarks` | — | NIP-51 kind 10003 list — bookmarked notes and articles |
| Web Bookmarks | `web-bookmarks` | — | NIP-B0 kind 39701 — one addressable event per saved URL |
| Live | `live` | `pubkey?`, `identifier?` | NIP-53 kind 30311 live events + kind 1311 chat |
| Spells | `spells` | `id?` | Saved/shareable REQ filters — kind 777, a third-party draft NIP |
| Relays | `relays` | — | Connection state, subscription count, measured latency |
| Relay Admin | `relay-admin` | `relay?` | NIP-86 management console for relays you operate |
| Settings | `settings` | — | Theme, relay list, Blossom servers, account, session |
| About | `about` | — | What this is, the app list, the shortcuts |

### Spells are a third-party kind, adopted for interop

Kind `777` ("Spell") isn't in the official nostr-protocol/nips registry — it comes from
[Grimoire](https://github.com/purrgrammer/grimoire), a third-party Nostr client that also
happens to be a tiling-window-manager OS like this one. `src/hooks/useSpells.ts` implements
its draft NIP as-is (same tag names, same `$me`/`$contacts` runtime variables, same relative
timestamp grammar) rather than inventing an incompatible shape, so a spell saved here is
readable by Grimoire and vice versa. Only the "Spell" half (kind `777`, a saved query) is
implemented; "Spellbook" (kind `30777`, a saved window layout) is not — see the app's
tracking issue for that as a possible follow-up.

### Live only links out to playback, it doesn't embed a player

NIP-53's `streaming` tag is typically an HLS (`.m3u8`) URL, which no browser plays natively
without a library like hls.js. Rather than pull that dependency in for a first cut, the Live
app (`src/apps/live`) shows the stream's metadata and chat and opens `streaming` (or
`recording`, once `status` is `ended`) in a new tab. Spaces/interactive rooms (kind
30312/30313) are a separate, larger effort — see the tracking issue.

### Web bookmarks are one event per URL, not a list

Unlike a NIP-51 list, each NIP-B0 web bookmark (kind 39701) is its own addressable event —
the `d` tag is the URL itself (scheme stripped for `https`, see `bookmarkDTag` in
`src/hooks/useWebBookmarks.ts`). Removing one publishes a NIP-09 kind 5 deletion request,
which relays are free to ignore, so the client also drops it from its own query cache
rather than trusting a refetch to reflect it.

### Highlighting selects against the DOM, not the markdown source

`HighlightLayer` (`src/apps/articles/HighlightLayer.tsx`) tracks `window.getSelection()`
against the rendered article, not the raw markdown — the highlighted text saved to a kind
9802 event is whatever that `Selection`'s `.toString()` returns, i.e. the plain-text content
the reader actually saw, not markdown syntax.

### Bookmarks are one whole-list replacement, like follow lists

kind 10003 is a replaceable event: publishing it replaces the entire list. `useToggleBookmark`
(`src/hooks/useBookmarks.ts`) therefore reads the current list back before publishing an
update, the same trap [follow lists](#follow-lists-are-a-whole-list-replacement) have.

### Follow lists are a whole-list replacement

kind 3 replaces the entire contact list. The follow button therefore reads the current
list back before writing, or the edit would silently drop everyone else.

### Relay Admin is capability-driven, not method-driven

The Relay Admin app (`src/apps/relay-admin/`) implements [NIP-86](../NIP.md) — the draft,
optional relay-management API. Because implementations vary and the NIP is still a draft,
the console never assumes a method exists: it connects, authorizes with a NIP-98 event
(kind 27235, `u` + `payload` tags), calls `supportedmethods`, and renders only the
sections the relay advertised. Advertised names outside the standard list (e.g. a
relay-specific `purgeallevents` or `listroles`) land in a separate, clearly-labelled
extensions area that requires typed confirmation — they are never blended into the
standard surface, and the standard defines no generic event-purge/delete method.

Destructive-but-reversible operations (bans, unbans, removing allowlist access, role
deletion) go through a confirmation dialog that states the target, the likely effect and
whether the relay offers a reverse operation. Every operation is written to a per-session
audit log (method, target, result, operator-safe error) that never contains the
authorization header or any key material; signing secrets stay inside the user's signer.

### Relay latency is a real round trip

A WebSocket gives the browser no ping, so the Relays app times an actual `REQ`/`EOSE`
cycle (`{ kinds: [1], limit: 1 }`, 5s timeout). It is the only honest number available.

`useRelayStatus` samples socket state once a second — sockets have no change event to
subscribe to — and feeds both the Relays app and the menu bar indicator, so the two can
never disagree.

A **closed** socket is the resting state, not a fault: relays are opened on demand and
dropped after idling. That is why nothing turns red at "0 connected"; only a connection
that keeps trying to establish itself gets an amber dot.
