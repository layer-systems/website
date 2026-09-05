import { Laptop, Radio, Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Layer {
  eyebrow: string;
  name: string;
  detail: string;
  icon: typeof Laptop;
  emphasis?: boolean;
}

const layers: Layer[] = [
  {
    eyebrow: '01 · You',
    name: 'Client',
    detail: 'Damus, Amethyst, Snort, or any Nostr app',
    icon: Laptop,
  },
  {
    eyebrow: '02 · This relay',
    name: 'LAYER.systems',
    detail: 'Receives, stores, and serves signed events',
    icon: Radio,
    emphasis: true,
  },
  {
    eyebrow: '03 · Everyone else',
    name: 'Nostr network',
    detail: 'Every other relay and client your notes reach',
    icon: Globe2,
  },
];

/**
 * The site's signature device: LAYER.systems is literally one layer in a
 * relay stack, so the brand mark is that stack, not a logo standing in
 * for it. Each band cascades down and to the right — data moving outward
 * from the reader's client, through this relay, into the wider network.
 */
export function LayerStack({ className }: { className?: string }) {
  return (
    <div className={cn('w-full max-w-md', className)} role="img" aria-label="Diagram: your client connects through the LAYER.systems relay to reach the wider Nostr network">
      {layers.map((layer, i) => (
        <div
          key={layer.name}
          className={cn(
            'motion-safe:animate-layer-settle',
            i > 0 && '-mt-px'
          )}
          style={{
            marginLeft: `${i * 28}px`,
            marginRight: `${(layers.length - 1 - i) * 28}px`,
            animationDelay: `${i * 140}ms`,
          }}
        >
          <div
            className={cn(
              'flex items-center gap-4 rounded-lg border px-5 py-4 backdrop-blur-sm transition-transform',
              layer.emphasis
                ? 'border-brand-amber/50 bg-brand-amber/10 shadow-lg shadow-brand-amber/10 motion-safe:animate-signal-pulse'
                : 'border-white/10 bg-white/[0.03]'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
                layer.emphasis
                  ? 'border-brand-amber/40 bg-brand-amber/15 text-brand-amber'
                  : 'border-white/10 bg-white/5 text-white/60'
              )}
            >
              <layer.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'eyebrow',
                  layer.emphasis ? 'text-brand-amber' : 'text-white/40'
                )}
              >
                {layer.eyebrow}
              </p>
              <p className={cn('font-display text-base font-semibold', layer.emphasis ? 'text-white' : 'text-white/85')}>
                {layer.name}
              </p>
              <p className="truncate text-sm text-white/45">{layer.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
