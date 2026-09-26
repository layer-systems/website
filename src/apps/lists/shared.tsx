import { Bookmark, Hash, List, Lock, Pin, Radio, Smile, Sparkles, Star, Users, VolumeX, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const KIND_ICONS: Record<number, LucideIcon> = {
  30000: Users,
  30002: Radio,
  30003: Bookmark,
  30004: Star,
  30015: Hash,
  30030: Smile,
  39089: Sparkles,
  10000: VolumeX,
  10001: Pin,
  10003: Bookmark,
  10004: Users,
  10006: Radio,
  10007: Radio,
  10015: Hash,
  10030: Smile,
};

export function KindIcon({ kind, className }: { kind: number; className?: string }) {
  const Icon = KIND_ICONS[kind] ?? List;
  return <Icon className={className} aria-hidden />;
}

/** Lock icon plus a text label, so "private" never relies on colour or an icon alone. */
export function PrivateBadge({ className, label = 'Private' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <Lock className="size-3" aria-hidden />
      {label}
    </span>
  );
}
