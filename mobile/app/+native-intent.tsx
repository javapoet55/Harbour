import { isTestReminderPath, scheduleTestReminder } from '../src/lib/debugReminder';
import { redirectOAuthCallback } from '../src/lib/oauthCallbacks';

/**
 * Every deep link passes through here before Expo Router resolves it. The OAuth callbacks
 * (`nexdo://calendar-connected`, `nexdo://moments-email`) are not screens: they are handed to the
 * sign-in session that is waiting for them, or land on the screen that flow belongs to. See
 * src/lib/oauthCallbacks.ts. Returning `null` tells the router not to navigate.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  // Development only: `nexdo://debug/test-reminder` schedules a local notification 60 s ahead and stays
  // on the current screen (src/lib/debugReminder.ts). Release builds treat it as an unknown link.
  if (__DEV__ && isTestReminderPath(path)) {
    void scheduleTestReminder().catch((error: unknown) => console.log(`[reminders] test reminder failed: ${error instanceof Error ? error.message : String(error)}`));
    return null;
  }
  return redirectOAuthCallback(path);
}
