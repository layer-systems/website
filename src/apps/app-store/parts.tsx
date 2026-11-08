import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppDefinition } from '@/os/types';
import { categoryLabel, tileGradient } from './catalog';

const ICON_SIZES = {
  sm: { tile: 'size-12', glyph: 'size-6' },
  md: { tile: 'size-14', glyph: 'size-7' },
  lg: { tile: 'size-24 @xl:size-28', glyph: 'size-12 @xl:size-14' },
} as const;

export function AppIcon({
  app,
  size = 'md',
  className,
}: {
  app: AppDefinition;
  size?: keyof typeof ICON_SIZES;
  className?: string;
}) {
  const { tile, glyph } = ICON_SIZES[size];
  return (
    <span
      className={cn(
        'relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-[24%] bg-linear-to-br text-white shadow-sm ring-1 ring-black/5',
        tileGradient(app),
        tile,
        className,
      )}
      aria-hidden
    >
      {/* A soft top-left sheen gives the tile some depth without an image. */}
      <span className="absolute inset-0 -z-10 bg-linear-to-b from-white/25 to-transparent" />
      <app.icon className={cn(glyph, 'drop-shadow-sm')} strokeWidth={2} />
    </span>
  );
}

/** The rounded "GET" / "OPEN" pill every store row ends with. */
export function StorePill({
  children,
  onClick,
  label,
  variant = 'soft',
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  variant?: 'soft' | 'solid';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'inline-flex h-8 min-w-[4.5rem] shrink-0 items-center justify-center rounded-full px-4 text-xs font-bold uppercase tracking-wide transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 motion-safe:transition-transform',
        variant === 'solid'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'bg-accent text-accent-foreground hover:bg-accent/70',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** One app on a store shelf: icon, name, one-line pitch and a pill. */
export function StoreRow({
  app,
  installed,
  onSelect,
  action,
}: {
  app: AppDefinition;
  installed: boolean;
  onSelect: () => void;
  action: ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={onSelect}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <AppIcon app={app} className="motion-safe:transition-transform group-hover:scale-[1.03]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold leading-tight group-hover:underline group-hover:underline-offset-2">
            {app.title}
          </span>
          <span className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
            {app.description}
          </span>
          {installed && app.locked && (
            <span className="mt-0.5 block text-xs font-medium text-muted-foreground">Always on</span>
          )}
        </span>
      </button>
      {action}
    </li>
  );
}

export function SectionHeader({
  id,
  title,
  subtitle,
  aside,
}: {
  id: string;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-t border-border pt-4">
      <div className="min-w-0">
        <h2 id={id} className="text-xl font-bold tracking-tight">
          {title}
        </h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}

/**
 * Horizontal shelf that swipes on touch and gets arrow buttons on wider
 * windows, where a hidden scrollbar would otherwise leave a mouse stranded.
 */
export function Carousel({
  label,
  children,
  header,
}: {
  label: string;
  children: ReactNode;
  header: (controls: ReactNode) => ReactNode;
}) {
  const track = useRef<HTMLUListElement>(null);

  const scroll = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: reduce ? 'auto' : 'smooth' });
  };

  const controls = (
    <div className="hidden shrink-0 gap-1 @xl:flex">
      <CarouselButton label={`Scroll ${label} back`} onClick={() => scroll(-1)}>
        <ChevronLeft className="size-4" aria-hidden />
      </CarouselButton>
      <CarouselButton label={`Scroll ${label} forward`} onClick={() => scroll(1)}>
        <ChevronRight className="size-4" aria-hidden />
      </CarouselButton>
    </div>
  );

  return (
    <>
      {header(controls)}
      <ul
        ref={track}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] @xl:-mx-6 @xl:scroll-px-6 @xl:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </>
  );
}

function CarouselButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}

/** Large editorial card for the "Featured" shelf. */
export function FeatureCard({
  app,
  eyebrow,
  onSelect,
  action,
}: {
  app: AppDefinition;
  eyebrow: string;
  onSelect: () => void;
  action: ReactNode;
}) {
  return (
    <li className="w-[85%] shrink-0 snap-start @xl:w-[calc(50%-0.5rem)] @4xl:w-[calc((100%-2rem)/3)]">
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm motion-safe:transition-shadow hover:shadow-md">
        <button
          type="button"
          onClick={onSelect}
          aria-label={`About ${app.title}`}
          className={cn(
            'relative isolate flex h-36 items-center overflow-hidden bg-linear-to-br px-5 text-left focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white',
            tileGradient(app),
          )}
        >
          <span className="absolute -right-6 -bottom-10 -z-10 text-white/15" aria-hidden>
            <app.icon className="size-44 -rotate-12" strokeWidth={1.5} />
          </span>
          <span className="absolute -top-16 -left-10 -z-10 size-48 rounded-full bg-white/15 blur-2xl" aria-hidden />
          <AppIcon app={app} size="md" className="ring-white/40 shadow-lg" />
        </button>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
            <h3 className="mt-0.5 text-lg font-bold leading-tight">{app.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{app.description}</p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{categoryLabel(app.category)}</span>
            {action}
          </div>
        </div>
      </article>
    </li>
  );
}
