import { Link } from 'react-router-dom';
import { LoginArea } from '@/components/auth/LoginArea';
import { Wordmark } from '@/components/brand/Wordmark';
import { cn } from '@/lib/utils';

interface SiteHeaderProps {
  /** Transparent, for placement over a dark hero. */
  transparent?: boolean;
  className?: string;
}

export function SiteHeader({ transparent = false, className }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        transparent
          ? 'absolute top-0 left-0 right-0 z-50'
          : 'sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70',
        className
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="transition-opacity hover:opacity-80">
          <Wordmark inverted={transparent} className="text-lg" />
        </Link>
        <LoginArea className="max-w-60" />
      </div>
    </header>
  );
}
