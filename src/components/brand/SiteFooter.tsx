import { Link } from 'react-router-dom';
import { Wordmark } from '@/components/brand/Wordmark';

const links = [
  { to: '/styleguide', label: 'Styleguide' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Wordmark className="text-sm" />
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-signal-pulse" />
            relay online
          </span>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
