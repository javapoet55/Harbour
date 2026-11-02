import { act, render } from '@testing-library/react-native';
import { AppState, StatusBar, type AppStateStatus } from 'react-native';

import { FixedLightStatusBar } from '../features/wellness/FixedLightStatusBar';
import { useAppearance, type Appearance as AppAppearance } from '../store/appearance';
import { useTheme } from '../theme';
import { reapplyAfterSplash, resetStatusBarOwner, SPLASH_FADE_MS, statusBarStyleFor, StatusBarOwner } from './StatusBarOwner';

let mockPathname = '/today';
const mockFocused = jest.fn(() => true);
jest.mock('expo-router', () => ({ usePathname: () => mockPathname, useIsFocused: () => mockFocused() }));
/** The phone's own theme. */
let mockPhoneScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => mockPhoneScheme }));

/** As the root layout mounts it: with the app's scheme, outside any `FixedScheme`. */
function Root({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <>
      <StatusBarOwner scheme={theme.scheme} />
      {children}
    </>
  );
}

let setBarStyle: jest.SpyInstance;
let appStateListeners: ((state: AppStateStatus) => void)[];
const lastStyle = () => setBarStyle.mock.calls.at(-1)?.[0];
const phone = (scheme: 'light' | 'dark') => {
  mockPhoneScheme = scheme;
};

beforeEach(() => {
  jest.useFakeTimers();
  resetStatusBarOwner();
  mockPathname = '/today';
  mockFocused.mockReturnValue(true);
  setBarStyle = jest.spyOn(StatusBar, 'setBarStyle').mockImplementation(() => undefined);
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => (appStateListeners = appStateListeners.filter((each) => each !== listener)) };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  useAppearance.setState({ appearance: 'system' });
});

/** QA M-02: the status bar follows the app's Appearance, whatever the phone's own theme (§68). */
describe('StatusBarOwner', () => {
  const cases: [phone: 'light' | 'dark', app: AppAppearance, style: 'light-content' | 'dark-content'][] = [
    // The QA case: phone Light, app Night.
    ['light', 'night', 'light-content'],
    ['dark', 'night', 'light-content'],
    ['light', 'day', 'dark-content'],
    ['dark', 'day', 'dark-content'],
    ['light', 'system', 'dark-content'],
    ['dark', 'system', 'light-content'],
  ];

  it.each(cases)('phone %s, app %s: %s', async (phoneScheme, app, style) => {
    phone(phoneScheme);
    useAppearance.setState({ appearance: app });
    await render(<Root />);
    expect(lastStyle()).toBe(style);
  });

  it('follows a change of Appearance at once', async () => {
    phone('light');
    useAppearance.setState({ appearance: 'day' });
    await render(<Root />);
    expect(lastStyle()).toBe('dark-content');
    await act(async () => useAppearance.setState({ appearance: 'night' }));
    expect(lastStyle()).toBe('light-content');
  });

  it('re-applies the style when the app returns to the foreground', async () => {
    phone('light');
    useAppearance.setState({ appearance: 'night' });
    await render(<Root />);
    setBarStyle.mockClear();
    await act(async () => appStateListeners.forEach((listener) => listener('background')));
    expect(setBarStyle).not.toHaveBeenCalled();
    await act(async () => appStateListeners.forEach((listener) => listener('active')));
    expect(setBarStyle).toHaveBeenCalledWith('light-content', false);
  });

  it('re-applies the style on each navigation', async () => {
    phone('light');
    useAppearance.setState({ appearance: 'night' });
    const view = await render(<Root />);
    setBarStyle.mockClear();
    mockPathname = '/calendar';
    await view.rerender(<Root />);
    expect(setBarStyle).toHaveBeenCalledWith('light-content', false);
  });

  it('re-applies the style once the splash has faded', async () => {
    phone('light');
    useAppearance.setState({ appearance: 'night' });
    await render(<Root />);
    setBarStyle.mockClear();
    reapplyAfterSplash();
    expect(setBarStyle).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(SPLASH_FADE_MS);
    expect(setBarStyle).toHaveBeenCalledTimes(2);
    expect(lastStyle()).toBe('light-content');
  });

  it('cancels the late splash re-apply', async () => {
    phone('light');
    useAppearance.setState({ appearance: 'night' });
    await render(<Root />);
    const cancel = reapplyAfterSplash();
    setBarStyle.mockClear();
    cancel();
    jest.advanceTimersByTime(SPLASH_FADE_MS);
    expect(setBarStyle).not.toHaveBeenCalled();
  });
});

/** Daily Brief, the module guides, the introduction and calendar connect keep dark icons while in front. */
describe('FixedLightStatusBar', () => {
  it.each([
    ['light', 'night'],
    ['dark', 'night'],
    ['light', 'day'],
    ['dark', 'system'],
  ] as const)('gives dark icons in front: phone %s, app %s', async (phoneScheme, app) => {
    phone(phoneScheme);
    useAppearance.setState({ appearance: app });
    await render(
      <Root>
        <FixedLightStatusBar />
      </Root>,
    );
    expect(lastStyle()).toBe('dark-content');
  });

  it('hands back to the app’s Night when it closes', async () => {
    phone('light');
    useAppearance.setState({ appearance: 'night' });
    const view = await render(
      <Root>
        <FixedLightStatusBar />
      </Root>,
    );
    expect(lastStyle()).toBe('dark-content');
    await view.rerender(<Root />);
    expect(lastStyle()).toBe('light-content');
  });

  it('steps aside while its screen is not in front', async () => {
    phone('light');
    useAppearance.setState({ appearance: 'night' });
    mockFocused.mockReturnValue(false);
    await render(
      <Root>
        <FixedLightStatusBar />
      </Root>,
    );
    expect(setBarStyle).not.toHaveBeenCalledWith('dark-content', false);
    expect(lastStyle()).toBe('light-content');
  });

  it('keeps dark icons until the last fixed-light screen goes', async () => {
    phone('light');
    useAppearance.setState({ appearance: 'night' });
    const view = await render(
      <Root>
        <FixedLightStatusBar />
        <FixedLightStatusBar />
      </Root>,
    );
    await view.rerender(
      <Root>
        <FixedLightStatusBar />
      </Root>,
    );
    expect(lastStyle()).toBe('dark-content');
    await view.rerender(<Root />);
    expect(lastStyle()).toBe('light-content');
  });
});

describe('statusBarStyleFor', () => {
  it('reads only the app scheme and the fixed-light claim', () => {
    expect(statusBarStyleFor('dark', false)).toBe('light-content');
    expect(statusBarStyleFor('light', false)).toBe('dark-content');
    expect(statusBarStyleFor('dark', true)).toBe('dark-content');
  });
});
