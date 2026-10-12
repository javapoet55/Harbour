import { BUILD_CONFIGURATION_KEY, configureCrashReporting, TEST_CRASH_MENU_ITEM, TEST_CRASH_MESSAGE, triggerTestCrash, type CrashReportingDeps } from './crashReporting';

/** `NexdoCrashReporting.configure()` (ios/App/NexdoCrashReporting.swift, 4185501). */

const REPORTER = { id: 'crashlytics' } as never;

function deps(dev: boolean, overrides: Partial<CrashReportingDeps> = {}) {
  const calls = {
    enabled: jest.fn(),
    values: jest.fn(),
    menu: [] as { title: string; handler: () => void }[],
    scheduled: [] as { run: () => void; ms: number }[],
    crash: jest.fn(),
    breadcrumb: jest.fn(),
  };
  const value: CrashReportingDeps = {
    dev,
    getReporter: () => REPORTER,
    setEnabled: calls.enabled,
    setValue: calls.values,
    addDevMenuItem: (title, handler) => calls.menu.push({ title, handler }),
    schedule: (run, ms) => calls.scheduled.push({ run, ms }),
    crashNow: calls.crash,
    breadcrumb: calls.breadcrumb,
    ...overrides,
  };
  return { value, calls };
}

it('release: collection on, build_configuration "release", and nothing else', () => {
  const { value, calls } = deps(false);
  configureCrashReporting(value);
  expect(calls.enabled).toHaveBeenCalledWith(REPORTER, true);
  expect(calls.values.mock.calls).toEqual([[REPORTER, BUILD_CONFIGURATION_KEY, 'release']]);
  expect(calls.menu).toEqual([]);
  // The test crash is compiled out of a release build; called anyway, it does nothing.
  triggerTestCrash(REPORTER, value);
  expect(calls.scheduled).toEqual([]);
  expect(calls.crash).not.toHaveBeenCalled();
});

it('debug: "debug", and a developer-menu test crash five seconds after it is asked for', () => {
  const { value, calls } = deps(true);
  configureCrashReporting(value);
  expect(calls.values.mock.calls).toEqual([[REPORTER, BUILD_CONFIGURATION_KEY, 'debug']]);
  expect(calls.menu.map((item) => item.title)).toEqual([TEST_CRASH_MENU_ITEM]);

  calls.menu[0].handler();
  expect(calls.values).toHaveBeenLastCalledWith(REPORTER, 'controlled_test', 'true');
  expect(calls.breadcrumb).toHaveBeenCalledWith(REPORTER, TEST_CRASH_MESSAGE);
  expect(calls.scheduled.map((item) => item.ms)).toEqual([5_000]);
  expect(calls.crash).not.toHaveBeenCalled();
  calls.scheduled[0].run();
  expect(calls.crash).toHaveBeenCalledWith(REPORTER);
});

it('does nothing without a configured Firebase app', () => {
  const { value, calls } = deps(true, {
    getReporter: () => {
      throw new Error('No Firebase App');
    },
  });
  expect(() => configureCrashReporting(value)).not.toThrow();
  expect(calls.enabled).not.toHaveBeenCalled();
  expect(calls.menu).toEqual([]);
});

it('never sets a user id or any other key at launch', () => {
  const { value, calls } = deps(true);
  configureCrashReporting(value);
  expect(calls.values.mock.calls.map((call) => call[1])).toEqual([BUILD_CONFIGURATION_KEY]);
});
