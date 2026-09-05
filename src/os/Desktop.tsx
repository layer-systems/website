import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { WindowManagerProvider } from './window-manager/WindowManagerContext';
import { useWindowManager } from './window-manager/useWindowManager';
import { Window, MENU_BAR_HEIGHT } from './window-manager/Window';
import { Wallpaper } from './shell/Wallpaper';
import { MenuBar } from './shell/MenuBar';
import { Dock } from './shell/Dock';
import { LockScreen } from './shell/LockScreen';
import { MobileHome } from './shell/MobileHome';
import { MobileAppView } from './shell/MobileAppView';
import { findAppById, findAppByPath, defaultBoundsFor } from './apps/registry';

const GUEST_MODE_KEY = 'nostr:os-guest-mode';

function DeepLinkHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const { windows, openApp } = useWindowManager();

  useEffect(() => {
    const subPath = location.pathname.replace(/^\/os\/?/, '');
    if (!subPath) return;
    const app = findAppByPath(subPath);
    if (app) {
      if (!windows[app.id]) {
        openApp(app.id, defaultBoundsFor(app, Object.keys(windows).length));
      }
      navigate('/os', { replace: true });
    }
    // Intentionally only reacts to the initial pathname for this deep link;
    // once handled we normalize the URL back to /os.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return null;
}

function KeyboardShortcuts() {
  const { cycleFocus } = useWindowManager();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Cmd/Ctrl+` cycles focus between open windows, mirroring macOS's
      // "cycle through windows of the front app" shortcut (Cmd+Tab is
      // reserved by the OS/browser, so backtick is used instead).
      if ((event.metaKey || event.ctrlKey) && event.key === '`') {
        event.preventDefault();
        cycleFocus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleFocus]);

  return null;
}

function DesktopWindows() {
  const { windows, zOrder } = useWindowManager();

  return (
    <div className="fixed inset-0 z-10">
      {zOrder.map((appId) => {
        const app = findAppById(appId);
        const win = windows[appId];
        if (!app || !win) return null;
        const Component = app.Component;
        return (
          <Window key={appId} appId={appId} title={app.title} icon={app.icon}>
            <Component />
          </Window>
        );
      })}
    </div>
  );
}

function MobileDesktop() {
  const { windows, zOrder } = useWindowManager();
  const activeAppId = [...zOrder].reverse().find((id) => windows[id] && !windows[id].minimized);

  return (
    <div className="fixed inset-0 flex flex-col">
      <MenuBar />
      <div className="min-h-0 flex-1 overflow-hidden" style={{ marginTop: MENU_BAR_HEIGHT }}>
        {activeAppId ? <MobileAppView appId={activeAppId} /> : <MobileHome />}
      </div>
      <Dock compact />
    </div>
  );
}

function DesktopShell() {
  const isMobile = useIsMobile();
  const { currentUser } = useLoggedInAccounts();
  const [guestMode, setGuestMode] = useLocalStorage(GUEST_MODE_KEY, false);
  const locked = !currentUser && !guestMode;

  return (
    <>
      <Wallpaper />
      <DeepLinkHandler />
      <KeyboardShortcuts />
      {isMobile ? (
        <MobileDesktop />
      ) : (
        <>
          <MenuBar />
          <DesktopWindows />
          <Dock />
        </>
      )}
      {locked && <LockScreen onContinueAsGuest={() => setGuestMode(true)} />}
    </>
  );
}

export function Desktop() {
  useSeoMeta({
    title: 'LAYER.systems — Desktop',
    description: 'Your Nostr relay desktop: Explore, Stats, Finder, Export and Messages, all in one windowed workspace.',
  });

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none">
      <WindowManagerProvider>
        <DesktopShell />
      </WindowManagerProvider>
    </div>
  );
}

export default Desktop;
