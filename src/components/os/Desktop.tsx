import { useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { DesktopIcon } from './DesktopIcon';
import { WindowLayer } from './WindowLayer';
import { useWindowManager } from '@/os/useWindowManager';
import { desktopApps } from '@/os/registry';
import { MENUBAR_HEIGHT } from '@/os/layout';

/**
 * The desktop surface: dot-grid wallpaper, the app icons, and the layer the
 * windows are positioned inside. Window coordinates are relative to this box,
 * which is why it sits below the menu bar rather than at the viewport origin.
 */
export function Desktop() {
  const { openApp, windows, minimizeAll, closeAll } = useWindowManager();
  const [selected, setSelected] = useState<string | null>(null);
  const apps = desktopApps();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <main
          className="os-desktop-surface absolute inset-x-0 bottom-0 overflow-hidden"
          style={{ top: MENUBAR_HEIGHT }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <div
            className="grid grid-flow-col content-start gap-1 p-3"
            style={{ gridTemplateRows: 'repeat(auto-fill, minmax(84px, max-content))', maxHeight: '100%' }}
          >
            {apps.map((app) => (
              <DesktopIcon
                key={app.id}
                app={app}
                selected={selected === app.id}
                onSelect={() => setSelected(app.id)}
                onOpen={() => openApp(app.id)}
              />
            ))}
          </div>

          <WindowLayer />
        </main>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => openApp('feed')}>Open Feed</ContextMenuItem>
        <ContextMenuItem onSelect={() => openApp('settings')}>Open Settings</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={windows.length === 0} onSelect={minimizeAll}>
          Minimize all windows
        </ContextMenuItem>
        <ContextMenuItem disabled={windows.length === 0} onSelect={closeAll}>
          Close all windows
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
