import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { PublishPow } from '@/hooks/useNostrPublish';
import { POW_DEFAULT_DIFFICULTY, POW_MAX_DIFFICULTY, POW_MIN_DIFFICULTY } from '@/lib/pow';

const POW_SETTINGS_KEY = 'layer-os:pow-settings';

export interface PowSettings {
  enabled: boolean;
  difficulty: number;
}

export interface PowProgress {
  hashes: number;
  elapsedMs: number;
}

function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return POW_DEFAULT_DIFFICULTY;
  return Math.min(POW_MAX_DIFFICULTY, Math.max(POW_MIN_DIFFICULTY, Math.round(value)));
}

/**
 * Remembered NIP-13 settings plus the state of an in-flight mine. `begin()`
 * returns the `pow` option for `useNostrPublish` (or `undefined` when PoW is
 * off); `cancel()` aborts the worker, and unmounting cancels too.
 */
export function usePowMining() {
  const [stored, setStored] = useLocalStorage<PowSettings>(POW_SETTINGS_KEY, {
    enabled: false,
    difficulty: POW_DEFAULT_DIFFICULTY,
  });
  const settings: PowSettings = {
    enabled: Boolean(stored?.enabled),
    difficulty: clampDifficulty(stored?.difficulty ?? POW_DEFAULT_DIFFICULTY),
  };
  const [progress, setProgress] = useState<PowProgress | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const setSettings = useCallback(
    (next: Partial<PowSettings>) => {
      setStored((prev) => ({
        enabled: next.enabled ?? Boolean(prev?.enabled),
        difficulty: clampDifficulty(next.difficulty ?? prev?.difficulty ?? POW_DEFAULT_DIFFICULTY),
      }));
    },
    [setStored],
  );

  const begin = (): PublishPow | undefined => {
    if (!settings.enabled) return undefined;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const startedAt = performance.now();
    setProgress({ hashes: 0, elapsedMs: 0 });
    return {
      difficulty: settings.difficulty,
      signal: current.signal,
      onProgress: (hashes) => {
        if (controller.current === current) {
          setProgress({ hashes, elapsedMs: performance.now() - startedAt });
        }
      },
    };
  };

  const end = useCallback(() => {
    controller.current = null;
    setProgress(null);
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    end();
  }, [end]);

  return { settings, setSettings, progress, begin, end, cancel };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
