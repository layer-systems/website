import { useId } from 'react';
import { Loader2, Pickaxe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { PowProgress, PowSettings } from '@/hooks/usePowMining';
import { expectedHashes, POW_MAX_DIFFICULTY, POW_MIN_DIFFICULTY } from '@/lib/pow';
import { cn } from '@/lib/utils';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

interface PowControlProps {
  settings: PowSettings;
  onChange: (next: Partial<PowSettings>) => void;
  disabled?: boolean;
  className?: string;
}

/** Toggle and difficulty picker for NIP-13 proof of work on a new note. */
export function PowControl({ settings, onChange, disabled, className }: PowControlProps) {
  const switchId = useId();
  const sliderId = useId();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            'h-7 gap-1.5 px-2 text-xs',
            settings.enabled ? 'text-foreground' : 'text-muted-foreground',
            className,
          )}
          aria-label={
            settings.enabled
              ? `Proof of work on, ${settings.difficulty} bits. Change proof-of-work settings`
              : 'Proof of work off. Change proof-of-work settings'
          }
        >
          <Pickaxe className="size-3.5" aria-hidden />
          {settings.enabled ? `PoW ${settings.difficulty}` : 'PoW off'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor={switchId} className="text-sm">Proof of work</Label>
            <p className="text-xs text-muted-foreground">
              Mine the note (NIP-13) before signing. Some relays require it.
            </p>
          </div>
          <Switch
            id={switchId}
            checked={settings.enabled}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
        </div>

        <div className={cn('space-y-2', !settings.enabled && 'opacity-60')}>
          <div className="flex items-center justify-between">
            <Label id={sliderId} className="text-sm">Difficulty</Label>
            <span className="text-sm tabular-nums">{settings.difficulty} bits</span>
          </div>
          <Slider
            aria-labelledby={sliderId}
            min={POW_MIN_DIFFICULTY}
            max={POW_MAX_DIFFICULTY}
            step={1}
            value={[settings.difficulty]}
            onValueChange={([difficulty]) => onChange({ difficulty })}
            disabled={!settings.enabled}
          />
          <p className="text-xs text-muted-foreground">
            About {compact.format(expectedHashes(settings.difficulty))} hashes on average. Higher
            values can take minutes.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Live status of an in-flight mine, with a Cancel button. */
export function PowStatus({ progress, onCancel }: { progress: PowProgress; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      {/* Announce once; the counter ticks too fast to be read out. */}
      <span role="status" className="sr-only">Mining proof of work</span>
      <span aria-hidden className="tabular-nums">
        Mining… {compact.format(progress.hashes)} hashes · {(progress.elapsedMs / 1000).toFixed(1)}s
      </span>
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
