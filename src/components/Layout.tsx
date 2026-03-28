import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginArea } from '@/components/auth/LoginArea';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Explore', href: '/explore' },
  { label: 'Dashboard', href: '/dashboard' },
];

interface LayoutProps {
  children: React.ReactNode;
  /** Hide the default footer (e.g. for full-bleed pages) */
  hideFooter?: boolean;
}

export function Layout({ children, hideFooter }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 font-serif text-lg font-bold tracking-tight transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-4 w-4" />
            </div>
            <span>LAYER<span className="text-primary">.systems</span></span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => {
              const active = location.pathname === link.href ||
                (link.href !== '/' && location.pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`
                    rounded-md px-3 py-1.5 text-sm font-medium transition-colors
                    ${active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    }
                  `}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side: login + mobile burger */}
          <div className="flex items-center gap-3">
            <LoginArea className="hidden sm:inline-flex max-w-48" />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile nav panel */}
        {mobileOpen && (
          <div className="border-t bg-background px-4 pb-4 pt-2 md:hidden animate-fade-in">
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => {
                const active = location.pathname === link.href ||
                  (link.href !== '/' && location.pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      rounded-md px-3 py-2 text-sm font-medium transition-colors
                      ${active
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                      }
                    `}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 pt-3 border-t">
              <LoginArea className="w-full" />
            </div>
          </div>
        )}
      </header>

      {/* ─── Main content ─── */}
      <main className="flex-1">
        {children}
      </main>

      {/* ─── Footer ─── */}
      {!hideFooter && (
        <footer className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
                  <Layers className="h-3 w-3 text-primary" />
                </div>
                <span>&copy; {new Date().getFullYear()} LAYER.systems</span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <Link
                  to="/explore"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Explore
                </Link>
                <Link
                  to="/terms"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Terms
                </Link>
                <Link
                  to="/privacy"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Privacy
                </Link>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
