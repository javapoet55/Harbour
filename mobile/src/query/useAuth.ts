import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { endpoints, isApiError, type Profile } from '../api';
import { useLastSignedIn } from '../store/lastSignedIn';
import { useSession } from '../store/session';
import { queryKeys } from './keys';
import { synchronizeDeviceTimeZone } from './useProfile';

/**
 * Port of `AppModel.finishAuthentication()` (ios/App/NexdoApp.swift:297–308): once the server has
 * started a session, load the profile, publish it, synchronize the device time zone, remember the
 * first name for the greeting, and load the account's data.
 *
 * Swift's order is exactly this: `/api/me` → `synchronizeDeviceTimeZone()` → remember the name →
 * `load()`. The time-zone step is second because everything loaded after it is dated in the account
 * zone, so syncing later would show one screen of stale dates.
 *
 * `load()` itself is `refreshSupplementaryData()` plus `loadTasks()` (`:309-313`). React Query
 * refetches those on mount, so the equivalent here is to invalidate them rather than fetch inline;
 * the screens that need them are not mounted yet at this point.
 */
export async function finishAuthentication(queryClient: QueryClient): Promise<Profile> {
  const { user } = await endpoints.me();
  queryClient.setQueryData(queryKeys.me(), user);
  useSession.getState().setProfile(user);

  // `try await synchronizeDeviceTimeZone()` (NexdoApp.swift:300). It throws in Swift too, which
  // aborts `finishAuthentication` and leaves the sign-in screen showing the error.
  await synchronizeDeviceTimeZone(queryClient);

  const current = queryClient.getQueryData<Profile | null>(queryKeys.me()) ?? user;
  await useLastSignedIn.getState().remember(current.name);

  // `try await load()` (`:307`).
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleIntelligence() });
  return current;
}

/** `EMAIL_NOT_VERIFIED` from sign-in: the account exists but must confirm its emailed code first. */
export type PendingVerification = {
  email: string;
  /** Mirrors `PendingEmailVerification.Reason` (ios/Sources/NexdoCore/EmailVerification.swift:16–18). */
  reason: 'codeSent' | 'codeNotSent' | 'signInRequiresVerification';
};

/**
 * `AppModel.login` (NexdoApp.swift:156–169). Resolves to a pending verification instead of throwing
 * when the server answers EMAIL_NOT_VERIFIED, because that is a route change, not a failure.
 */
export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation<PendingVerification | null, Error, { email: string; password: string }>({
    mutationFn: async ({ email, password }) => {
      const address = email.trim();
      try {
        await endpoints.login(address, password);
      } catch (error) {
        if (isApiError(error) && error.code === 'EMAIL_NOT_VERIFIED') {
          return { email: error.email ?? address, reason: 'signInRequiresVerification' };
        }
        throw error;
      }
      await finishAuthentication(queryClient);
      return null;
    },
  });
}

/**
 * `AppModel.register` (NexdoApp.swift:170–182). A server that does not require verification starts the
 * session at registration, so that branch signs in instead of routing to the verify screen.
 */
export function useSignUp() {
  return useMutation<PendingVerification | null, Error, { name: string; email: string; password: string }>({
    mutationFn: async ({ name, email, password }) => {
      const response = await endpoints.register(name, email, password);
      if (response.emailVerificationRequired !== true) return null;
      return { email: response.email, reason: response.emailSent === false ? 'codeNotSent' : 'codeSent' };
    },
  });
}

/** `AppModel.verifyEmail` (NexdoApp.swift:183–187): a correct code starts the session. */
export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation<Profile, Error, { email: string; code: string }>({
    mutationFn: async ({ email, code }) => {
      await endpoints.verifyEmail(email, code);
      return finishAuthentication(queryClient);
    },
  });
}

/** `AppModel.resendVerificationCode` (NexdoApp.swift:188–191): resolves to the server's message. */
export function useResendVerification() {
  return useMutation<string, Error, { email: string }>({
    mutationFn: async ({ email }) => (await endpoints.resendVerification(email)).message,
  });
}

/** `AppModel.requestPasswordReset` (NexdoApp.swift:192–199). */
export function useRequestPasswordReset() {
  return useMutation<string, Error, { email: string }>({
    mutationFn: async ({ email }) => (await endpoints.passwordResetRequest(email)).message,
  });
}

/** `AppModel.confirmPasswordReset` (NexdoApp.swift:200–208). The server does not start a session here. */
export function useConfirmPasswordReset() {
  return useMutation<void, Error, { email: string; code: string; password: string }>({
    mutationFn: async ({ email, code, password }) => {
      await endpoints.passwordResetConfirm(email, code, password);
    },
  });
}

/** `AppModel.loginWithApple` (NexdoApp.swift:209–216). */
export function useAppleSignIn() {
  const queryClient = useQueryClient();
  return useMutation<Profile, Error, { authorizationCode: string; rawNonce: string; givenName?: string; familyName?: string }>({
    mutationFn: async (input) => {
      await endpoints.apple(input);
      return finishAuthentication(queryClient);
    },
  });
}

/**
 * Sign out: clear the server session, the session store, and every cached query, so no signed-in data
 * survives into the next session. `me` is seeded with `null` so the gate resolves to the auth group
 * immediately instead of showing the splash while /api/me refetches.
 */
export function useSignOut({ beforeSessionEnds }: { beforeSessionEnds?: () => Promise<void> } = {}) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        await endpoints.logout();
      } finally {
        // Close the signed-in screens while they still exist (src/lib/sessionNavigation.ts).
        await beforeSessionEnds?.().catch(() => undefined);
        useSession.getState().clear();
        queryClient.clear();
        queryClient.setQueryData(queryKeys.me(), null);
      }
    },
  });
}
