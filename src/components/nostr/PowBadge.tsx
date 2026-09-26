import { Pickaxe } from 'lucide-react';
import { eventPow, POW_DISPLAY_THRESHOLD } from '@/lib/pow';
import { cn } from '@/lib/utils';

/** Small "⛏ 21" marker for notes mined with NIP-13 proof of work. */
export function PowBadge({ event, className }: { event: { id: string; tags: string[][] }; className?: string }) {
  const pow = eventPow(event);
  if (pow < POW_DISPLAY_THRESHOLD) return null;

  return (
    <span
      title={`Proof of work: ${pow} bits`}
      className={cn('inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground', className)}
    >
      <Pickaxe className="size-3" aria-hidden />
      <span aria-hidden>{pow}</span>
      <span className="sr-only">Proof of work: {pow} bits</span>
    </span>
  );
}
