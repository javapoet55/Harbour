const mockRouter = {
  canDismiss: jest.fn(() => false),
  canGoBack: jest.fn(() => false),
  dismissAll: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
};
// A getter: `jest.mock` and the import are hoisted above `mockRouter`, so it is read on use.
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));

import { closePresentedScreens, replaceWithSignIn } from './sessionNavigation';

/**
 * The POP_TO_TOP / GO_BACK LogBox after Sign out and Delete account: a dismissal must never be sent
 * to a stack with nothing to dismiss, and the end is always a replace to Sign in.
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canDismiss.mockReturnValue(false);
  mockRouter.canGoBack.mockReturnValue(false);
});

it('dispatches nothing when there is nothing to close', async () => {
  await closePresentedScreens();
  expect(mockRouter.dismissAll).not.toHaveBeenCalled();
  expect(mockRouter.back).not.toHaveBeenCalled();
});

it('pops a pushed screen, then closes the presented sheet, each only when it can', async () => {
  const order: string[] = [];
  mockRouter.canDismiss.mockReturnValueOnce(true);
  mockRouter.dismissAll.mockImplementation(() => order.push('dismissAll'));
  mockRouter.canGoBack.mockReturnValueOnce(true);
  mockRouter.back.mockImplementation(() => order.push('back'));

  await closePresentedScreens();

  expect(order).toEqual(['dismissAll', 'back']);
});

it('closes the sheet without popping when nothing is pushed in it', async () => {
  mockRouter.canGoBack.mockReturnValueOnce(true);
  await closePresentedScreens();
  expect(mockRouter.dismissAll).not.toHaveBeenCalled();
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

it('replaces the stack with Sign in rather than going back', () => {
  replaceWithSignIn();
  expect(mockRouter.replace).toHaveBeenCalledWith('/sign-in');
  expect(mockRouter.back).not.toHaveBeenCalled();
});
