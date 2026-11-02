import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { create } from 'zustand';

import type { ColorScheme } from '../theme/colors';

/**
 * The ONE place that sets the status-bar style (docs/android-polish.md §68, QA M-02).
 *
 * The app's Appearance (Day, Night or System) decides it, never the phone's own theme: Night gets
 * light icons and Day dark ones. A fixed-light screen in front (Daily Brief, the module guides, the
 * introduction, calendar connect) claims dark icons with `FixedLightStatusBar` while it is focused.
 *
 * It sets the style imperatively and AGAIN whenever something native may have put it back. With the
 * phone in Light, every native reset lands on dark icons — the splash screen's removal restores the
 * bars it saved at launch, and the debug dev launcher follows the phone's theme — while React
 * Native's `<StatusBar>` only sends a style when its own props change, so Night kept dark icons. With
 * the phone in Dark the reset happened to match Night, which is why only phone Light + app Night
 * showed it. So no `<StatusBar>` component is mounted anywhere (statusBarOwner.guard.test.ts), and this
 * re-applies on every change of style, on each navigation, on each return to the foreground and once
 * the splash has faded.
 */

export type BarStyle = 'light-content' | 'dark-content';

/** Light icons on the app's Night, dark on Day; dark whenever a fixed-light screen is in front. */
export function statusBarStyleFor(appScheme: ColorScheme, fixedLightInFront: boolean): BarStyle {
  if (fixedLightInFront) return 'dark-content';
  return appScheme === 'dark' ? 'light-content' : 'dark-content';
}

const useFixedLightClaims = create<{ claims: number }>()(() => ({ claims: 0 }));

/** Claims dark icons for a fixed-light screen; the returned function gives the claim back, once. */
export function claimFixedLight(): () => void {
  useFixedLightClaims.setState((state) => ({ claims: state.claims + 1 }));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    useFixedLightClaims.setState((state) => ({ claims: Math.max(0, state.claims - 1) }));
  };
}

/** The style last asked for, so a re-apply from outside React sends the same one. */
let current: BarStyle | null = null;

function apply(style: BarStyle) {
  current = style;
  // `setBarStyle` goes straight to the native module, with no props stack in between to skip it.
  StatusBar.setBarStyle(style, false);
}

/** `expo-splash-screen`'s fade on Android (SplashScreenOptions.duration, 400 ms), with a margin. */
export const SPLASH_FADE_MS = 500;

/**
 * Re-applies the current style now and after the splash has faded: removing the Android 12+ splash
 * view puts back the system-bar appearance it saved at launch, which follows the phone's theme.
 * Returns a function that cancels the late re-apply.
 */
export function reapplyAfterSplash(): () => void {
  if (current) apply(current);
  const timer = setTimeout(() => {
    if (current) apply(current);
  }, SPLASH_FADE_MS);
  return () => clearTimeout(timer);
}

/** Mounted once, in the root layout, with the app's scheme (no `FixedScheme` above it). */
export function StatusBarOwner({ scheme }: { scheme: ColorScheme }) {
  const fixedLight = useFixedLightClaims((state) => state.claims > 0);
  const style = statusBarStyleFor(scheme, fixedLight);
  const pathname = usePathname();

  // A new style, and every navigation: a screen change is where native code last reset it.
  useEffect(() => {
    apply(style);
  }, [style, pathname]);

  // Back from the background, or from another activity (a browser sign-in, the photo picker).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') apply(style);
    });
    return () => subscription.remove();
  }, [style]);

  return null;
}

/** Tests only: forget the claims and the last style. */
export function resetStatusBarOwner() {
  useFixedLightClaims.setState({ claims: 0 });
  current = null;
}
