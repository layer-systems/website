import { cn } from '@/lib/utils';

interface WordmarkProps {
  className?: string;
  /** Renders on a dark surface (hero, footer) instead of the default app surface. */
  inverted?: boolean;
}

/**
 * The LAYER.systems wordmark, set in the display mono face. ".systems" is
 * de-emphasized so "LAYER" reads first — the word the brand is built on.
 */
export function Wordmark({ className, inverted = false }: WordmarkProps) {
  return (
    <span
      className={cn(
        'font-display font-bold tracking-tight',
        inverted ? 'text-white' : 'text-foreground',
        className
      )}
    >
      LAYER
      <span className={inverted ? 'text-white/45' : 'text-muted-foreground'}>.systems</span>
    </span>
  );
}
