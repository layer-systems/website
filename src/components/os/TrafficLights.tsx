import { Minus, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrafficLightsProps {
  focused: boolean;
  resizable: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}

const BASE =
  'group/light relative size-3 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * The three window controls. Real buttons rather than coloured divs so they
 * are reachable by keyboard and announced by screen readers; the glyphs only
 * appear on hover, as on macOS.
 */
export function TrafficLights({
  focused,
  resizable,
  onClose,
  onMinimize,
  onToggleMaximize,
}: TrafficLightsProps) {
  return (
    <div className="group/lights flex items-center gap-2">
      <button
        type="button"
        aria-label="Close window"
        onClick={onClose}
        className={cn(
          BASE,
          focused
            ? 'border-black/10 bg-[#ff5f57] hover:bg-[#ff4136]'
            : 'border-black/5 bg-muted-foreground/30 hover:bg-[#ff5f57]',
        )}
      >
        <X className="absolute inset-0 m-auto size-2 stroke-[3] text-black/60 opacity-0 transition-opacity group-hover/lights:opacity-100" />
      </button>

      <button
        type="button"
        aria-label="Minimize window"
        onClick={onMinimize}
        className={cn(
          BASE,
          focused
            ? 'border-black/10 bg-[#febc2e] hover:bg-[#f5b016]'
            : 'border-black/5 bg-muted-foreground/30 hover:bg-[#febc2e]',
        )}
      >
        <Minus className="absolute inset-0 m-auto size-2 stroke-[3] text-black/60 opacity-0 transition-opacity group-hover/lights:opacity-100" />
      </button>

      <button
        type="button"
        aria-label="Toggle full size"
        onClick={onToggleMaximize}
        disabled={!resizable}
        className={cn(
          BASE,
          'disabled:cursor-default disabled:opacity-40',
          focused
            ? 'border-black/10 bg-[#28c840] hover:bg-[#17b32e]'
            : 'border-black/5 bg-muted-foreground/30 hover:bg-[#28c840]',
        )}
      >
        <Plus className="absolute inset-0 m-auto size-2 stroke-[3] text-black/60 opacity-0 transition-opacity group-hover/lights:opacity-100" />
      </button>
    </div>
  );
}
