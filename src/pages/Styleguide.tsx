import { useSeoMeta } from '@unhead/react';
import { SiteHeader } from '@/components/brand/SiteHeader';
import { SiteFooter } from '@/components/brand/SiteFooter';
import { LayerStack } from '@/components/brand/LayerStack';
import { LayerDivider } from '@/components/brand/LayerDivider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Swatch {
  name: string;
  token: string;
  hex: string;
  usage: string;
  dark?: boolean;
}

const colors: Swatch[] = [
  { name: 'Paper', token: 'background', hex: '#F5F6F5', usage: 'Default light-mode surface' },
  { name: 'Ink', token: 'brand-ink', hex: '#0E1116', usage: 'Hero panel + dark-mode surface', dark: true },
  { name: 'Relay Amber', token: 'primary', hex: '#F5A623', usage: 'Signature accent, primary actions, the "signal"' },
  { name: 'Deep Signal Navy', token: 'brand-navy', hex: '#1C2B45', usage: 'Structural color — layer bands, dark accents', dark: true },
  { name: 'Circuit Cyan', token: 'brand-cyan', hex: '#3FC1CE', usage: 'Secondary data color for charts + hover accents' },
  { name: 'Slate Ink', token: 'foreground', hex: '#2B3140', usage: 'Body text on light surfaces' },
];

const spacingScale = [1, 2, 3, 4, 6, 8, 12, 16, 24];

function Section({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('py-14 sm:py-16', className)}>
      <p className="eyebrow text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

export function Styleguide() {
  useSeoMeta({
    title: 'Styleguide — LAYER.systems',
    description: 'The LAYER.systems design system: color, type, spacing, and components.',
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-6">
        <div className="border-b border-border py-16 sm:py-20">
          <p className="eyebrow text-primary">Design system</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Styleguide</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            The visual language behind LAYER.systems: a relay is one layer between a client and
            the network, so the whole system is built around that stack — literally.
            The full rationale lives in{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">docs/DESIGN_STYLEGUIDE.md</code>.
          </p>
        </div>

        {/* Signature */}
        <Section eyebrow="Signature" title="The layer stack">
          <p className="max-w-2xl text-muted-foreground">
            Every note travels Client → Relay → Network. Instead of a logo standing in for that,
            the brand mark is the stack itself — this relay lit up as the middle layer.
          </p>
          <div className="mt-8 rounded-xl border border-border bg-brand-ink p-10">
            <LayerStack className="mx-auto" />
          </div>
          <div className="mt-10 flex items-center gap-6">
            <LayerDivider />
            <p className="text-sm text-muted-foreground">
              A quiet echo of the stack, used to break up sections without repeating the hero mark.
            </p>
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Color */}
        <Section eyebrow="Color" title="Palette">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {colors.map((c) => (
              <div key={c.name} className="overflow-hidden rounded-lg border border-border">
                <div
                  className="h-20"
                  style={{ backgroundColor: `hsl(var(--${c.token}))` }}
                />
                <div className="space-y-1 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm font-semibold">{c.name}</p>
                    <span className="font-mono text-xs text-muted-foreground">{c.hex}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.usage}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Type */}
        <Section eyebrow="Type" title="Display, body, data">
          <div className="space-y-8">
            <div>
              <p className="eyebrow text-muted-foreground">Display — JetBrains Mono, for headlines &amp; data</p>
              <p className="mt-2 font-display text-5xl font-bold tracking-tight">Signal in, signal out.</p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Body — Inter, for everything you read</p>
              <p className="mt-2 max-w-xl text-lg text-muted-foreground">
                Body copy stays in a humanist sans so long-form reading — terms, docs, dashboard
                explanations — never feels like staring at a terminal.
              </p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Mono in use — labels &amp; identifiers</p>
              <p className="mt-2 font-mono text-sm text-foreground">
                wss://relay.layer.systems · kind:1 · npub1q4w0…f8x2
              </p>
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Spacing */}
        <Section eyebrow="Spacing" title="4px base scale">
          <div className="space-y-2">
            {spacingScale.map((n) => (
              <div key={n} className="flex items-center gap-4">
                <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{n * 4}px</span>
                <div className="h-3 rounded-sm bg-primary/70" style={{ width: `${n * 4}px` }} />
              </div>
            ))}
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Components */}
        <Section eyebrow="Components" title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section eyebrow="Components" title="Badges">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </Section>

        <Section eyebrow="Components" title="Cards">
          <div className="grid gap-8 pb-4 sm:grid-cols-2">
            <div className="layer-card rounded-lg border border-border bg-card p-6">
              <p className="font-display text-sm font-semibold">Layer card</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Two offset hairline borders instead of a soft shadow — the site's default card
                treatment, echoing the stack motif.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <p className="font-display text-sm font-semibold">Plain card</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Used inside dense data views (dashboard, explorer) where the layered border would
                add visual noise.
              </p>
            </div>
          </div>
        </Section>

        <Section eyebrow="Components" title="Form &amp; feedback">
          <div className="max-w-md space-y-4">
            <Input placeholder="npub1…" />
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>
                Alerts explain what happened and what to do next — never vague, never apologetic.
              </AlertDescription>
            </Alert>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}

export default Styleguide;
