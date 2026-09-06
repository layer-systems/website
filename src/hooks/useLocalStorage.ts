import { useCallback, useEffect, useState } from 'react';

/**
 * Fired on `window` whenever `useLocalStorage` writes a key, so every
 * component sharing that key *within this document* stays in sync — the
 * native `storage` event only fires in *other* tabs/documents, never the
 * one that made the write. Without this, e.g. two "New Note" draft windows
 * open at once would silently diverge: each holds its own React state, both
 * write to the same localStorage entry, and neither sees the other's edits.
 */
const LOCAL_STORAGE_EVENT = 'app:local-storage';

interface LocalStorageEventDetail {
  key: string;
  value: string;
}

/**
 * Generic hook for managing localStorage state
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  serializer?: {
    serialize: (value: T) => string;
    deserialize: (value: string) => T;
  }
) {
  const serialize = serializer?.serialize || JSON.stringify;
  const deserialize = serializer?.deserialize || JSON.parse;

  const readValue = () => {
    try {
      const item = localStorage.getItem(key);
      return item ? deserialize(item) : defaultValue;
    } catch (error) {
      console.warn(`Failed to load ${key} from localStorage:`, error);
      return defaultValue;
    }
  };

  const [state, setState] = useState<T>(readValue);
  const [storageKey, setStorageKey] = useState(key);
  if (storageKey !== key) {
    setStorageKey(key);
    setState(readValue());
  }

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        try {
          const valueToStore = value instanceof Function ? value(prev) : value;
          const serialized = serialize(valueToStore);
          localStorage.setItem(key, serialized);
          window.dispatchEvent(
            new CustomEvent<LocalStorageEventDetail>(LOCAL_STORAGE_EVENT, {
              detail: { key, value: serialized },
            }),
          );
          return valueToStore;
        } catch (error) {
          console.warn(`Failed to save ${key} to localStorage:`, error);
          return prev;
        }
      });
    },
    [key, serialize],
  );

  // Sync with localStorage changes from other tabs, and from other
  // components sharing this key in this tab (see LOCAL_STORAGE_EVENT above).
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setState(deserialize(e.newValue));
        } catch (error) {
          console.warn(`Failed to sync ${key} from localStorage:`, error);
        }
      }
    };
    const handleLocalChange = (e: Event) => {
      const detail = (e as CustomEvent<LocalStorageEventDetail>).detail;
      if (detail?.key !== key) return;
      try {
        setState(deserialize(detail.value));
      } catch (error) {
        console.warn(`Failed to sync ${key} from localStorage:`, error);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(LOCAL_STORAGE_EVENT, handleLocalChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(LOCAL_STORAGE_EVENT, handleLocalChange);
    };
  }, [key, deserialize]);

  return [state, setValue] as const;
}
