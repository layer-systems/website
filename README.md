# LAYER.systems

LAYER.systems is a Nostr client designed like a desktop operating system. Instead of
navigating between pages, you open apps in windows that can be moved, resized, stacked,
minimized, and kept open side by side. This makes it possible to read a thread, inspect a
profile, and keep your feed available at the same time.

The app is for people who use Nostr and want a focused, multitasking-friendly interface,
as well as contributors interested in building Nostr applications with React and
TypeScript.

## What you can do

- Browse a Following or Global feed, publish notes, and open notes with their replies.
- View profiles, follow or unfollow people, and search notes, replies, hashtags, and users.
- Read NIP-23 long-form articles, save notes and articles, and create web bookmarks.
- Discover picture posts and view live events with their NIP-53 chat.
- Browse Nostr calendar events by month.
- Manage relay connections, inspect connection latency, and configure relays and Blossom
  media servers.
- Sign in with a Nostr account, switch between accounts, and use NIP-19 identifiers such
  as `npub`, `note`, `nevent`, `nprofile`, and `naddr` as links.
- Save and share reusable Nostr queries with Spells.

LAYER.systems reads and writes Nostr events through relays. It does not provide a
centralized social database; your relays and signer remain the source of your Nostr data.
Some features require a signed-in account, and availability of content depends on the
relays you use.

## Run locally

### Requirements

- Node.js 22 or newer
- npm

Clone the repository, install dependencies, and start the Vite development server:

```bash
git clone https://github.com/layer-systems/website.git
cd website
npm install
npm run dev
```

The development server listens on <http://localhost:8080>. The app has no required
environment variables; relay and media-server settings are managed in the app.

Useful commands:

```bash
npm run test   # Type-check, lint, run Vitest, and create a production build
npm run build  # Create the production bundle in dist/
```

`npm run build` also creates `dist/404.html`, which supports client-side routes when the
build is deployed as a static site.

## Production deployment

The repository includes a GitHub Actions workflow in
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). It runs on pushes to
`main` (or manually from the Actions tab), builds the app with Node.js 22, and deploys
`dist/` to GitHub Pages.

For another static host, run `npm run build` and publish the generated `dist/` directory.
Configure the host to serve `dist/404.html` for unknown paths so direct NIP-19 links
continue to load the client application.

## Technology

- [React 19](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) for development and production builds
- [Tailwind CSS](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/) for UI
- [Nostrify](https://www.npmjs.com/package/@nostrify/nostrify) and
  [nostr-tools](https://github.com/nbd-wtf/nostr-tools) for Nostr integration
- [React Router](https://reactrouter.com/) for the root and NIP-19 routes
- [TanStack Query](https://tanstack.com/query) for fetching and caching
- [Vitest](https://vitest.dev/) and
  [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
  for tests

The application is organized into three main layers:

```text
src/os/              Window manager, persistence, layout, and keyboard shortcuts
src/components/os/   Desktop shell, menu bar, windows, and mobile app shell
src/apps/            Nostr and system apps rendered inside windows
src/components/      Shared UI, authentication, and Nostr components
src/hooks/           Data access and application hooks
```

Apps are registered in [`src/os/registry.ts`](./src/os/registry.ts). Each app is lazy
loaded and receives a small window-oriented contract, so adding an app normally does not
require changing the router. Read [the app guide](./docs/apps.md) before adding one.

## Documentation

- [Documentation index](./docs/README.md)
- [Window manager](./docs/window-manager.md)
- [App development](./docs/apps.md)
- [Nostr data access and safety](./docs/nostr.md)
- [Style guide](./docs/styleguide.md)
- [Project architecture and design decisions](./PLAN.md)

For protocol reference, see the [Nostr protocol documentation](https://nostr.com/).

## Contributing

1. Create a branch for your change.
2. Install dependencies with `npm install`.
3. Make the smallest focused change that fits the existing architecture.
4. Run `npm run test`.
5. Open a pull request describing the behavior you changed and how you verified it.

When working with Nostr content, treat events, URLs, and profile metadata as untrusted
input. Follow the validation and URL-sanitization patterns in
[`docs/nostr.md`](./docs/nostr.md), and do not use `any` in TypeScript.

## License

LAYER.systems is dedicated to the public domain. You are free to copy, modify,
distribute, and use it for any purpose, commercial or non-commercial.
