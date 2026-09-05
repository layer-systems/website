import { ChevronLeft } from 'lucide-react';
import { useWindowManager } from '../window-manager/useWindowManager';
import { findAppById } from '../apps/registry';

interface MobileAppViewProps {
  appId: string;
}

export function MobileAppView({ appId }: MobileAppViewProps) {
  const { minimizeApp } = useWindowManager();
  const app = findAppById(appId);
  if (!app) return null;
  const Icon = app.icon;
  const Component = app.Component;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <button
          type="button"
          onClick={() => minimizeApp(appId)}
          className="flex items-center gap-1 rounded px-2 py-1 text-sm text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Back to home screen"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Home
        </button>
        <div className="flex flex-1 items-center justify-center gap-1.5 pr-14 text-sm font-medium">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {app.title}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Component />
      </div>
    </div>
  );
}
