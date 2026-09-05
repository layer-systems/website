import { useWindowManager } from '../window-manager/useWindowManager';
import { APPS, defaultBoundsFor } from '../apps/registry';

export function MobileHome() {
  const { windows, openApp, focusApp } = useWindowManager();

  const handleOpen = (index: number) => {
    const app = APPS[index];
    if (windows[app.id]) {
      focusApp(app.id);
    } else {
      openApp(app.id, defaultBoundsFor(app, Object.keys(windows).length));
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-6">
      <h1 className="mb-6 text-sm font-medium text-muted-foreground">Tap an app to open it</h1>
      <div className="grid grid-cols-3 gap-x-6 gap-y-8">
        {APPS.map((app, index) => {
          const Icon = app.icon;
          const isOpen = !!windows[app.id];
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => handleOpen(index)}
              className="flex flex-col items-center gap-2 focus-visible:outline-none"
              aria-label={isOpen ? `Resume ${app.title}` : `Open ${app.title}`}
            >
              <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-card shadow-md">
                <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
                {isOpen && (
                  <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                )}
              </span>
              <span className="text-xs text-foreground">{app.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
