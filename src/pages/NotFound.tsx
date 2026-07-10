import { useSeoMeta } from "@unhead/react";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Link } from 'react-router-dom';
import { ArrowLeft, Radar } from 'lucide-react';
import { OsShell } from '@/components/navigation/OsShell';

const NotFound = () => {
  const location = useLocation();

  useSeoMeta({
    title: "404 - Page Not Found",
    description: "The page you are looking for could not be found. Return to the home page to continue browsing.",
  });

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <OsShell title="Lost signal" eyebrow="404">
      <div className="grid min-h-[60vh] place-items-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary"><Radar className="h-7 w-7" /></div>
          <p className="font-mono text-xs tracking-[0.22em] text-primary">404 / NO ROUTE</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight">That signal isn’t here.</h2>
          <p className="mt-4 text-muted-foreground">The route may have moved, expired, or never existed in this Nostr OS.</p>
          <Link to="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"><ArrowLeft className="h-4 w-4" /> Return home</Link>
        </div>
      </div>
    </OsShell>
  );
};

export default NotFound;
