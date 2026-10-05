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
    const token = callback ? challengeToken(callback, state) : null;
    if (!token) throw new Error('Security check not completed.');
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
