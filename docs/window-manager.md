# Window manager

Everything in `src/os/`. It has no UI and no knowledge of Nostr — it manages rectangles,
stacking order and focus, and nothing else. The shell in `src/components/os/` renders
what it decides.

## State

```ts
interface WindowState {
  id: string;          // `${appId}-${counter}`, unique for the session
  appId: string;       // key into the registry
  title: string;       // shown in the title bar, Window menu and browser tab
  x, y: number;        // position, relative to the desktop (not the viewport)
  width, height: number;
  z: number;           // stacking order
  minimized: boolean;
  maximized: boolean;
  prevRect?: Rect;     // geometry before maximizing, restored on un-maximize
  params: AppParams;   // Record<string, string> — the app's own state
}

interface WindowManagerState {
  windows: WindowState[];
  focusedId: string | null;   // null means the desktop itself has focus
  counter: number;            // mints window ids
  maxZ: number;               // highest z currently in use
}
```

Window coordinates are **relative to the desktop surface**, which starts below the menu
bar. `getViewport()` in `layout.ts` already subtracts `MENUBAR_HEIGHT` (28px), so a
window at `y: 0` sits directly under the bar rather than behind it.

## The reducer

`windowReducer.ts` holds every transition and is pure — it is the one place to look when
window behaviour is wrong. Actions:

`OPEN_APP` · `CLOSE_WINDOW` · `FOCUS_WINDOW` · `MOVE_WINDOW` · `RESIZE_WINDOW` ·
`MINIMIZE` · `RESTORE` · `TOGGLE_MAXIMIZE` · `SET_TITLE` · `SET_PARAMS` ·
`MINIMIZE_ALL` · `CLOSE_ALL` · `VIEWPORT_CHANGED` · `HYDRATE`

Four rules are worth knowing because they are not obvious from the action names:

**Singletons.** `OPEN_APP` on an app with `singleton !== false` does not create a second
window: it focuses the existing one, un-minimizes it, and replaces its params if any were
passed. Only `notes` opts out (`singleton: false`), because comparing two threads
side by side is the point.

**Z-index normalisation.** Focusing sets `z = maxZ + 1`. Once `maxZ` would pass 9000
(`Z_NORMALIZE_THRESHOLD`), every window is renumbered from 1 in its current order. Without
this a long session drifts upwards forever.

**Title truncation.** `SET_TITLE` collapses whitespace and cuts at 48 characters
(`MAX_TITLE_LENGTH`). Apps title themselves after content they loaded from a relay, and
relay content has no length limit — an article headline would otherwise blow out the title
bar, the Window menu and the browser tab.

**Focus after hiding.** Closing or minimizing the focused window moves focus to the
topmost window that is still visible, not to nothing.

## Geometry (`layout.ts`)

| Export | Purpose |
|---|---|
| `MENUBAR_HEIGHT` | 28px. The desktop starts here. |
| `getViewport()` | Desktop size — viewport minus the menu bar |
| `maximizedRect(vp)` | Full desktop area |
| `halfRect(side, vp)` | Left or right half, for edge snapping |
| `clampPosition(x, y, size, vp)` | Keeps ≥ 80px (`KEEP_VISIBLE`) of the window reachable and never lets it go above the desktop origin |
| `clampRect(rect, minSize, vp)` | Shrinks a window that no longer fits, then re-clamps its position |
| `cascadePosition(size, openCount, vp)` | Centre, offset by 28px per open window, wrapping every 6 |
| `fitSize(defaultSize, minSize, vp)` | A new window never exceeds the viewport it opens into |

`VIEWPORT_CHANGED` runs `clampRect` over every window when the browser is resized, so
nothing ends up stranded off-screen. Maximized windows simply take the new full rect.

## Gestures

`useDrag.ts` and `useResize.ts` are pointer-event based. Both follow the same pattern,
and the reason for it matters:

> During a gesture the geometry is written **straight to the DOM node** via
> `style.transform` / `style.width` / `style.height`, and the reducer is dispatched
> **once, on `pointerup`**.

Routing every `pointermove` through React state would re-render the whole window stack on
each frame. `WindowFrame` is additionally wrapped in `React.memo`, and an effect
re-synchronises the inline styles from state once the gesture commits, so React is the
single source of truth again between gestures.

While a gesture is live, `document.body` gets the class `os-dragging`, which disables
pointer events inside window content — otherwise dragging across a window would select
text or trigger hovers.

**Resize handles.** Eight of them (`RESIZE_HANDLES`): 6px along each edge, 12px in each
corner, each with the cursor from `HANDLE_CURSOR`. Dragging a north or west edge moves the
origin as well as the size; when the minimum size is reached the moving edge pins so the
window stops sliding instead of drifting.

**Snapping.** Within 12px (`SNAP_THRESHOLD`) of an edge the drag reports a `SnapZone`
(`'left' | 'right' | 'maximize'`). `WindowLayer` draws a ghost rectangle for it, and on
release the window takes that geometry. A maximized window cannot be dragged at all —
un-maximize it first.

## Keyboard (`useOsKeyboard.ts`)

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + K` | Command palette |
| `⌘/Ctrl + ,` | Settings |
| `⌘/Ctrl + \`` | Cycle focus through visible windows in z-order |
| `⌘/Ctrl + W` | Close focused window |
| `⌘/Ctrl + M` | Minimize focused window |

`⌘W` and `⌘M` are suppressed while the target is an input, textarea, select or
`contenteditable`, so typing never destroys a window.

## Persistence (`persistence.ts`)

Stored in `localStorage` under `nostr:os-session`, versioned (`version: 1`), debounced by
300ms so dragging does not thrash storage. On load:

- The payload is validated with a Zod schema; anything malformed or from another version
  is discarded and the desktop boots empty.
- Windows whose `appId` is no longer in the registry are dropped.
- Every window is re-clamped against the *current* viewport, so a session saved on a large
  screen still opens correctly on a small one.
- Every read and write is wrapped in `try`/`catch`: private mode or a full quota costs you
  the restore, never the app.

An empty window list removes the key rather than storing `[]`.

## Routing and deep links

The router itself is untouched: `/`, `/:nip19` and the catch-all still exist. The OS state
lives in the query string.

- **`/?app=feed`** — `OsShell` reads `?app=` once on mount and opens that window. Every
  other query parameter becomes an app param.
- **Focus sync** — with `syncUrl` (the `/` route only), the URL is rewritten via
  `replaceState` whenever focus changes, so the address bar always describes the window
  you are looking at. Moving and resizing never touch the URL; there is no history spam.
- **`/npub1…`, `/note1…`, `/nevent1…`, `/naddr1…`** — `NIP19Page` decodes the identifier,
  boots the desktop and opens the matching app. It does **not** sync the URL, because the
  path is already the deep link.
- **Relay hints** carried by `nprofile`, `nevent` and `naddr` are passed through as a
  `relays` param and used in the query. See [`nostr.md`](./nostr.md) — deep links fail
  surprisingly often without them.

Booting is guarded by a ref so it happens exactly once: a later render must never reopen a
window the user has closed.

## Mobile

Under 768px (`useIsMobile`) `OsShell` renders `MobileAppShell` instead of the desktop:
the same registry and the same window state, presented as a home screen with one
full-screen app at a time plus an app switcher. There is no dragging, no resizing and no
geometry to persist.
