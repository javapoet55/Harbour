import { render } from '@testing-library/react-native';

const mockScreens: { name: string; options?: { title?: string; headerShown?: boolean } }[] = [];
jest.mock('expo-router', () => {
  function Screen(props: { name: string; options?: { title?: string; headerShown?: boolean } }) {
    mockScreens.push(props);
    return null;
  }
  function StackRoot({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  }
  return { router: { back: jest.fn() }, Stack: Object.assign(StackRoot, { Screen }) };
});

import TaskLayout from '../../app/task/_layout';

/** The task stack's presented titles (ios/App/RootView.swift). */
describe('task stack', () => {
  it('titles the Add Manually sheet "Create New Task" (RootView.swift:2110)', async () => {
    await render(<TaskLayout />);
    expect(mockScreens.find((screen) => screen.name === 'new')?.options?.title).toBe('Create New Task');
  });

  it('shows no bar on Task Details: the screen’s own header has the title and the xmark (RootView.swift:2014)', async () => {
    await render(<TaskLayout />);
    expect(mockScreens.find((screen) => screen.name === '[id]')?.options?.headerShown).toBe(false);
  });
});
