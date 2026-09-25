import { useEffect, useState } from 'react';

/** The Settings screen's refresh period for its last-sync lines. */
export const MINUTE = 60_000;

/**
 * A clock that re-renders its caller once a minute, so a relative label like "Last synced N min ago"
 * (calendarConnections.ts:56) stays true while the screen stays open.
 *
 * Its own module so a test can drive the interval without spying on the global `setInterval`, which
 * leaks across a shared test file and breaks React Query's scheduling in every later test.
 */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(timer);
  }, []);
  return now;
}
