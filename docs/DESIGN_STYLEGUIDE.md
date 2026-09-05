# LAYER.systems Design Styleguide

Read this before making visual changes anywhere in the app. The live version of
everything below is at [`/styleguide`](../src/pages/Styleguide.tsx).

## The idea

LAYER.systems is a public Nostr relay: one layer in the path between a
person's client and the rest of the network. The brand doesn't use a logo to
*represent* that — the signature visual **is** the stack (`Client → Relay →
Network`, see `src/components/brand/LayerStack.tsx`), lit up at the relay
layer, because that's literally what this product is.

Everything else in the system follows from taking that stack seriously:
layered, hairline-bordered surfaces instead of soft drop shadows; a
monospace face used for headlines and data, not tucked away as a caption
font; and a dark "Ink" hero that reads like an oscilloscope panel, not a
marketing gradient.

## Color

Named tokens live in `src/index.css` as HSL CSS variables, consumed through
Tailwind (`tailwind.config.ts`) and shadcn/ui components. Don't hardcode hex
values in components — reference the token (`bg-primary`, `text-brand-cyan`,
`hsl(var(--brand-navy))`) so light/dark mode and future palette tweaks stay
centralized.

| Name | Hex | Token | Usage |
|---|---|---|---|
| Paper | `#F5F6F5` | `--background` (light) | Default light-mode surface — cool, not cream |
| Ink | `#0E1116` | `--brand-ink`, `--background` (dark) | Hero panel + dark-mode base surface |
| Relay Amber | `#F5A623` | `--primary` | The signature signal color: primary actions, the "live" layer, focus rings |
| Deep Signal Navy | `#1C2B45` | `--brand-navy` | Structural color for layer bands and dark-mode accents |
| Circuit Cyan | `#3FC1CE` | `--brand-cyan`, `--chart-2` | Secondary data color — charts, hover accents |
| Slate Ink | `#2B3140` | `--foreground` (light) | Body text on light surfaces |

Both light and dark modes share the same amber accent so the brand reads
consistently either way — only the surface (paper vs. ink) flips.

**Why not the obvious defaults:** we deliberately avoided a warm-cream +
serif look (doesn't fit infrastructure) and a pure near-black + single
neon accent (too generic for what should feel like real hardware — a relay
lamp, not a startup gradient). The dark hero pairs a warm accent (amber)
with a cool structural color (navy) and a cool data color (cyan), which is
richer than the single-accent cliché, and only the *hero* is dark — the app
itself is light-first.

## Type

Two faces, doing different jobs:

- **Display / data — JetBrains Mono** (`font-display` / `font-mono`,
  `@fontsource-variable/jetbrains-mono`). Used for headlines, the eyebrow
  labels (`.eyebrow` utility class), stat numbers, relay URLs, hex ids, and
  timestamps. This is a wire-protocol product — a monospace headline is a
  deliberate choice that matches the subject, not a caption font promoted
  by accident.
- **Body — Inter** (`font-sans`, `@fontsource-variable/inter`). Everything a
  person reads at length: paragraphs, descriptions, terms & privacy copy.

Both are self-hosted via `@fontsource-variable/*` and imported once in
`src/main.tsx` — the CSP (`font-src 'self'`) blocks third-party font CDNs,
so don't add a Google Fonts `<link>`.

Eyebrow labels use the `.eyebrow` utility (`src/index.css`): mono, uppercase,
`0.14em` tracking, small size. Use them to label a section's role
("Public Nostr relay", "Getting connected"), not as decoration.

## Spacing & radius

Standard Tailwind 4px scale (`--spacing: 0.25rem`). `--radius` is `0.5rem`
site-wide — soft enough to feel modern, restrained enough to stay
technical. Don't mix radius values ad hoc; use the `rounded-lg` /
`rounded-md` / `rounded-sm` scale derived from the token.

## Signature components

- **`LayerStack`** (`src/components/brand/LayerStack.tsx`) — the hero mark.
  Three cascading bands (Client / Relay / Network), the relay band lit
  amber and gently pulsing. Respects `prefers-reduced-motion` via Tailwind's
  `motion-safe:` variant — the settle-in animation and pulse simply don't
  run when reduced motion is requested; the stack still renders in its
  final state.
- **`LayerDivider`** — a quiet three-line echo of the stack for breaking up
  sections without repeating the hero verbatim.
- **`.layer-card`** utility class — the default card treatment across the
  marketing site: two hairline borders offset by 6px instead of a drop
  shadow, widening slightly on hover. Use plain `border + shadow-sm` cards
  instead inside dense data views (dashboard, explorer) where the offset
  border would add noise against a grid of cards.

## Components

Built on shadcn/ui (`src/components/ui/*`) — Button, Card, Badge, Input,
Alert, Sidebar, etc. — restyled entirely through the token layer, not by
forking the components. See `/styleguide` for live specimens of every
variant. When adding new UI, prefer an existing shadcn primitive over a
bespoke one.

## Motion

- Page-load: the `LayerStack` bands settle in with a short staggered
  animation (`animate-layer-settle`); the relay band pulses continuously
  but subtly (`animate-signal-pulse`).
- Hover: `.layer-card` widens its offset border; buttons and links use the
  existing shadcn transition tokens. No scroll-triggered effects — this is
  a technical, read-once page, not a scrollytelling site.
- Everything animated is wrapped in Tailwind's `motion-safe:` variant so
  `prefers-reduced-motion: reduce` gets the static end state.

## Accessibility

- Color pairs (background/foreground, primary/primary-foreground, etc.)
  are chosen for contrast in both themes — check new token pairs with a
  contrast checker before shipping.
- Interactive elements rely on shadcn's built-in focus rings (`--ring`,
  amber) — don't remove `focus-visible` outlines.
- The `LayerStack` diagram carries a text `aria-label` describing the same
  information conveyed visually (client → this relay → the network).

## Voice

Plain, direct, written from the person's side of the screen: "add the
relay," not "leverage relay connectivity." Say what things do, not why
they're impressive. Errors and empty states say what happened and what to
do next — see `NotFound.tsx` for the tone ("There's no layer at
`/whatever`") instead of a generic apology.
