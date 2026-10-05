import { render } from '@testing-library/react-native';

const mockRouter = { push: jest.fn() };
let mockPath = '/today';
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  usePathname: () => mockPath,
}));
const mockClose = jest.fn(async () => undefined);
jest.mock('../../../lib/sessionNavigation', () => ({ closePresentedScreens: () => mockClose() }));
jest.mock('../../../actions/persistence', () => ({ ownerKeyFor: async (id: string) => `key-${id}` }));
jest.mock('../device', () => ({ pomodoroStore: { getState: () => ({ owner: null, reset: jest.fn() }) } }));

import { CHIME_MARKER, handlePomodoroNotification, presentationFor, readPomodoroOwner, usePomodoroRoute } from '../route';
import { usePomodoroNotificationRoute } from '../usePomodoroNotificationRoute';

/** `PomodoroNotificationRoute` and `openPomodoroNotification()` (RootView.swift:225-232). */

const FALLBACK = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };

function Shell({ profileId }: { profileId: string | null }) {
  usePomodoroNotificationRoute(profileId);
  return null;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/today';
  usePomodoroRoute.getState().clear();
});

test('a tapped alert parks its owner; a dismissal or another payload does not', () => {
  expect(readPomodoroOwner({ pomodoroOwner: 'abc' })).toBe('abc');
  expect(readPomodoroOwner({ momentID: 'x' })).toBeNull();
  expect(handlePomodoroNotification({ pomodoroOwner: 'abc' }, 'dismiss', 'dismiss')).toBe(false);
  expect(usePomodoroRoute.getState().owner).toBeNull();
  expect(handlePomodoroNotification({ pomodoroOwner: 'abc' }, 'default', 'dismiss')).toBe(true);
  expect(usePomodoroRoute.getState().owner).toBe('abc');
});

test('the chime plays its sound with no banner or list entry; everything else keeps the default', () => {
  const chime = { request: { content: { data: { [CHIME_MARKER]: true } } } } as never;
  const alert = { request: { content: { data: { pomodoroOwner: 'abc' } } } } as never;
  expect(presentationFor(chime, FALLBACK)).toEqual({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: true, shouldSetBadge: false });
  expect(presentationFor(alert, FALLBACK)).toBe(FALLBACK);
});

test('opens Pomodoro over the tabs for the signed-in account', async () => {
  usePomodoroRoute.getState().receive('key-u1');
  await render(<Shell profileId="u1" />);
  await flush();
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/wellness/pomodoro', params: { from: 'notification' } });
  expect(usePomodoroRoute.getState().owner).toBeNull();
});

test('drops an alert for another account', async () => {
  usePomodoroRoute.getState().receive('key-someone-else');
  await render(<Shell profileId="u1" />);
  await flush();
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(usePomodoroRoute.getState().owner).toBeNull();
});

test('closes Ask first, and waits while the Wellness chooser is open', async () => {
  usePomodoroRoute.getState().receive('key-u1');
  mockPath = '/ask';
  const view = await render(<Shell profileId="u1" />);
  await flush();
  expect(mockClose).toHaveBeenCalled();
  expect(mockRouter.push).not.toHaveBeenCalled();
  mockPath = '/wellness/guide/moments';
  await view.rerender(<Shell profileId="u1" />);
  await flush();
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(usePomodoroRoute.getState().owner).toBe('key-u1');
  mockPath = '/today';
  await view.rerender(<Shell profileId="u1" />);
  await flush();
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});

test('nothing more to open when Pomodoro is already showing', async () => {
  usePomodoroRoute.getState().receive('key-u1');
  mockPath = '/wellness/pomodoro';
  await render(<Shell profileId="u1" />);
  await flush();
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(usePomodoroRoute.getState().owner).toBeNull();
});
