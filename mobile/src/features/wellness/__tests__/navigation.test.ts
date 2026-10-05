const mockRouter = { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
const mockClose = jest.fn(async () => undefined);
jest.mock('../../../lib/sessionNavigation', () => ({ closePresentedScreens: () => mockClose() }));

import { useTaskQuery } from '../../../store/taskQuery';
import { continueToModule, leaveWellness, openModuleGuide } from '../navigation';

/** RootView.swift:212-216 (`onDismiss` with the choice) and WellnessChooserView.swift:44-58. */

beforeEach(() => {
  jest.clearAllMocks();
  useTaskQuery.getState().replace({ ...useTaskQuery.getState().query, date: 'This Week' });
});

it.each([
  ['home', '/today'],
  ['calendar', '/calendar'],
  ['tasks', '/tasks'],
] as const)('%s closes the covers and goes to %s', async (exit, path) => {
  await leaveWellness(exit);
  expect(mockClose).toHaveBeenCalled();
  expect(mockRouter.navigate).toHaveBeenCalledWith(path);
});

it('Tasks resets the list to Today, as `model.taskQuery.date = .today`', async () => {
  await leaveWellness('tasks');
  expect(useTaskQuery.getState().query.date).toBe('Today');
});

it('Ask AI closes the covers and opens the Ask sheet', async () => {
  await leaveWellness('askAI');
  expect(mockClose.mock.invocationCallOrder[0]).toBeLessThan(mockRouter.push.mock.invocationCallOrder[0]);
  expect(mockRouter.push).toHaveBeenCalledWith('/ask');
});

it('a module card opens its guide', () => {
  openModuleGuide('shopping');
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/wellness/guide/[kind]', params: { kind: 'shopping' } });
});

it('Pomodoro and the Calorie Tracker replace the guide inside the cover', async () => {
  await continueToModule('pomodoro');
  await continueToModule('calories');
  expect(mockRouter.replace.mock.calls).toEqual([['/wellness/pomodoro'], ['/wellness/calories']]);
  expect(mockClose).not.toHaveBeenCalled();
});

it('Moments and Shopping are the existing screens in the Today stack', async () => {
  await continueToModule('moments');
  await continueToModule('shopping');
  expect(mockClose).toHaveBeenCalledTimes(2);
  expect(mockRouter.navigate.mock.calls).toEqual([['/moments'], ['/shopping']]);
});
