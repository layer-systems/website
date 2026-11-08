import { useEffect, useState } from 'react';

/**
 * The current Unix time in seconds, re-read on an interval so time-based UI
 * (a poll closing, "in 3 minutes") updates without a reload.
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
