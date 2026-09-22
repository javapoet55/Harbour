import { focusManager, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useCoordinator } from '../src/actions/coordinator';
import { useActionNotifications } from '../src/actions/useActionNotifications';
import { onSignedOut } from '../src/api';
import { RootErrorBoundary } from '../src/components/RootErrorBoundary';
import { useMomentsLifecycle } from '../src/features/moments/useMomentsLifecycle';
import { useShoppingLifecycle } from '../src/features/shopping/useShoppingLifecycle';
import { createQueryClient } from '../src/query/client';
import { queryKeys } from '../src/query/keys';
import { useMe } from '../src/query/useMe';
import { tasksQueryOptions } from '../src/query/useTasks';
import { synchronizeDeviceTimeZone, TIME_ZONE_SYNC_ERROR } from '../src/query/useProfile';
import { useAppearance } from '../src/store/appearance';
import { useLastSignedIn } from '../src/store/lastSignedIn';
import { useSession } from '../src/store/session';
import { useTheme } from '../src/theme';

/**
 * ONE launch splash, not two. Left to itself the native splash hides on the first React frame, and the
 * app then shows `SplashView` (app/index.tsx) while the launch `GET /api/me` decides — a second splash
 * with the logo at a different size. Holding the native splash until that decision is made (see
 * `RootNavigator`) makes the launch a single splash straight into Today or sign-in, as iOS's
 * `RootView` does. Called at module scope, as the docs require, so it runs before the first frame.
 */
void SplashScreen.preventAutoHideAsync();

/**
 * The longest the native splash is held. A launch that is still retrying `/api/me` after this falls
 * back to `SplashView`, which looks the same, rather than leaving the app apparently frozen.
 */
const SPLASH_HOLD_LIMIT_MS = 8_000;

/**
 * `[.medium, .large]`, opening at `.medium`, with the drag indicator (iOS; Android draws its own).
 *
 * `.medium` on iOS 26 puts the sheet's top edge at 47.6% of the screen (`today-attention-sheet-half`).
 * Android's detent is a fraction of the height BELOW the status bar, so 0.54 lands the same edge.
 */
const SHEET_OPTIONS = {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [0.54, 1.0],
  sheetInitialDetentIndex: 0,
  sheetGrabberVisible: true,
};

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
        {/* Keyboard frames for src/components/keyboard.tsx. It detects the app's edge-to-edge
            window on its own, so it leaves the status and navigation bar insets alone. */}
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <RootNavigator />
          </QueryClientProvider>
        </KeyboardProvider>
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
  const { data: profile, isPending: launchUndecided } = useMe();
  const status = useSession((state) => state.status);
  const setProfile = useSession((state) => state.setProfile);
  const clear = useSession((state) => state.clear);

  useEffect(() => {
    if (profile) setProfile(profile);
    else if (profile === null) clear();
  }, [profile, setProfile, clear]);

  // Release the native splash once the launch is decided (signed in, signed out, or the error screen),
  // one frame late so the screen it reveals has already drawn. `hide()` is a no-op once hidden.
  useEffect(() => {
    if (launchUndecided) {
      const limit = setTimeout(SplashScreen.hide, SPLASH_HOLD_LIMIT_MS);
      return () => clearTimeout(limit);
    }
    const frame = requestAnimationFrame(SplashScreen.hide);
    return () => cancelAnimationFrame(frame);
  }, [launchUndecided]);

  /**
   * Nothing is left presented over the sign-in screen, and NO navigation action is sent when the
   * session ends. Every signed-in group — the tabs and everything that opens over them (account, ask,
   * calendar, task, the sheets) — is declared inside the signed-in guard below, so the flip to
   * `signedOut` removes them all, presented modals included; Swift's `RootView` swaps its body the
   * same way.
   *
   * This used to call `router.dismissAll()` from the store's subscriber. Expo Router queues that and
   * dispatches it a render later — by which time the guard had removed the stack it was aimed at:
   * "The action 'POP_TO_TOP' was not handled by any navigator". Screens that end the session on
   * purpose (Sign out, Delete account) close themselves FIRST, while their stacks exist
   * (src/lib/sessionNavigation.ts); a 401 leaves it to the guards.
   */

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

  // Important Moments: `moments.activate(id)`, the foreground refresh and the notification route
  // (ios/App/RootView.swift:57-72).
  useMomentsLifecycle(profile?.id);

  // Shopping Lists: the lists belong to the signed-in account, so a different account starts empty.
  useShoppingLifecycle(profile?.id);

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.groupedBackground } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(tabs)" />
          {/*
            Needs attention and Reschedule all: `.sheet`s with `.presentationDetents([.medium, .large])`
            (RootView.swift:1188-1191, TodayAttentionSheet.swift:98). Presented from HERE rather than
            the Today stack so they cover the tab bar, as a SwiftUI sheet does. A native form sheet is
            the detent API — Material `BottomSheetBehavior` on Android — and needs no new dependency.
            Both draw their own bar, since a form sheet has no navigator header on Android.
          */}
          <Stack.Screen name="attention" options={SHEET_OPTIONS} />
          <Stack.Screen name="reschedule-all" options={SHEET_OPTIONS} />
          {/*
            The signed-in groups that open over the tabs. Left undeclared, Expo Router registered them
            OUTSIDE every guard, so ending the session did not remove them: after Delete account the
            Account sheet stayed on screen, and Back or Sign out then hit "The action 'GO_BACK' was not
            handled by any navigator". Declared here, they go with the session like the tabs.
          */}
          <Stack.Screen name="account" />
          <Stack.Screen name="ask" />
          <Stack.Screen name="calendar" />
          <Stack.Screen name="task" />
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
