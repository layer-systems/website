import { useCallback, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  APP_SELECTION_STORAGE_KEY,
  EMPTY_APP_SELECTION,
  deserializeAppSelection,
  isAppEnabled,
  serializeAppSelection,
  withAppEnabled,
} from './appSelection';
import { APPS } from './registry';
import type { AppDefinition } from './types';

const SERIALIZER = {
  serialize: serializeAppSelection,
  deserialize: deserializeAppSelection,
};

/**
 * Which apps the user has switched on in the App Store.
 *
 * This only decides what is *offered* — the desktop, the home screen, the Go
 * menu and the command palette. It deliberately does not stop `openApp`:
 * notes, profiles and shared links open apps on the user's behalf, and a link
 * that silently does nothing would be worse than a window from an app that
 * has not been added to the launcher.
 */
export function useEnabledApps() {
  const [selection, setSelection] = useLocalStorage(
    APP_SELECTION_STORAGE_KEY,
    EMPTY_APP_SELECTION,
    SERIALIZER,
  );

  const apps = useMemo(() => APPS.filter((app) => isAppEnabled(app, selection)), [selection]);
  const desktopApps = useMemo(() => apps.filter((app) => app.showOnDesktop !== false), [apps]);

  const isEnabled = useCallback(
    (app: AppDefinition) => isAppEnabled(app, selection),
    [selection],
  );

  const setEnabled = useCallback(
    (app: AppDefinition, enabled: boolean) =>
      setSelection((current) => withAppEnabled(current, app, enabled)),
    [setSelection],
  );

  const reset = useCallback(() => setSelection(EMPTY_APP_SELECTION), [setSelection]);

  return { apps, desktopApps, isEnabled, setEnabled, reset, customized: selection.enabled.length + selection.disabled.length > 0 };
}
