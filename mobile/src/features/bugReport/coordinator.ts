import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';

import { useSession } from '../../store/session';
import { bugDiagnostics, bugShakeKey, screenshotFits, type BugDiagnostics, type BugScreen } from './model';

/**
 * `BugReportCoordinator` (ios/App/BugReportCoordinator.swift, d511fef): one report at a time, opened
 * from Account → Report Bugs or a shake, over whatever is on screen.
 *
 * What differs from UIKit, and why:
 * - **The screenshot is taken BEFORE the report opens.** Swift draws the window beneath its own
 *   overlay when the person agrees; a React Native modal covers the screen it opened over, so the app
 *   root is captured first and held, and only attached on "Include Screenshot".
 * - **Secure screens are flagged, not discovered.** Swift refuses while a visible `UITextField` has
 *   `isSecureTextEntry` (:55-59); React Native cannot search its tree for that, so every screen with a
 *   password field calls `useSecureScreen()`, and a capture taken there is refused the same way.
 * - **Screen tags come from the route.** Swift's `.bugReportScreen(_:)` sets the tag when a tagged view
 *   appears and keeps it until another does; `screenForPath` maps the tagged routes, and an untagged
 *   route (a task, a sheet) keeps the last tag, as Swift's would.
 */

/** What the pre-capture produced: an image, or Swift's refusal (a secure screen, or nothing usable). */
export type BugCapture = { kind: 'captured'; base64: string } | { kind: 'refused' };

export type BugReportSession = { diagnostics: BugDiagnostics; capture: BugCapture };

/** The device values the diagnostics are built from (`diagnostics(screen:)`, :80-87). */
export type BugDeviceInfo = { appVersion?: string | null; buildNumber?: string | number | null; model?: string | null; osVersion?: string | number | null };

export type BugCoordinatorDeps = {
  /** Captures the app root as base64 JPEG, or rejects. */
  capture: () => Promise<string>;
  device: () => BugDeviceInfo;
  present: () => void;
  dismiss: () => void;
  newId: () => string;
  now: () => number;
};

type CoordinatorState = {
  screen: BugScreen;
  /** Mounted screens with a password field (`useSecureScreen`). */
  secure: number;
  /** A report is open, or opening. Swift's `host != nil`. */
  presenting: boolean;
  session: BugReportSession | null;
  owner: string | null;
  shakeEnabled: boolean;
};

const INITIAL: CoordinatorState = { screen: 'app', secure: 0, presenting: false, session: null, owner: null, shakeEnabled: false };

export const useBugReport = create<CoordinatorState>()(() => ({ ...INITIAL }));

let deps: BugCoordinatorDeps | null = null;

/** The app's capture, device, navigation, ids and clock (app/_layout.tsx). Tests pass fakes. */
export function configureBugReports(next: BugCoordinatorDeps | null): void {
  deps = next;
}

/**
 * `.bugReportScreen(_:)` (RootView.swift:165, :172, :228, :232; WellnessChooserView.swift:48, :51;
 * ProfileView.swift:103), as routes. `null` keeps the previous tag.
 */
export function screenForPath(path: string): BugScreen | null {
  const first = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  if (first('/bug-report')) return null;
  if (first('/today')) return 'today';
  if (first('/tasks')) return 'tasks';
  if (first('/calendar')) return 'calendar';
  if (first('/ask')) return 'askAI';
  if (first('/wellness/shopping')) return 'shopping';
  if (first('/wellness/moments')) return 'moments';
  if (first('/wellness/calories')) return 'calories';
  if (first('/wellness/pomodoro')) return 'pomodoro';
  // The chooser, and a guide in front of a module (Swift tags the module, which has not appeared yet).
  if (first('/wellness')) return 'wellness';
  if (first('/account')) return 'settings';
  return null;
}

/** The sign-in screens, where neither a shake nor the menu can open a report (no profile there). */
export function isSignInPath(path: string): boolean {
  return ['/sign-in', '/sign-up', '/reset-password', '/verify-email'].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function trackBugReportRoute(path: string): void {
  const screen = screenForPath(path);
  if (screen !== null && screen !== useBugReport.getState().screen) useBugReport.setState({ screen });
}

/** A screen with a password field: captures taken while it is mounted are refused (BugReportCoordinator.swift:55-59). */
export function markSecureScreen(): () => void {
  useBugReport.setState((state) => ({ secure: state.secure + 1 }));
  return () => useBugReport.setState((state) => ({ secure: Math.max(0, state.secure - 1) }));
}

/**
 * `open(from:)` (:41-71): only signed in, only one at a time. The capture and the diagnostics are
 * taken now, from the screen the report opens over. Resolves `false` when it did not open.
 */
export async function openBugReport(from?: BugScreen): Promise<boolean> {
  const state = useBugReport.getState();
  if (!deps || state.presenting || useSession.getState().status !== 'signedIn') return false;
  useBugReport.setState({ presenting: true });
  const capture = await captureForReport(deps, state.secure > 0);
  const diagnostics = bugDiagnostics(deps.device(), from ?? state.screen, deps.now(), deps.newId);
  useBugReport.setState({ session: { diagnostics, capture } });
  deps.present();
  return true;
}

async function captureForReport(current: BugCoordinatorDeps, secure: boolean): Promise<BugCapture> {
  if (secure) return { kind: 'refused' };
  try {
    const base64 = await current.capture();
    return screenshotFits(base64) ? { kind: 'captured', base64 } : { kind: 'refused' };
  } catch {
    return { kind: 'refused' };
  }
}

/** `close()` (:72-74): the report goes, and the screen it opened over is back. */
export function closeBugReport(): void {
  if (!useBugReport.getState().presenting) return;
  deps?.dismiss();
}

/** The report screen unmounted, by Close, Done or the system back. */
export function bugReportDismissed(): void {
  useBugReport.setState({ presenting: false, session: null });
}

/**
 * `configure(model:active:)` (:16-24): the shake setting belongs to the signed-in account, re-read when
 * the account changes; off by default.
 */
export async function loadShakeSetting(owner: string | null): Promise<void> {
  useBugReport.setState({ owner, shakeEnabled: false });
  if (!owner) return;
  try {
    const stored = await AsyncStorage.getItem(bugShakeKey(owner));
    if (useBugReport.getState().owner === owner) useBugReport.setState({ shakeEnabled: stored === 'true' });
  } catch {
    // Unreadable is off.
  }
}

/** `setShake(_:)` (:25-28). */
export async function setShakeEnabled(enabled: boolean): Promise<void> {
  const { owner } = useBugReport.getState();
  if (!owner) return;
  useBugReport.setState({ shakeEnabled: enabled });
  await AsyncStorage.setItem(bugShakeKey(owner), enabled ? 'true' : 'false').catch(() => undefined);
}

/** Test seam. */
export function resetBugReports(): void {
  useBugReport.setState({ ...INITIAL });
  deps = null;
}

/**
 * Marks the calling screen as showing a password field for as long as it is mounted, so a bug report
 * opened over it gets no screenshot — Swift's `containsSecure` check (BugReportCoordinator.swift:55-59).
 * Used by Sign in, Sign up, Reset password (both copies) and Change password.
 */
export function useSecureScreen(): void {
  useEffect(() => markSecureScreen(), []);
}
