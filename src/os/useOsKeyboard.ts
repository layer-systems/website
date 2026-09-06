import { useEffect } from 'react';
import { useWindowManager } from './useWindowManager';

/** Typing inside a field must never trigger a window shortcut. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

interface Options {
  onCommandPalette: () => void;
  onSettings: () => void;
}

/** System-wide shortcuts. Cmd on Apple platforms, Ctrl everywhere else. */
export function useOsKeyboard({ onCommandPalette, onSettings }: Options) {
  const { focusedId, closeWindow, minimizeWindow, focusNext } = useWindowManager();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      switch (event.key.toLowerCase()) {
        case 'k':
          event.preventDefault();
          onCommandPalette();
          return;
        case ',':
          event.preventDefault();
          onSettings();
          return;
        case '`':
          event.preventDefault();
          focusNext();
          return;
        case 'w':
          if (!focusedId || isTextEntry(event.target)) return;
          event.preventDefault();
          closeWindow(focusedId);
          return;
        case 'm':
          if (!focusedId || isTextEntry(event.target)) return;
          event.preventDefault();
          minimizeWindow(focusedId);
          return;
        default:
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeWindow, focusNext, focusedId, minimizeWindow, onCommandPalette, onSettings]);
}
