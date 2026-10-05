import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { getApi } from '../api';
import { beginOAuthSession, takeOAuthCallback, waitForOAuthCallback } from './oauthCallbacks';

/**
 * The one message `SignUpView.create()` shows for ANY failure of the security check — the config
 * request, a missing site key, a browser that will not open, a cancel, a mismatched callback
 * (ios/App/RootView.swift:687-693).
 */
export const SECURITY_CHECK_MESSAGE = 'Please complete the security check and try again.';

/** `Config` (NexdoApp.swift:175). */
type SignupConfig = { required: boolean; siteKey?: string };

/**
 * `signupChallengeURL(state:)` (NexdoApp.swift:178-181): the API origin with its path SET to
 * `/signup-challenge` and `state` as a query item. `baseUrl` is the client's validated, normalised
 * origin, so a trailing slash or stray path in the configured URL cannot change it.
 */
export function signupChallengeUrl(baseUrl: string, state: string): string {
  return `${baseUrl}/signup-challenge?state=${encodeURIComponent(state)}`;
}

async function run(): Promise<string | undefined> {
  // `api.request(..., treatUnauthorizedAsSignedOut: false)` (NexdoApp.swift:176): the client's HTTPS
  // origin check, Accept header and default timeout; a 401 here is not a sign-out.
  const api = getApi();
  const config = await api.get<SignupConfig>('/api/auth/signup-config', { signedOutOn401: false });
  if (!config.required) return undefined;
  if (!config.siteKey) throw new Error('Security check unavailable.');
  const state = Crypto.randomUUID();
  const end = beginOAuthSession('signup');
  takeOAuthCallback('signup');
  try {
    const result = await WebBrowser.openAuthSessionAsync(signupChallengeUrl(api.baseUrl, state), 'nexdo://signup-challenge');
    const callback = result.type === 'success' ? result.url : await waitForOAuthCallback('signup', 500);
    const url = callback ? new URL(callback) : null;
    const token = url?.searchParams.get('token');
    if (url?.hostname !== 'signup-challenge' || url.searchParams.get('state') !== state || !token) throw new Error('Security check not completed.');
    return token;
  } finally { takeOAuthCallback('signup'); end(); }
}

/** The Turnstile token to register with, or `undefined` when the server does not require the check. */
export async function signupChallenge(): Promise<string | undefined> {
  try {
    return await run();
  } catch {
    throw new Error(SECURITY_CHECK_MESSAGE);
  }
}
