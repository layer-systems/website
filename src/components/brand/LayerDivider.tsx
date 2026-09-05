import { cn } from '@/lib/utils';

/**
 * A quiet echo of the layer-stack device used to break up sections —
 * three hairlines of shrinking width, same cascade logic as the hero mark,
 * without repeating it verbatim.
 */
export function LayerDivider({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)} aria-hidden="true">
      <div className="h-px w-16 bg-border" />
      <div className="h-px w-10 bg-border" />
      <div className="h-px w-4 bg-primary" />
    </div>
  );
}
