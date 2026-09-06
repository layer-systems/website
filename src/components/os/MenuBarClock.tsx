import { useEffect, useState } from 'react';

function format(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Ticks on the minute boundary rather than every second, to avoid pointless renders. */
export function MenuBarClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute + 50);
    };

    schedule();
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className="hidden tabular-nums sm:inline" aria-label={`Current time: ${format(now)}`}>
      {format(now)}
    </span>
  );
}
