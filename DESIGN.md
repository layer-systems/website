# LAYER.systems Design Direction

## 1. Design Intent

LAYER.systems should feel like Nostr relay infrastructure made visible: direct, fast, public, and protocol-native. The visual direction takes cues from bold editorial community sites such as `einundzwanzig.space`: strong navigation, large type, ticker energy, clear content bands, and a public-broadcast feeling.

This is not a clone. LAYER.systems needs its own identity: orange, infrastructural, decentralized, and practical. The site should make the relay endpoint the center of the experience, not a footnote.

## 2. Reference Translation

Inspired by `einundzwanzig.space`:

- Strong top navigation with grouped links.
- Large typographic hero with direct messaging.
- Horizontal ticker / marquee energy for relay URLs, protocol phrases, and network language.
- Clear content bands for relay status, usage, and connection steps.
- Editorial confidence instead of generic landing-page polish.
- Playful tone without losing operational credibility.

Translate for LAYER.systems:

- Use an orange-led palette instead of purple.
- Replace podcast/news hierarchy with relay endpoint and Nostr infrastructure hierarchy.
- Replace sponsor/content blocks with relay, protocol, client, and network modules.
- Use `wss://relay.layer.systems` as a visible recurring design motif.
- Make the copyable relay URL feel like the main product surface.

## 3. Personality

The interface should be:

- Public, not gated.
- Bold, not glossy.
- Operational, not corporate.
- Protocol-aware, not protocol-obscure.
- Human in tone, calm in structure.

Avoid:

- Generic orange gradient SaaS aesthetics.
- Overly soft pastel community branding.
- Crypto-bro visual language.
- Dense technical jargon in primary UI copy.
- Stock-photo hero sections.

## 4. Visual System

### Color Palette

Use orange as the identity anchor, but avoid a one-note all-orange interface.

Suggested palette:

- `Signal Orange`: `#F97316` for primary actions and identity marks.
- `Deep Ink`: `#18110D` for dark text, footer, and hard borders.
- `Relay Amber`: `#FACC15` for secondary highlights and ticker details.
- `Paper`: `#FFF7E8` for warm page background.
- `Chalk`: `#FFFFFF` for content surfaces.
- `Clay`: `#7C3F1D` for subdued labels and supporting text.
- `Protocol Green`: `#17A673` for live/verified states.
- `Network Blue`: `#2563EB` as a sparing cool accent.

Usage rules:

- Orange should lead, not flood.
- Use ink-heavy contrast and crisp borders for readability.
- Use amber, green, and blue sparingly to prevent the interface from becoming monochrome.
- Relay cards should remain legible before they are decorative.

### Typography

The type system should feel editorial and independent.

Recommended direction:

- Display: bold grotesk weight for hero and section titles.
- Body: readable sans with warmth and strong numerals.
- Mono: restrained monospace for relay URLs, event kinds, public keys, and tags.

Implementation preference:

- Use `@fontsource` packages when available.
- Use CSS variables for font families.
- Keep body text comfortable on content-heavy sections.
- Keep hero type large and compact, but never allow it to overflow mobile widths.

## 5. Layout

### Page Structure

The first version should be a single-page relay experience:

1. Sticky navigation
2. Relay ticker
3. Hero / identity
4. Copyable relay endpoint
5. Relay feature modules
6. Client connection steps
7. Footer with terms, privacy, and dashboard links

### Navigation

The nav should feel practical and slightly editorial:

- Left: LAYER.systems wordmark.
- Center: Relay, Signal, Connect, Explore.
- Right: `LoginArea`.
- Mobile: compact header with persistent login/account access.

Use strong text links and clear hover/focus treatment. Avoid oversized pill buttons for every nav item.

### Ticker

Add a horizontal ticker near the top of the page.

Potential ticker phrases:

- `LAYER.systems`
- `public Nostr relay`
- `wss://relay.layer.systems`
- `open protocols`
- `relay-first social`
- `NIP-aware infrastructure`
- `bring your own client`
- `events over platforms`

Ticker behavior:

- Continuous motion on desktop.
- Static fallback with `prefers-reduced-motion`.
- High contrast.
- No essential information should exist only in the ticker.

### Hero

The hero should be typographic and signal-heavy.

Content:

- Main title: `Relay signal for the open social web.`
- Supporting line: a concise statement about public Nostr relay infrastructure.
- Primary CTA: jump to the relay URL.
- Secondary CTA: jump to connection steps.

