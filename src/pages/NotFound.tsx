import { useSeoMeta } from "@unhead/react";
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/Wordmark";

const NotFound = () => {
  const location = useLocation();

  useSeoMeta({
    title: "404 — LAYER.systems",
    description: "This page doesn't exist. Return to the home page to keep browsing.",
  });

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <p className="eyebrow text-primary">No signal</p>
        <p className="mt-3 font-display text-6xl font-bold tracking-tight">404</p>
        <p className="mt-3 text-muted-foreground">
          There's no layer at <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{location.pathname}</code>.
        </p>
        <div className="mt-8 flex flex-col items-center gap-6">
          <Button asChild>
            <Link to="/">Back to LAYER.systems</Link>
          </Button>
          <Wordmark className="text-sm opacity-60" />
        </div>
      </div>
    </div>
  );
};

export default NotFound;
