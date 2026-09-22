import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { endpoints, type Profile, type ProfileSettingsInput } from '../api';
import { deviceTimeZone } from '../lib/profileSettings';
import { useConsent } from '../store/consent';
import { useFocus } from '../store/focus';
import { useLastSignedIn } from '../store/lastSignedIn';
import { useSession } from '../store/session';
import { queryKeys } from './keys';
import { bumpRevision } from './taskRevision';

/**
 * Account and settings data. Ports `AppModel`'s profile methods
 * (ios/App/NexdoApp.swift:217-295, 732-744).
 *
 * The profile itself is [[useMe]] — one `me` query, which is Swift's single `@Published var profile`.
 * Everything here writes and then re-reads it, exactly as `reloadProfile()` does after each save.
 */

/** `reloadProfile()` (NexdoApp.swift:217-223): re-read /api/me and publish it. */
export async function reloadProfile(queryClient: QueryClient): Promise<Profile> {
  const { user } = await endpoints.me();
  queryClient.setQueryData(queryKeys.me(), user);
  useSession.getState().setProfile(user);
  return user;
}

/**
 * `refreshSupplementaryData()` (called at the end of `saveProfileSettings`, NexdoApp.swift:239).
 *
 * Preferences decide working hours, quiet hours, the next-action policy and the confirmation level,
 * so everything the server derives from them is stale after a save. The weather chip is NOT
 * invalidated: `WeatherClient` uses hardcoded coordinates and its own `timezone=auto`, so it does not
 * depend on the account zone — see the note in `useToday.ts`.
 */
export function refreshSupplementaryData(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleIntelligence() });
}

/**
 * `saveProfileSettings(_:)` (NexdoApp.swift:234-240).
 *
 * ONE PATCH for the whole screen, then a profile reload, then the remembered first name, then a
 * supplementary refresh. Swift does NOT save per control and does not debounce: `ProfileSettingsView`
 * edits local `@State` and only the "Save settings" button (or the back chevron) writes.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation<Profile, Error, ProfileSettingsInput>({
    mutationFn: async (input) => {
      await endpoints.updateSettings(input);
      const user = await reloadProfile(queryClient);
      // `lastSignedInFirstName = ProfileName.firstName(from: profile?.name ?? "")` (`:237-238`).
      await useLastSignedIn.getState().remember(user.name);
      return user;
    },
    onSuccess: () => {
      // A changed time zone re-dates every task row the list and agenda render.
      bumpRevision();
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
      refreshSupplementaryData(queryClient);
    },
  });
}

/**
 * `synchronizeDeviceTimeZone()` (NexdoApp.swift:225-233) —
 * "Follow the device's location-based system zone, including daylight saving time."
 *
 * The rule, exactly:
 * 1. no signed-in profile → do nothing;
 * 2. the profile's zone already equals the device zone → **no request at all**;
 * 3. otherwise PATCH /api/settings with `{ timeZone }` alone, reload the profile, and verify the
 *    reloaded zone really is the device zone — a server that ignored the field is an error, not a
 *    success.
 *
 * Swift calls it from three places: `finishAuthentication()` (`:300`, after every sign-in),
 * `refresh()` (`:437`, when the app returns to the foreground), and `voiceTaskSession()` (`:472`,
 * Phase 9).
 */
export async function synchronizeDeviceTimeZone(queryClient: QueryClient): Promise<void> {
  const profile = queryClient.getQueryData<Profile | null>(queryKeys.me());
  const owner = profile?.id;
  if (!owner) return;

  const zone = deviceTimeZone();
  if (profile.timeZone === zone) return;

  await endpoints.updateSettings({ timeZone: zone });
  const reloaded = await reloadProfile(queryClient);
  if (reloaded.id !== owner || reloaded.timeZone !== zone) {
    throw new Error('The server returned an unexpected response. Please try again later.');
  }
}

/** The failure `refresh()` surfaces when the sync throws (NexdoApp.swift:438). */
export const TIME_ZONE_SYNC_ERROR = 'Couldn’t synchronize your device time zone. Please reconnect and try again.';