Visual treatment:

- Large editorial headline.
- Copyable endpoint module.
- Subtle grid or protocol texture is acceptable if it does not reduce readability.
- Use real relay/data motifs rather than abstract decorative blobs.

## 6. Components

### Relay Endpoint Card

Required elements:

- Relay URL.
- Copy button with copied state.
- Access mode.
- Network/protocol labels.
- Clear read/write language when applicable.

Design:

- Rectangular panel with `8px` or less radius.
- Crisp border and offset shadow.
- Relay URL must wrap safely on small screens.
- Copy action must remain reachable on mobile.

### Feature Cards

Required elements:

- Icon.
- Short title.
- One practical sentence.

Design:

- Rectangular cards.
- Crisp border.
- Subtle hover shift.
- No nested cards.

### Connection Steps

Required elements:

- Step number.
- Client action.
- Relay URL in the add-relay step.

Design:

- Structured rows or blocks.
- Step numbers should be visually strong.
- Code text should wrap cleanly.

### Empty States

If live relay status or event lists are added later, empty states should be minimalist and practical:

- Explain what data will appear.
- Include a short hint about adding `wss://relay.layer.systems` from any Nostr client.
- Avoid speculative promises about uptime or persistence.

## 7. Motion

Motion should feel like signal movement, not decoration.

Use:

- Ticker movement.
- Subtle hover shifts on cards and CTAs.
- Focus-visible rings with a quick transition.

Avoid:

- Heavy parallax.
- Decorative floating orbs.
- Motion that distracts from reading the relay URL.

Respect `prefers-reduced-motion`.

## 8. Imagery and Texture

This site does not need stock photography.

Preferred visual motifs:

- Relay/network linework.
- Terminal-inspired grid texture.
- Endpoint/code fragments.
- Protocol tags and event-kind labels.
- Simple infrastructure diagrams.

Texture direction:

- Light paper/noise texture is acceptable.
- Grid backgrounds are acceptable.
- Keep texture subtle enough that body text remains AA compliant.

## 9. Accessibility

Requirements:

- WCAG 2.1 AA contrast for text and controls.
- Keyboard-accessible navigation and controls.
- Visible focus states.
- Semantic headings.
- Descriptive alt text for static images.
- Empty `alt` for purely decorative images.
- No unsafe HTML injection.

## 10. Responsive Behavior

Mobile:

- Single-column flow.
- Sticky compact nav.
- Ticker can become static.
- Relay URL must wrap without layout overflow.
- Hero type must scale by breakpoint, not viewport-width formulas.

Tablet:

- Two-column section layouts where useful.
- Endpoint card remains prominent.

Desktop:

- Editorial grid with asymmetric section rhythm.
- Relay endpoint and hero copy share the first viewport.
- Keep primary content width controlled for readability.

## 11. Copy Tone

Tone should be direct and protocol-native.

Good:

- `Relay signal for the open social web.`
- `A public Nostr relay for portable social identity.`
- `Add the relay URL from any Nostr client.`
- `Events over platforms.`

Avoid:

- `Revolutionizing social engagement`
- `The ultimate decentralized ecosystem`
- `Next-generation community platform`
- `Seamless innovative experiences`

## 12. Implementation Notes

- Use existing shadcn/ui primitives.
- Keep cards at `8px` radius or less unless a local component requires otherwise.
- Use `cn()` for class composition when class branching is needed.
- Use lucide icons where icons are needed.
- Define color and font tokens in CSS variables.
- Keep sections as full-width bands with constrained inner content.
- Do not nest UI cards inside UI cards.
- Do not add unsafe HTML rendering for Nostr content.
- Sanitize all event-sourced URLs before rendering.

## 13. Documentation Tie-In

The `/docs` folder can document the design system once implementation expands.

Recommended docs:

- `/docs/design-system.md`: colors, typography, spacing, components.
- `/docs/content-guidelines.md`: tone, protocol language, relay usage guidance.
- `/docs/nostr-data.md`: relay-facing event kinds, tags, validation, and query patterns.

## 14. Design Acceptance Criteria

- The site clearly reads as LAYER.systems in the first viewport.
- The visual direction feels inspired by `einundzwanzig.space` but has its own orange Nostr relay identity.
- The relay endpoint is visually central, not secondary.
- The interface remains readable and usable at 360px width.
- Motion respects `prefers-reduced-motion`.
- UI contrast meets WCAG 2.1 AA.
- The design avoids generic orange SaaS styling.
