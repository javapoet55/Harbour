import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Profile } from '../../api';
import { useSession } from '../../store/session';
import {
  bugReportDismissed,
  closeBugReport,
  configureBugReports,
  isSignInPath,
  loadShakeSetting,
  markSecureScreen,
  openBugReport,
  resetBugReports,
  screenForPath,
  setShakeEnabled,
  trackBugReportRoute,
  useBugReport,
  type BugCoordinatorDeps,
} from './coordinator';
import { bugCaptureSize } from './device';
import { BUG_SCREENSHOT_MAX_BASE64 } from './model';

/** `BugReportCoordinator` (ios/App/BugReportCoordinator.swift) as Run B builds it. */

const NOW = Date.parse('2026-10-12T05:40:31.400Z');

function fakes(overrides: Partial<BugCoordinatorDeps> = {}) {
  const value: BugCoordinatorDeps = {
    capture: jest.fn(async () => '/9j/AA=='),
    device: () => ({ appVersion: '1.0.0-rc.1', buildNumber: '7', model: 'Pixel 8 (GKWS6)', osVersion: '15' }),
    present: jest.fn(),
    dismiss: jest.fn(),
    newId: () => '37251480-3ddd-4725-8e3b-14168521333e',
    now: () => NOW,
    ...overrides,
  };
  configureBugReports(value);
  return value;
}

beforeEach(() => {
  resetBugReports();
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
});

describe('screen tags (`.bugReportScreen(_:)`)', () => {
  it.each([
    ['/today', 'today'],
    ['/tasks', 'tasks'],
    ['/calendar', 'calendar'],
    ['/calendar/event/e1', 'calendar'],
    ['/ask', 'askAI'],
    ['/wellness', 'wellness'],
    ['/wellness/guide/shopping', 'wellness'],
    ['/wellness/shopping', 'shopping'],
    ['/wellness/shopping/l1', 'shopping'],
    ['/wellness/moments', 'moments'],
    ['/wellness/calories', 'calories'],
    ['/wellness/pomodoro', 'pomodoro'],
    ['/account', 'settings'],
    ['/account/settings', 'settings'],
  ])('%s is %s', (path, screen) => {
    expect(screenForPath(path)).toBe(screen);
  });

  it('keeps the last tag on an untagged route, as a pushed view keeps Swift’s', () => {
    trackBugReportRoute('/tasks');
    trackBugReportRoute('/task/t1');
    trackBugReportRoute('/bug-report');
    expect(useBugReport.getState().screen).toBe('tasks');
  });

  it('knows the sign-in screens', () => {
    expect(['/sign-in', '/sign-up', '/reset-password', '/verify-email'].every(isSignInPath)).toBe(true);
    expect(isSignInPath('/account/reset-password')).toBe(false);
  });
});

describe('opening a report (`open(from:)`)', () => {
  it('captures the screen first, builds the diagnostics from it, then presents', async () => {
    const deps = fakes();
    trackBugReportRoute('/tasks');
    expect(await openBugReport()).toBe(true);
    expect(deps.capture).toHaveBeenCalled();
    expect(deps.present).toHaveBeenCalled();
    expect(useBugReport.getState().session).toEqual({
      capture: { kind: 'captured', base64: '/9j/AA==' },
      diagnostics: {
        appVersion: '1.0.0',
        buildNumber: '7',
        // Parentheses are outside the server's allowed characters.
        deviceModel: 'Pixel 8 GKWS6',
        iosVersion: '15',
        screen: 'tasks',
        timestamp: '2026-10-12T05:40:31Z',
        correlationID: '37251480-3ddd-4725-8e3b-14168521333e',
      },
    });
  });

  it('uses the screen it was opened from when given one (Account: "settings")', async () => {
    fakes();
    trackBugReportRoute('/today');
    await openBugReport('settings');
    expect(useBugReport.getState().session?.diagnostics.screen).toBe('settings');
  });

  it('opens one report at a time, and only signed in', async () => {
    const deps = fakes();
    await openBugReport();
    expect(await openBugReport()).toBe(false);
    bugReportDismissed();
    useSession.getState().clear();
    expect(await openBugReport()).toBe(false);
    expect(deps.present).toHaveBeenCalledTimes(1);
  });

  it('refuses the screenshot on a screen with a password field, without capturing', async () => {
    const deps = fakes();
    const unmark = markSecureScreen();
    await openBugReport();
    expect(deps.capture).not.toHaveBeenCalled();
    expect(useBugReport.getState().session?.capture).toEqual({ kind: 'refused' });
    unmark();
    expect(useBugReport.getState().secure).toBe(0);
  });

  it('refuses a capture that fails or is over the size cap', async () => {
    fakes({ capture: jest.fn(async () => Promise.reject(new Error('no view'))) });
    await openBugReport();
    expect(useBugReport.getState().session?.capture).toEqual({ kind: 'refused' });
    bugReportDismissed();
    fakes({ capture: jest.fn(async () => 'A'.repeat(BUG_SCREENSHOT_MAX_BASE64 + 4)) });
    await openBugReport();
    expect(useBugReport.getState().session?.capture).toEqual({ kind: 'refused' });
  });

  it('closes back to the screen it opened over, and can open again', async () => {
    const deps = fakes();
    await openBugReport();
    closeBugReport();
    expect(deps.dismiss).toHaveBeenCalledTimes(1);
    bugReportDismissed();
    expect(useBugReport.getState()).toMatchObject({ presenting: false, session: null });
    expect(await openBugReport()).toBe(true);
  });
});

describe('the shake setting (`bug.shake.<owner>`)', () => {
  it('is off by default, per account, and survives a reload', async () => {
    await loadShakeSetting('u1');
    expect(useBugReport.getState().shakeEnabled).toBe(false);
    await setShakeEnabled(true);
    expect(await AsyncStorage.getItem('bug.shake.u1')).toBe('true');
    await loadShakeSetting('u2');
    expect(useBugReport.getState().shakeEnabled).toBe(false);
    await loadShakeSetting('u1');
    expect(useBugReport.getState().shakeEnabled).toBe(true);
    await loadShakeSetting(null);
    expect(useBugReport.getState().shakeEnabled).toBe(false);
  });
});

describe('the capture size (BugReportCoordinator.swift:62)', () => {
  it('is at most twice the points and never wider than 1,170 pixels', () => {
    expect(bugCaptureSize(393, 852)).toEqual({ width: 786, height: 1704 });
    expect(bugCaptureSize(650, 1000)).toEqual({ width: 1170, height: 1800 });
  });
});
