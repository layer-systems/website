import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useSearchParams } from 'react-router-dom';
import { MenuBar } from './MenuBar';
import { Desktop } from './Desktop';
import { CommandPalette } from './CommandPalette';
import { MobileAppShell } from './MobileAppShell';
import { useWindowManager } from '@/os/useWindowManager';
import { useOsKeyboard } from '@/os/useOsKeyboard';
import { getApp } from '@/os/registry';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { AppParams } from '@/os/types';

interface OsShellProps {
  /** App to open on first render, e.g. resolved from a NIP-19 deep link. */
  boot?: { appId: string; params?: AppParams };
  /**
   * Mirror the focused window into `?app=…` so the URL can be copied and
   * reloaded. Disabled on routes that already are a deep link.
   */
  syncUrl?: boolean;
}

const RESERVED_PARAMS = new Set(['app']);

export function OsShell({ boot, syncUrl = false }: OsShellProps) {
  const { openApp, windows, focusedId } = useWindowManager();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMobile = useIsMobile();

  const openSettings = useCallback(() => openApp('settings'), [openApp]);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useOsKeyboard({ onCommandPalette: openPalette, onSettings: openSettings });

  // Boot only once: later renders must not reopen a window the user closed.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    if (boot) {
      openApp(boot.appId, boot.params);
      return;
    }

    const appId = searchParams.get('app');
    if (!appId || !getApp(appId)) return;

    const params: AppParams = {};
    for (const [key, value] of searchParams.entries()) {
      if (!RESERVED_PARAMS.has(key)) params[key] = value;
    }
    openApp(appId, params);
  }, [boot, openApp, searchParams]);

  const focused = useMemo(
    () => windows.find((win) => win.id === focusedId),
    [windows, focusedId],
  );

  // Keep the query string in step with the focused window, without pushing a
  // history entry for every click.
  useEffect(() => {
    if (!syncUrl || !booted.current) return;

    const next = new URLSearchParams();
    if (focused) {
      next.set('app', focused.appId);
      for (const [key, value] of Object.entries(focused.params)) {
        next.set(key, value);
      }
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [focused, searchParams, setSearchParams, syncUrl]);

  const app = focused ? getApp(focused.appId) : undefined;

  useSeoMeta({
    title: focused ? `${focused.title} — LAYER.systems` : 'LAYER.systems',
    description:
      app?.description ??
      'A desktop-style Nostr client: every app is a window you can move, resize and stack.',
  });

  if (isMobile) {
    return <MobileAppShell />;
  }

  return (
    <div className="h-full overflow-hidden">
      <MenuBar onOpenCommandPalette={openPalette} />
      <Desktop />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