/**
 * `saveProfilePhoto(_:)` (NexdoApp.swift:241-272).
 *
 * `null` removes the photo. The write is optimistic — Swift sets `profile?.photo` before the request
 * and restores the previous value on failure — and it CONFIRMS the result: the PATCH response carries
 * the persisted row on a modern server, and an older one that answers only `{ok:true}` is checked
 * with a follow-up /api/me read. A server that silently ignored the field is an error.
 */
export const PHOTO_UNCONFIRMED = 'The server did not confirm your new photo. Please try again.';

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation<string | null, Error, string | null>({
    mutationFn: async (photo) => {
      const profile = queryClient.getQueryData<Profile | null>(queryKeys.me());
      const owner = profile?.id;
      if (!owner) throw new Error('Your session has expired. Please sign in again.');

      const previous = profile.photo ?? null;
      writePhoto(queryClient, owner, photo);
      try {
        const receipt = await endpoints.updatePhoto(photo);
        if (receipt.profile) {
          if (receipt.profile.id !== owner || (receipt.profile.photo ?? null) !== photo) {
            throw new Error(PHOTO_UNCONFIRMED);
          }
        } else {
          // "Older servers return only {ok:true}. Confirm that they really persisted the photo
          // instead of silently ignoring the field." (NexdoApp.swift:263-264)
          const { user } = await endpoints.me();
          if (user.id !== owner || (user.photo ?? null) !== photo) throw new Error(PHOTO_UNCONFIRMED);
        }
        writePhoto(queryClient, owner, photo);
        return photo;
      } catch (cause) {
        writePhoto(queryClient, owner, previous);
        throw cause;
      }
    },
  });
}

/** Keeps the `me` cache and the session store — both of which render avatars — in step. */
function writePhoto(queryClient: QueryClient, owner: string, photo: string | null): void {
  queryClient.setQueryData<Profile | null>(queryKeys.me(), (current) =>
    current && current.id === owner ? { ...current, photo } : current,
  );
  const session = useSession.getState().profile;
  if (session && session.id === owner) useSession.getState().setProfile({ ...session, photo });
}

/** `syncProfileCalendars()` (NexdoApp.swift:286-295). Resolves to the message Swift shows. */
export function useSyncNow() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, void>({
    mutationFn: async () => {
      const result = await endpoints.syncCalendars();
      // `await loadCalendarConnections()` runs before the error check (NexdoApp.swift:338).
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.connections() });
      if (result.results.some((item) => item.error)) {
        return 'Some calendars could not synchronize. Check their connections in calendar settings.';
      }
      refreshSupplementaryData(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
      return result.results.length === 0 ? 'No calendars connected yet.' : 'Calendars synchronized.';
    },
  });
}

/**
 * `deleteAccount()` (NexdoApp.swift:739-744): DELETE /api/account, then the same local teardown
 * `logout()` performs. The server clears the session cookie itself.
 */
export function useDeleteAccount({ beforeSessionEnds }: { beforeSessionEnds?: () => Promise<void> } = {}) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      // A failure (409 while a wish is sending, offline, a 5xx) throws here, before anything local
      // changes: the account still exists, so the caller shows the error and stays put.
      await endpoints.deleteAccount();
      // `deleteAccount()` → `reset()` (NexdoApp.swift:781-803): no profile, AI and voice consent
      // withdrawn, no focus session. The account is gone, so unlike Sign out the greeting name is
      // forgotten too: Sign in must not say "Welcome back" to a deleted account. The session is a
      // cookie the server already cleared in its response; there is no stored token to delete.
      await useLastSignedIn.getState().remember('');
      useConsent.getState().withdraw();
      useFocus.getState().clear();
      // Close the signed-in screens while they still exist (src/lib/sessionNavigation.ts).
      await beforeSessionEnds?.().catch(() => undefined);
      useSession.getState().clear();
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me(), null);
    },
  });
}
