import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

/** The tab shell's options (`app/(tabs)/_layout.tsx`), read from the screens it declares. */

const mockScreens: Record<string, Record<string, unknown>> = {};
jest.mock('expo-router', () => {
  function Screen({ name, options }: { name: string; options?: Record<string, unknown> }) {
    mockScreens[name] = options ?? {};
    return null;
  }
  function Tabs({ children }: { children: ReactNode }) {
    return children;
  }
  Tabs.Screen = Screen;
  return { Tabs, router: { push: jest.fn() } };
});
jest.mock('../features/pomodoro/usePomodoroNotificationRoute', () => ({ usePomodoroNotificationRoute: jest.fn() }));

import TabsLayout from '../../app/(tabs)/_layout';

it('keeps the tab bar from riding above the keyboard on Tasks (Android ahead of iOS)', async () => {
  await render(<TabsLayout />);
  expect(mockScreens['(tasks)']).toMatchObject({ title: 'Tasks', tabBarHideOnKeyboard: true });
  // Only Tasks, as iOS ac9c619: the other tabs are unchanged.
  expect(mockScreens['(today)']?.tabBarHideOnKeyboard).toBeUndefined();
});
