import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { getApi } from '../api';
import { beginOAuthSession, LATE_CALLBACK_MS, takeOAuthCallback, waitForOAuthCallback } from './oauthCallbacks';

/**
 * Phase 14 (`SignUpView.create()`, ios/App/RootView.swift:771-796): the check no longer has one message for
 * every failure.
 *
 * - The challenge did not come back (a cancel, a browser that would not open, a callback for another
 *   state or with no token): Swift throws `CancellationError` for all of them and says this (§24 bug 10).
 * - `signup-config` failed: the server's own text, e.g. its new 503 "Account security checks are
 *   temporarily unavailable. Please try again shortly." (`error.localizedDescription`).
 * - The server requires the check but sent no site key: `SECURITY_CHECK_UNAVAILABLE`. Swift shows the
 *   calendar's "Nexdo could not start the calendar connection." there (§24 bug 11); Android does not.
 */
export const SECURITY_CHECK_CANCELLED = 'Security check cancelled. Tap Create Account to try again.';
export const SECURITY_CHECK_UNAVAILABLE = 'Account security checks are temporarily unavailable. Please try again shortly.';

/** The challenge ended without a token: Swift's `CancellationError`. */
export class SignupChallengeCancelled extends Error {
  constructor() {
    super(SECURITY_CHECK_CANCELLED);
    this.name = 'SignupChallengeCancelled';
  }
}

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

/**
 * The callback's parts as `URLComponents` reads them (RootView.swift:570-572): the host as written, and
 * query values percent-decoded with `+` kept as `+`. No WHATWG `URL`, like the other callback parsers
 * (features/moments/device.ts). `null` when the URL cannot be read.
 */
function callbackParts(url: string): { host: string; query: Map<string, string | null> } | null {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)[^?#]*(?:\?([^#]*))?/i.exec(url);
  if (!match) return null;
  const query = new Map<string, string | null>();
  for (const pair of (match[2] ?? '').split('&')) {
    if (pair === '') continue;
    const at = pair.indexOf('=');
    const name = at === -1 ? pair : pair.slice(0, at);
    const raw = at === -1 ? '' : pair.slice(at + 1);
    let value: string | null;
    try {
      value = decodeURIComponent(raw);
    } catch {
      value = null; // A broken escape: `URLQueryItem.value` is nil.
    }
    // `queryItems.first(where:)`: the first item of a name wins.
    if (!query.has(name)) query.set(name, value);
  }
  return { host: match[1], query };
}

/**
 * The token from a challenge callback, or `null` unless it is `signup-challenge` with this `state` and a
 * non-empty token (`SignupChallengeCoordinator.run`, RootView.swift:568-575).
 */
export function challengeToken(callback: string, state: string): string | null {
  const parts = callbackParts(callback);
  const token = parts?.query.get('token') ?? '';
  if (parts?.host !== 'signup-challenge' || parts.query.get('state') !== state || token === '') return null;
  return token;
}

/**
 * The Turnstile token to register with, or `undefined` when the server does not require the check. Throws
 * `SignupChallengeCancelled` when the challenge does not come back, and otherwise the error to show.
 */
export async function signupChallenge(): Promise<string | undefined> {
  // `api.request(..., treatUnauthorizedAsSignedOut: false)` (NexdoApp.swift:187-196): the client's HTTPS
  // origin check, Accept header and default timeout; a 401 here is not a sign-out. Its errors carry the
  // server's text.
  const api = getApi();
  const config = await api.get<SignupConfig>('/api/auth/signup-config', { signedOutOn401: false });
  if (!config.required) return undefined;
  if (!config.siteKey) throw new Error(SECURITY_CHECK_UNAVAILABLE);
  const state = Crypto.randomUUID();
  const end = beginOAuthSession('signup');
  takeOAuthCallback('signup');
  try {
    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      // `prefersEphemeralWebBrowserSession = true` (310f1ab): "This bot check needs no browser login
      // cookies. A private session avoids the system's app/website sign-in sharing consent prompt."
      // iOS only; Android's Custom Tabs have no such prompt.
      result = await WebBrowser.openAuthSessionAsync(signupChallengeUrl(api.baseUrl, state), 'nexdo://signup-challenge', { preferEphemeralSession: true });
    } catch {
      // `session?.start() != true`: a browser that would not open.
      throw new SignupChallengeCancelled();
    }
    // Swift's session ends with the callback or a cancel. Android's polyfill can report `dismiss` before
    // the redirect's deep link lands, so wait the same window as the calendar and Moments email flows.
    // If Android killed the app instead, `+native-intent` lands on Sign Up and the next check discards
    // the stale callback — the user starts again, as on iOS when the session dies with the app.
    const callback = result.type === 'success' ? result.url : await waitForOAuthCallback('signup', LATE_CALLBACK_MS);
    const token = callback ? challengeToken(callback, state) : null;
    if (!token) throw new SignupChallengeCancelled();
    return token;
  } finally { takeOAuthCallback('signup'); end(); }
}
