# Desktop-OS shell

The site's tools (Explore, Dashboard, My Events, Export Following, Messages) are
presented as "apps" you open into windows on a desktop, with a menu bar and a
dock — see [issue #10](https://github.com/layer-systems/website/issues/10) for
the original design brief. This document explains how it's implemented, for
anyone extending it later.

## Where things live

```
src/os/
  Desktop.tsx              Entry point mounted at /os/* — wires everything together
  window-manager/
    context.ts              WindowManagerApi type + the React context object
    WindowManagerContext.tsx  Reducer + provider (state, persistence)
    useWindowManager.ts      Hook to read/dispatch window state
    Window.tsx               Window chrome: drag, resize, focus, traffic-light buttons
    types.ts                 WindowBounds / WindowState / WindowManagerSnapshot
  apps/
    registry.tsx             The list of apps (id, title, icon, component, default size)
  shell/
    Wallpaper.tsx            Layered-strata background
    MenuBar.tsx               Wordmark, window switcher, relay status, clock, login
    Dock.tsx                  App launcher (bottom dock on desktop, tab bar on mobile)
    LockScreen.tsx             Nostr-key "unlock" screen shown while logged out
    MobileHome.tsx             Small-screen home screen (app icon grid)
    MobileAppView.tsx          Small-screen full-screen app view
```

The apps themselves are **not** duplicated — `apps/registry.tsx` wraps the
existing page components (`src/pages/Dashboard.tsx`, `Explore.tsx`, etc.) with
an `embedded` prop that strips their standalone-page chrome (sidebar, sticky
header) so the same component works both inside a window and, if linked to
directly, as a full page.

## Window manager

`WindowManagerContext` holds one `WindowState` per open app (position, size,
minimized/maximized, previous bounds for restore) plus a `zOrder` array of app
ids — the last entry is always the focused/topmost window. All mutations go
through a reducer (`OPEN`, `CLOSE`, `FOCUS`, `MINIMIZE`, `TOGGLE_MAXIMIZE`,
`MOVE`, `RESIZE`), so window behavior is easy to reason about and test in
isolation.

Layout is single-instance per app (opening an already-open app focuses it
rather than spawning a second window) and is persisted to
`localStorage["nostr:os-window-layout"]`, debounced by 200ms, and restored on
mount — so a reload (or the next visit) comes back with the same windows open
in the same place.

`Window.tsx` implements dragging and resizing with native Pointer Events
(`setPointerCapture`), which works identically for mouse, trackpad, and touch
input — no separate touch handling was needed. Z-index is derived from
`zOrder`, and clicking anywhere in a window (or via the menu bar's "Windows"
switcher) calls `focusApp`, which moves it to the end of `zOrder`.

## Mobile fallback

Desktop-style overlapping, draggable windows don't make sense on a phone.
`Desktop.tsx` checks `useIsMobile()` (the existing 768px breakpoint hook) and
swaps the whole window-manager *rendering* — not its state — for a mobile
shell:

- **`MobileHome`**: an icon-grid "home screen" shown when no app is active.
- **`MobileAppView`**: whichever app is topmost and not minimized renders
  full-screen, with a "Home" button that calls `minimizeApp` (so switching
  apps doesn't lose their state — same idea as backgrounding an app on iOS).
- **`Dock`** renders as a `compact` bottom tab bar instead of a floating dock.

Because both layouts share the same `WindowManagerContext`, "minimize" on
mobile is exactly "go home while keeping the app running in the background",
and re-opening it from the dock or home screen resumes it where it left off.
Desktop-only affordances (drag, resize, maximize) simply aren't rendered on
mobile — there's no separate mobile state machine to keep in sync.

## Deep links

Legacy routes (`/dashboard`, `/dashboard/events`, `/dashboard/export`,
`/explore`, `/messages`) redirect to `/os/<app-path>`. `Desktop.tsx`'s
`DeepLinkHandler` matches that path against the app registry, opens the
corresponding app if it isn't already open, and then normalizes the URL back
to `/os` (the window manager's own state is the source of truth for what's
open from then on, not the URL). The public marketing landing page at `/`
stays a normal page outside the shell, with a "Launch the App" /
"Open the Desktop" call to action linking into `/os`.

## Accessibility

- Each `Window` is `role="dialog"` with `aria-label` set to the app title, and
  receives DOM focus (`tabIndex={-1}` + `.focus()`) whenever it becomes the
  focused window, so keyboard/screen-reader users always land somewhere
  sensible after switching apps.
- **Cmd/Ctrl+`** cycles focus through open windows (mirrors macOS's
  "cycle through windows of the front app" shortcut; Cmd/Ctrl+Tab is reserved
  by the OS/browser).
- The menu bar's "Windows" menu is a fully keyboard-navigable dropdown listing
  every open app, so window switching never requires a mouse.
- Traffic-light buttons (close/minimize/maximize) all have explicit
  `aria-label`s (e.g. "Close Messages") rather than relying on color alone.
- Dock buttons expose `aria-pressed` for their running/focused state.
- The relay-status indicator is in an `aria-live="polite"` region so
  connect/disconnect changes are announced.
- The wallpaper's drift animation is disabled under `prefers-reduced-motion`.

## Nostr touches

- **Lock screen**: while logged out, `LockScreen` covers the desktop like a
  macOS login screen, offering the existing `LoginArea` (Nostr key /
  extension / bunker login) to "unlock", or "Continue without an account" to
  browse read-only apps as a guest. The guest choice is remembered in
  `localStorage["nostr:os-guest-mode"]`.
- **Relay status**: `useRelayStatus` (`src/hooks/useRelayStatus.ts`) opens a
  small dedicated WebSocket to the configured relay purely to reflect
  connecting/online/offline state in the menu bar (it doesn't participate in
  the app's actual Nostr queries, which go through `NPool`/`NostrProvider` as
  before).

## Known v1 simplifications

- Windows resize from the bottom-right corner only (no edge handles).
- Each app is single-instance (no "open two Explore windows").
- The menu bar's relay indicator shows connection state only, not a live
  event count.
