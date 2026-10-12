import { act, render } from '@testing-library/react-native';
import { Accelerometer } from 'expo-sensors';
import { AppState } from 'react-native';

import type { Profile } from '../../../api';
import { useSession } from '../../../store/session';
import { bugReportDismissed, configureBugReports, resetBugReports, useBugReport, type BugCoordinatorDeps } from '../coordinator';
import { useBugShake } from '../useBugReportHost';

/** Shake to report (BugReportCoordinator.swift:29-39, `BugShakeGate`; BugReportTests.swift `bugShakeDebounce`). */

const listeners = (Accelerometer as unknown as { __listeners: Set<(value: { x: number; y: number; z: number }) => void> }).__listeners;
let now = 1_000_000;
let present: jest.Mock;

function Probe({ path }: { path: string }) {
  useBugShake(path);
  return null;
}

async function mount(path = '/today') {
  const view = await render(<Probe path={path} />);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

/** A reading of `g` along z: 1 is the phone at rest. */
async function shake(g: number) {
  await act(async () => {
    listeners.forEach((listener) => listener({ x: 0, y: 0, z: g }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  resetBugReports();
  listeners.clear();
  (Accelerometer.setUpdateInterval as jest.Mock).mockClear();
  present = jest.fn();
  const deps: BugCoordinatorDeps = { capture: async () => '/9j/AA==', device: () => ({}), present, dismiss: jest.fn(), newId: () => 'id', now: () => now };
  configureBugReports(deps);
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  // The Jest preset's `AppState.currentState` is a mock function; the app reads the string.
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
  useBugReport.setState({ owner: 'u1', shakeEnabled: true });
});
afterEach(() => jest.restoreAllMocks());

it('listens at 10 Hz and opens on a jolt over 2.7 g, at most once every 8 seconds', async () => {
  await mount();
  expect(Accelerometer.setUpdateInterval).toHaveBeenCalledWith(100);
  await shake(1);
  await shake(2.7);
  expect(present).not.toHaveBeenCalled();
  await shake(3);
  expect(present).toHaveBeenCalledTimes(1);

  // The report is open: the listener is gone.
  expect(listeners.size).toBe(0);
  await act(async () => bugReportDismissed());
  now += 7_000;
  await shake(4);
  expect(present).toHaveBeenCalledTimes(1);
  now += 1_000;
  await shake(4);
  expect(present).toHaveBeenCalledTimes(2);
});

it('does not listen with the setting off, signed out, or on a sign-in screen', async () => {
  useBugReport.setState({ shakeEnabled: false });
  const off = await mount();
  expect(listeners.size).toBe(0);
  off.unmount();

  useBugReport.setState({ shakeEnabled: true });
  const signIn = await mount('/sign-in');
  expect(listeners.size).toBe(0);
  signIn.unmount();

  useSession.getState().clear();
  await mount();
  expect(listeners.size).toBe(0);
});
