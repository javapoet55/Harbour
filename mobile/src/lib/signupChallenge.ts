import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { getApiUrl } from '../config';
import { beginOAuthSession, takeOAuthCallback, waitForOAuthCallback } from './oauthCallbacks';

/**
 * The one message `SignUpView.create()` shows for ANY failure of the security check — the config
 * request, a missing site key, a browser that will not open, a cancel, a mismatched callback
 * (ios/App/RootView.swift:687-693).
 */
export const SECURITY_CHECK_MESSAGE = 'Please complete the security check and try again.';

async function run(): Promise<string | undefined> {
  const response = await fetch(`${getApiUrl()}/api/auth/signup-config`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Security check unavailable.');
  const config = await response.json();
  if (!config.required) return undefined;
  if (!config.siteKey) throw new Error('Security check unavailable.');
  const state = Crypto.randomUUID();
  const end = beginOAuthSession('signup');
  takeOAuthCallback('signup');
  try {
    const result = await WebBrowser.openAuthSessionAsync(`${getApiUrl()}/signup-challenge?state=${state}`, 'nexdo://signup-challenge');
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
