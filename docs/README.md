# Documentation

This project is a Nostr client built as a **desktop operating system**: there are no
pages, only apps that open as windows you can move, resize, stack and keep side by
side. `PLAN.md` in the repository root records why it was built this way and which
decisions were taken; these documents describe how it actually works.

| Document | What it covers |
|---|---|
| [`window-manager.md`](./window-manager.md) | The OS core: state, geometry, gestures, persistence, routing |
| [`apps.md`](./apps.md) | The app registry, the contract every app implements, and how to add one |
| [`nostr.md`](./nostr.md) | Data access, relay hints, and the rules for rendering untrusted content |
| [`styleguide.md`](./styleguide.md) | Design tokens, materials, typography, motion, and the layout rules for app content |
| [`versioning.md`](./versioning.md) | The package version source and release workflow |

## Layout of the custom code

```
src/
  os/                    # Window manager — no UI, no Nostr
    types.ts             # AppDefinition, WindowState, AppProps
    registry.ts          # The catalogue of apps
    windowReducer.ts     # All state transitions (pure)
    WindowManagerProvider.tsx
    WindowManagerContext.ts
    useWindowManager.ts
    layout.ts            # Viewport maths: clamping, cascade, snap targets
    useDrag.ts           # Pointer-driven moving
    useResize.ts         # Pointer-driven resizing
    useOsKeyboard.ts     # System-wide shortcuts
    persistence.ts       # Session save / restore

  components/os/         # The shell
    OsShell.tsx          # Entry point: picks desktop or mobile, syncs the URL
    MenuBar.tsx          # macOS-style bar (app menu, Go, Window, relays, theme, login)
    MenuBarClock.tsx
    Desktop.tsx          # Wallpaper, icon grid, desktop context menu
    DesktopIcon.tsx
    WindowLayer.tsx      # Renders every window, owns the snap preview
    WindowFrame.tsx      # Window chrome: title bar, traffic lights, resize handles
    TrafficLights.tsx
    CommandPalette.tsx   # ⌘K
    MobileAppShell.tsx   # Home screen + full-screen app, under 768px
    AppChrome.tsx        # Layout primitives every app builds on

  components/nostr/      # Shared Nostr UI
    NoteCard.tsx, NoteContent.tsx, AuthorLine.tsx, LoginRequired.tsx

  apps/<id>/index.tsx    # One default-exported component per app

  hooks/                 # useRelayStatus, useRelayHints, useFollows (+ template hooks)
  lib/nostrUtils.ts      # sanitizeUrl, relay hints, tag helpers, time formatting
```

The three layers do not reach into each other: `src/os/` knows nothing about Nostr or
about any particular app, `components/os/` knows about windows but not about note
kinds, and an app knows about its own data but never about window geometry.

## Running it

```bash
npm run dev     # Vite dev server (port 8080 by default — see vite.config.ts)
npm run test    # tsc --noEmit + eslint + vitest + production build
```

`npm run test` is the gate: it type-checks, lints, runs the unit tests and builds.
Nothing is finished until it passes.
