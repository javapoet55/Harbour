import { getApiUrl } from '../config';
import { createApiClient, type ApiClient } from './client';
import type {
  AppleAuthResponse,
  CodeDeliveryResponse,
  LoginResponse,
  PasswordResetResponse,
  ProfileResponse,
  RegistrationResponse,
  TasksResponse,
} from './types';

export * from './client';
export type * from './types';

let instance: ApiClient | undefined;
let signedOutHandler: (() => void) | undefined;

/**
 * Register the app-wide reaction to a 401 from any request. `app/_layout.tsx` sets it once, so a
 * session that ends mid-session signs the app out wherever the request came from.
 */
export function onSignedOut(handler: () => void): void {
  signedOutHandler = handler;
}

/** The app-wide client for the configured API origin, created on first use. */
export function getApi(): ApiClient {
  instance ??= createApiClient({ baseUrl: getApiUrl(), onSignedOut: () => signedOutHandler?.() });
  return instance;
}

/** Test seam: drop the memoised client so the next getApi() rebuilds it. */
export function resetApi(): void {
  instance = undefined;
  signedOutHandler = undefined;
}

/**
 * The auth endpoints, matching `AppModel` (ios/App/NexdoApp.swift:156–216). Every one of them passes
 * `signedOutOn401: false`: on these routes a 401 means the credentials were wrong, not that a session
 * expired, so it must not trigger the app-wide sign-out.
 */
export const endpoints = {
  login: (email: string, password: string, client: ApiClient = getApi()) =>
    client.post<LoginResponse>('/api/auth/login', { email, password }, { signedOutOn401: false }),

  register: (name: string, email: string, password: string, client: ApiClient = getApi()) =>
    client.post<RegistrationResponse>('/api/auth/register', { name, email, password }, { signedOutOn401: false }),

  verifyEmail: (email: string, code: string, client: ApiClient = getApi()) =>
    client.post<{ ok: boolean }>('/api/auth/verify-email', { email, code }, { signedOutOn401: false }),

  resendVerification: (email: string, client: ApiClient = getApi()) =>
    client.post<CodeDeliveryResponse>('/api/auth/verify-email/resend', { email }, { signedOutOn401: false }),

  passwordResetRequest: (email: string, client: ApiClient = getApi()) =>
    client.post<PasswordResetResponse>('/api/auth/password-reset/request', { email }, { signedOutOn401: false }),

  passwordResetConfirm: (email: string, code: string, password: string, client: ApiClient = getApi()) =>
    client.post<{ ok: boolean }>('/api/auth/password-reset/confirm', { email, code, password }, { signedOutOn401: false }),

  /**
   * Body shape from src/app/api/auth/apple/route.ts and `AppModel.loginWithApple`
   * (NexdoApp.swift:209–216): the authorization CODE and the RAW nonce, not the identity token.
   */
  apple: (
    input: { authorizationCode: string; rawNonce: string; givenName?: string; familyName?: string },
    client: ApiClient = getApi(),
  ) => client.post<AppleAuthResponse>('/api/auth/apple', input, { signedOutOn401: false }),

  logout: (client: ApiClient = getApi()) => client.post<{ ok: boolean }>('/api/auth/logout', undefined, { signedOutOn401: false }),
  me: (client: ApiClient = getApi()) => client.get<ProfileResponse>('/api/me'),
  tasks: (client: ApiClient = getApi()) => client.get<TasksResponse>('/api/tasks'),
};
