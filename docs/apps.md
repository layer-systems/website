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

## The eight apps

| App | `id` | Params | Notes |
|---|---|---|---|
| Feed | `feed` | — | kind 1 timeline, Following/Global, composer (⌘↵ publishes) |
| Profile | `profile` | `pubkey`, `relays?` | kind 0 metadata, the author's notes, follow/unfollow |
| Note | `notes` | `id`, `relays?` | One note and its replies. **Not** a singleton |
| Reader | `articles` | `pubkey?`, `identifier?`, `kind?`, `relays?` | NIP-23 long-form, `react-markdown` |
| Bookmarks | `bookmarks` | — | NIP-51 kind 10003 list — bookmarked notes and articles |
| Relays | `relays` | — | Connection state, subscription count, measured latency |
| Settings | `settings` | — | Theme, relay list, Blossom servers, account, session |
| About | `about` | — | What this is, the app list, the shortcuts |

### Bookmarks are one whole-list replacement, like follow lists

kind 10003 is a replaceable event: publishing it replaces the entire list. `useToggleBookmark`
(`src/hooks/useBookmarks.ts`) therefore reads the current list back before publishing an
update, the same trap [follow lists](#follow-lists-are-a-whole-list-replacement) have.

### Follow lists are a whole-list replacement

kind 3 replaces the entire contact list. The follow button therefore reads the current
list back before writing, or the edit would silently drop everyone else.

### Relay latency is a real round trip

A WebSocket gives the browser no ping, so the Relays app times an actual `REQ`/`EOSE`
cycle (`{ kinds: [1], limit: 1 }`, 5s timeout). It is the only honest number available.

`useRelayStatus` samples socket state once a second — sockets have no change event to
subscribe to — and feeds both the Relays app and the menu bar indicator, so the two can
never disagree.

A **closed** socket is the resting state, not a fault: relays are opened on demand and
dropped after idling. That is why nothing turns red at "0 connected"; only a connection
that keeps trying to establish itself gets an amber dot.
