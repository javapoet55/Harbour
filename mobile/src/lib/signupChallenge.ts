import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { getApiUrl } from '../config';
import { beginOAuthSession, takeOAuthCallback, waitForOAuthCallback } from './oauthCallbacks';

export async function signupChallenge(): Promise<string | undefined> {
  const response = await fetch(`${getApiUrl()}/api/auth/signup-config`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Security check unavailable. Please try again.');
  const config = await response.json();
  if (!config.required) return undefined;
  if (!config.siteKey) throw new Error('Security check unavailable. Please try again.');
  const state = Crypto.randomUUID();
  const end = beginOAuthSession('signup');
  takeOAuthCallback('signup');
  try {
    const result = await WebBrowser.openAuthSessionAsync(`${getApiUrl()}/signup-challenge?state=${state}`, 'nexdo://signup-challenge');
    const callback = result.type === 'success' ? result.url : await waitForOAuthCallback('signup', 500);
    const url = callback ? new URL(callback) : null;
    const token = url?.searchParams.get('token');
    if (url?.hostname !== 'signup-challenge' || url.searchParams.get('state') !== state || !token) throw new Error('Please complete the security check and try again.');
    return token;
  } finally { takeOAuthCallback('signup'); end(); }
}
