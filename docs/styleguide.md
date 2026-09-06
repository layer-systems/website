# Style guide

The design has two parents. **macOS** supplies the mechanics: a menu bar pinned to the top,
windows with title bars and traffic lights, focus expressed through the stack.
**[PostHog](https://posthog.com)** supplies the look: flat surfaces, warm off-white, hairline
borders, generous but not empty spacing, one confident accent used sparingly.

What it is *not*: an Apple pastiche. No Apple iconography, no glassmorphism everywhere, no
skeuomorphic textures. The OS is a metaphor for multitasking, not an end in itself.

---

## 1. Colour

All colour lives in CSS custom properties in `src/index.css`, defined on `:root` and
overridden in `.dark`. Nothing in a component should ever contain a raw hex value — the
one deliberate exception is the traffic lights, whose red/amber/green are a platform
convention rather than part of this palette.

### Accent

**Nostr violet.** Chosen over the PostHog orange to have an identity of its own at the
same brightness and saturation.

| | Light | Dark |
|---|---|---|
| `--primary` | `hsl(265 85% 60%)` | `hsl(265 85% 70%)` |
| `--primary-foreground` | `hsl(0 0% 100%)` | `hsl(265 40% 12%)` |
| `--ring` | `hsl(265 85% 60%)` | `hsl(265 85% 70%)` |

Green is deliberately **not** an accent — it is reserved for connection status, so a green
dot always means one thing.

### Surfaces

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--os-desktop` | `hsl(40 22% 95%)` | `hsl(265 12% 8%)` | The wallpaper ground |
| `--os-desktop-dot` | `hsl(30 12% 82%)` | `hsl(265 8% 20%)` | The dot grid |
| `--background` | `hsl(0 0% 100%)` | `hsl(265 10% 12%)` | Window content |
| `--os-titlebar` | `hsl(40 20% 98%)` | `hsl(265 10% 16%)` | Focused title bar |
| `--os-titlebar-inactive` | `hsl(40 12% 96%)` | `hsl(265 10% 13%)` | Unfocused title bar |
| `--os-window-border` | `hsl(30 12% 86%)` | `hsl(265 8% 24%)` | Window outline |
| `--os-menubar` | `hsl(40 25% 99% / 0.72)` | `hsl(265 12% 12% / 0.72)` | Menu bar, translucent |
| `--sidebar` | `hsl(40 20% 97%)` | `hsl(265 11% 10%)` | In-app sidebars |

The light surfaces are warm (hue 30–40) rather than neutral grey; the dark ones are tinted
towards the violet accent (hue 265). Both themes are designed, not derived — dark mode is
not an inversion.

### Text and lines

| Token | Light | Dark |
|---|---|---|
| `--foreground` | `hsl(20 14% 12%)` | `hsl(40 12% 94%)` |
| `--muted-foreground` | `hsl(25 8% 45%)` | `hsl(265 6% 64%)` |
| `--border` | `hsl(30 12% 88%)` | `hsl(265 8% 22%)` |

Measured contrast (WCAG 2.1, sRGB), so these are facts rather than intentions:

| Pair | Light | Dark |
|---|---|---|
| `--foreground` on `--background` | 16.6:1 | 14.9:1 |
| `--muted-foreground` on `--background` | 4.7:1 | 6.4:1 |
| `--primary-foreground` on `--primary` | 5.1:1 | 5.4:1 |
| Desktop icon label (`foreground/80`) on `--os-desktop` | 8.2:1 | 10.7:1 |

`--muted-foreground` clears 4.5:1 with little to spare, which is the point: it is as light
as it can be while still being safe for real secondary text. Darkening the surface it sits
on, or lightening it further, breaks that — check before you do either.

One caveat: `--muted-foreground` on `--os-desktop` measures **4.3:1**, just under AA.
Muted text is never placed directly on the wallpaper for that reason; desktop icon labels
use `text-foreground/80` instead.

### Status

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--success` | `hsl(150 60% 38%)` | `hsl(150 55% 50%)` | Relay connected |
| `--warning` | `hsl(38 92% 48%)` | `hsl(38 90% 58%)` | Connecting / closing |
| `--destructive` | `hsl(0 72% 51%)` | `hsl(0 65% 55%)` | Failed action |

The status dots are 8px graphical indicators, which WCAG holds to 3:1 rather than
4.5:1 — `--success` measures 3.5:1 on white and 7.7:1 on the dark surface. That threshold
is only defensible because **status colour is never the only signal**: every dot sits next
to a text label or an `aria-label` spelling out the state.

> **Do not paint a resting state red.** Relays are opened on demand and closed after
> idling, so "0 connected" is normal. It renders as muted grey; red would cry wolf and
> teach people to ignore it.

---

## 2. Materials

**Windows.** `bg-background`, a 1px `border-os-window-border`, `rounded-xl`, and one of two
shadows. Focus is carried by the shadow and the title bar, not by a coloured outline:

```css
--os-shadow-idle:     0 8px 24px -10px  …/0.14;   /* unfocused */
--os-shadow-focused:  0 24px 60px -12px …/0.22,
                      0 8px 20px -8px   …/0.14;   /* focused   */
```

The switch is driven by `data-focused="true"` on the window root, so it costs no extra
class churn. A **maximized** window drops its rounding and side borders — rounded corners
would leave slivers of desktop showing.

**Menu bar.** The only surface in the app with a blur: `backdrop-filter: blur(14px)
saturate(180%)` over a 72% opaque ground. Keeping it to one place makes it feel
deliberate rather than decorative.

**Wallpaper.** A dot grid drawn with a single `radial-gradient`, 22px spacing, at very low
contrast. No image, so it re-colours with the theme and costs nothing to load:

```css
.os-desktop-surface {
  background-color: var(--os-desktop);
  background-image: radial-gradient(var(--os-desktop-dot) 1px, transparent 1px);
  background-size: 22px 22px;
}
```

**Radius.** `--radius: 0.75rem`. Windows and desktop icon tiles `rounded-xl`, buttons and
inputs `rounded-md`, avatars and dots fully round.

**Scrollbars.** `.os-scroll` gives a 10px translucent thumb on a transparent track. Applied
to every scrolling region so dense content does not get a heavy platform bar.

---

## 3. Typography

**Inter Variable**, self-hosted via `@fontsource-variable/inter` — the project's CSP is
`font-src 'self'`, so Google Fonts is not an option. System sans is the fallback stack;
`ui-monospace` is used for keys, event ids and relay URLs.

| Context | Size | Weight |
|---|---|---|
| Menu bar, title bars, app toolbars | 13px | 400, app menu 500–600 |
| App body text | 14–15px | 400 |
| Note content | 15px | 400, `leading-relaxed` |
| Section labels | 11px uppercase, `tracking-wide` | 600, `muted-foreground` |
| Headings in app content | 18–24px, `tracking-tight` | 600 |
| Article headline | 30px, `leading-tight` | 600 |
| Desktop icon labels | 11px | 500 |

Chrome (menu bar, title bars, toolbars) sits at 13px and stays quiet. Content is larger and
carries the hierarchy. Numeric columns use `tabular-nums` so they do not jitter as they
update.

---

## 4. Motion

Short and functional. Nothing bounces, nothing announces itself.

| Element | Animation |
|---|---|
| Window opening | 160ms `scale(.96) → 1` + fade, `cubic-bezier(.22, 1, .36, 1)` |
| Snap preview | 200ms fade |
| Focus shadow | 160ms ease |
| Hover states | Tailwind default transitions |

```css
@media (prefers-reduced-motion: reduce) {
  .os-window { transition: none; }
  .os-window-enter > * { animation: os-fade-in 120ms ease-out; }
}
```

Reduced motion drops every transform and keeps only opacity. This is a hard requirement,
not a nicety — a desktop full of scaling windows is exactly the pattern that triggers
vestibular discomfort.

Dragging and resizing are not animated at all: they follow the pointer directly, because
any easing would feel like lag.

---

## 5. App content: how to not look like a website

This is the section that does the most work. An app inside a window must read as an
application, not as a page that happens to be in a frame.

### Compose from the primitives

`src/components/os/AppChrome.tsx`:

| Component | Role |
|---|---|
| `AppLayout` | `h-full` flex column — the root of every app |
| `AppToolbar` | Fixed 44px bar under the title bar: search, filters, actions |
| `AppBody` | The **only** scrolling region (`.os-scroll`, `overflow-y-auto`) |
| `AppSidebar` | 224px, `bg-sidebar`, hidden below 640px |
| `AppSplit` | Row wrapper for sidebar + body |
| `AppSectionTitle` | The 11px uppercase label |
| `EmptyState` | Title, optional hint, optional action |

```tsx
<AppLayout>
  <AppToolbar>…</AppToolbar>
  <AppSplit>
    <AppSidebar>…</AppSidebar>
    <AppBody>…</AppBody>
  </AppSplit>
</AppLayout>
```

### The rules

- **No page heading.** The window title *is* the heading. A large `<h1>` at the top of the
  content repeats it and wastes the first screenful.
- **No centred column.** `max-w-4xl mx-auto` inside a window leaves dead margins. Fill the
  window with flex or grid. (The article reader is the single exception: a measure limit is
  what long-form prose needs.)
- **Scroll inside, never outside.** `body` has `overflow: hidden`. Only `AppBody` scrolls.
- **Dense over airy.** List rows around 44px, separated by `border-b border-border`. Not
  cards with 24px of padding stacked in a column.
- **Empty states are short and actionable.** "You are not following anyone yet" plus a
  button that does something about it. No illustrations, no marketing voice.
- **Skeletons for structured content**, spinners only inside buttons or for very short
  operations. A skeleton should echo the shape of what is loading.
- **Hover-revealed actions.** Row actions live at `opacity-0`, appearing on
  `group-hover` *and* `focus-within` — so keyboard users get them too.

### Spacing

Tailwind's 4px scale. Chrome uses `px-3` / `gap-2` / `gap-3`; content uses `p-4` and up.
Avoid one-off arbitrary values; `text-[13px]` for chrome type is the intentional exception,
because 13px is genuinely between Tailwind's `text-xs` and `text-sm`.

---

## 6. Accessibility

Non-negotiable, and cheap if done from the start.

- **Real controls.** Traffic lights are `<button>` elements with `aria-label`
  ("Close window", "Minimize window", "Toggle full size") — not coloured `div`s. Every
  clickable thing is a button or a link.
- **Windows** are `role="dialog"` with `aria-label={title}` and `aria-modal={false}` —
  they are not modal and must not trap focus.
- **Focus is always visible.** `:focus-visible` paints a 2px `--ring` outline with 2px
  offset, globally. Nothing removes it.
- **Full keyboard operation.** Desktop icons respond to Enter and Space; menus and the
  command palette come from Radix and cmdk with their keyboard handling intact; the system
  shortcuts are listed in [`window-manager.md`](./window-manager.md).
- **Shortcuts yield to text entry.** `⌘W` and `⌘M` do nothing while an input, textarea,
  select or `contenteditable` has focus.
- **Hiding without unmounting** uses an inline `display: none` rather than the `hidden`
  attribute — `hidden` loses to the `flex` utility class, and a "hidden" window that is
  still in the accessibility tree is worse than useless.
- **Responsive to 360px** through the mobile shell.

---

## 7. Adding to the system

**A new colour** goes in `:root` *and* `.dark` in `src/index.css`, and gets a
`--color-*` alias in the `@theme inline` block if components need it as a Tailwind
utility. Never a bare hex in a component.

**A new UI component** starts as a copy of an existing `src/components/ui/` component, uses
`cn()` for conditional classes and `class-variance-authority` for variants, and covers
`hover`, `focus-visible`, `active` and `disabled`.

**A new app** follows [`apps.md`](./apps.md) and composes from `AppChrome`. If you find
yourself reaching past the primitives for layout, that is the signal the app is drifting
back towards being a web page.
