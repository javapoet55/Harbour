import { focusManager, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useCoordinator } from '../src/actions/coordinator';
import { useActionNotifications } from '../src/actions/useActionNotifications';
import { onSignedOut } from '../src/api';
import { RootErrorBoundary } from '../src/components/RootErrorBoundary';
import { createQueryClient } from '../src/query/client';
import { queryKeys } from '../src/query/keys';
import { useMe } from '../src/query/useMe';
import { tasksQueryOptions } from '../src/query/useTasks';
import { synchronizeDeviceTimeZone, TIME_ZONE_SYNC_ERROR } from '../src/query/useProfile';
import { useAppearance } from '../src/store/appearance';
import { useLastSignedIn } from '../src/store/lastSignedIn';
import { useSession } from '../src/store/session';
import { useTheme } from '../src/theme';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);

  // Refetch stale queries when the app returns to the foreground, and re-assert the device time zone.
  //
  // `RootView` does both on `scenePhase == .active` (ios/App/RootView.swift:66-69): `model.refresh()`
  // (NexdoApp.swift:435-441) synchronizes the zone FIRST and abandons the refresh if that fails,
  // reporting it through the app-wide alert (`RootView.swift:63-65`).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
      if (state !== 'active' || useSession.getState().status !== 'signedIn') return;
      synchronizeDeviceTimeZone(queryClient).catch(() => {
        Alert.alert('Unable to complete request', TIME_ZONE_SYNC_ERROR);
      });
    });
    return () => subscription.remove();
  }, [queryClient]);

  // Device-backed state the first render needs: the sign-in greeting, and the Appearance and App
  // Voice choices, which are `@AppStorage` in Swift (ios/App/ProfileView.swift:127-128).
  useEffect(() => {
    void useLastSignedIn.getState().hydrate();
    void useAppearance.getState().hydrate();
  }, []);

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}

/**
 * Session gate. The launch `GET /api/me` decides: a profile unlocks (tabs), no profile unlocks
 * (auth). While it is undecided neither group is available, so every route falls back to
 * app/index.tsx, which shows the splash rather than a flash of the sign-in screen.
 *
 * The guards read the session **store**, not the `me` query. Signing out calls
 * `queryClient.clear()`, which destroys that query, so the query's `data` goes to `undefined`
 * rather than `null` — and with `undefined` neither guard matched and the gate simply left the
 * signed-in screen on display. The store is the single source of truth here and `clear()` sets it
 * synchronously, so the switch to the auth group happens in the same tick.
 */
export function RootNavigator() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data: profile } = useMe();
  const status = useSession((state) => state.status);
  const setProfile = useSession((state) => state.setProfile);
  const clear = useSession((state) => state.clear);

  useEffect(() => {
    if (profile) setProfile(profile);
    else if (profile === null) clear();
  }, [profile, setProfile, clear]);

  /**
   * Nothing is left presented over the sign-in screen. Whatever ends the session — the Sign out
   * button, a 401 from any request, Delete account — reaches the store, and the guards below then
   * unmount the navigator that owns any presented modal. A modal outliving its navigator is the
   * "GO_BACK was not handled by any navigator" warning, with the sheet still on screen; Swift has
   * no equivalent state, because `RootView` swaps its body and the sheet goes with it.
   *
   * So the dismissal belongs to the TRANSITION, not to any one screen: the store notifies its
   * subscribers synchronously inside `clear()`, while React has only scheduled the re-render, so
   * this runs while the navigator is still mounted to receive it. `canDismiss()` makes it a no-op
   * when nothing is presented — including when the screen already dismissed itself, as the Account
   * sheet does so that it closes on the confirmation rather than on the logout response.
   */
  useEffect(
    () =>
      useSession.subscribe((state, previous) => {
        if (state.status !== 'signedOut' || previous.status === 'signedOut') return;
        if (router.canDismiss()) router.dismissAll();
      }),
    [],
  );

  /**
   * A 401 from ANY request, on any screen, ends the session here. There is no navigation call: the
   * guards below flip to the auth group on their own, so this cannot start a redirect loop. It is also
   * idempotent — a burst of parallel 401s writes the same already-signed-out state.
   */
  useEffect(() => {
    onSignedOut(() => {
      if (useSession.getState().status === 'signedOut') return;
      useSession.getState().clear();
      queryClient.setQueryData(queryKeys.me(), null);
    });
  }, [queryClient]);

  /**
   * `taskActions.activate(userID:)` / `.synchronize(tasks:userID:)` (ios/App/RootView.swift:47-50).
   *
   * `RootView` drives the coordinator from two places: the signed-in profile id, and every change to
   * `model.tasks`. Both are reproduced here, so the action set and its notifications follow the task
   * list without any screen having to ask.
   *
   * This OBSERVES the cache and never fetches: `enabled: false` keeps the root layout from issuing a
   * request of its own, so the coordinator sees the list only once a screen has loaded it. The real
   * `queryFn` comes along anyway, because TanStack logs "No queryFn was passed as an option" for a
   * query created without one even when it is disabled.
   */
  const tasksForActions = useQuery({ ...tasksQueryOptions(queryClient), enabled: false }).data;
  useEffect(() => {
    void useCoordinator.getState().activate(profile?.id ?? null);
  }, [profile?.id]);

  useEffect(() => {
    const owner = profile?.id;
    const list = tasksForActions?.tasks;
    if (!owner || !list) return;
    const zone = profile.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    void useCoordinator.getState().synchronize(list, owner, zone);
  }, [profile?.id, profile?.timeZone, tasksForActions]);

  // The notification category, the foreground rule, and every tap or button response.
  useActionNotifications();

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.groupedBackground } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(tabs)" />
          {/* Phase 11 Run A placeholders for the Quick Access tiles; Runs B and C build the screens. */}
          <Stack.Screen name="moments/index" />
          <Stack.Screen name="shopping/index" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Reminder screens sit OUTSIDE the tab group: a notification opens them over any tab. */}
        <Stack.Protected guard={profile != null}>
          <Stack.Screen name="action" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
