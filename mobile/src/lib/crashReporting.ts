import { crash, getCrashlytics, log, setAttribute, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics';
import { DevSettings } from 'react-native';

/**
 * Crash reporting: `NexdoCrashReporting` (ios/App/NexdoCrashReporting.swift, ios/CRASHLYTICS.md, 4185501).
 *
 * At launch: collection on, and ONE custom value — `build_configuration`, "debug" or "release". Nothing
 * else is attached: no user id, no account details, no bug-report text or screenshots (bug reports stay
 * separate). The SDK still collects its standard crash, device and session diagnostics.
 *
 * Debug builds only: a controlled test crash, five seconds after it is asked for, tagged
 * `controlled_test`. Swift takes a launch argument (`-nexdo-crashlytics-test-crash`); a React Native app
 * has no launch arguments, so here it is an item in the developer menu. Release builds compile it out.
 */

export const BUILD_CONFIGURATION_KEY = 'build_configuration';
export const TEST_CRASH_MENU_ITEM = 'Crashlytics test crash';
export const TEST_CRASH_MESSAGE = 'NexDo controlled Crashlytics verification';

type Reporter = ReturnType<typeof getCrashlytics>;

export type CrashReportingDeps = {
  dev: boolean;
  getReporter: () => Reporter;
  setEnabled: (reporter: Reporter, enabled: boolean) => Promise<unknown> | void;
  setValue: (reporter: Reporter, key: string, value: string) => Promise<unknown> | void;
  addDevMenuItem: (title: string, handler: () => void) => void;
  schedule: (run: () => void, ms: number) => unknown;
  crashNow: (reporter: Reporter) => void;
  breadcrumb: (reporter: Reporter, message: string) => void;
};

const native: CrashReportingDeps = {
  dev: __DEV__,
  getReporter: () => getCrashlytics(),
  setEnabled: (reporter, enabled) => setCrashlyticsCollectionEnabled(reporter, enabled),
  setValue: (reporter, key, value) => setAttribute(reporter, key, value),
  addDevMenuItem: (title, handler) => DevSettings.addMenuItem(title, handler),
  schedule: (run, ms) => setTimeout(run, ms),
  crashNow: (reporter) => crash(reporter),
  breadcrumb: (reporter, message) => log(reporter, message),
};

/** `NexdoCrashReporting.configure()`. Without a configured Firebase app it does nothing, as Swift's guard. */
export function configureCrashReporting(deps: CrashReportingDeps = native): void {
  let reporter: Reporter;
  try {
    reporter = deps.getReporter();
  } catch {
    return;
  }
  void Promise.resolve(deps.setEnabled(reporter, true)).catch(() => undefined);
  void Promise.resolve(deps.setValue(reporter, BUILD_CONFIGURATION_KEY, deps.dev ? 'debug' : 'release')).catch(() => undefined);
  if (deps.dev) deps.addDevMenuItem(TEST_CRASH_MENU_ITEM, () => triggerTestCrash(reporter, deps));
}

/** The Debug-only verification crash: tagged, then a native crash five seconds later. */
export function triggerTestCrash(reporter: Reporter, deps: CrashReportingDeps = native): void {
  if (!deps.dev) return;
  void Promise.resolve(deps.setValue(reporter, 'controlled_test', 'true')).catch(() => undefined);
  deps.breadcrumb(reporter, TEST_CRASH_MESSAGE);
  deps.schedule(() => deps.crashNow(reporter), 5_000);
}
