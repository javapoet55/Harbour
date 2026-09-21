import { redirectOAuthCallback } from '../src/lib/oauthCallbacks';

/**
 * Every deep link passes through here before Expo Router resolves it. The OAuth callbacks
 * (`nexdo://calendar-connected`, `nexdo://moments-email`) are not screens: they are handed to the
 * sign-in session that is waiting for them, or land on the screen that flow belongs to. See
 * src/lib/oauthCallbacks.ts. Returning `null` tells the router not to navigate.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  return redirectOAuthCallback(path);
}
