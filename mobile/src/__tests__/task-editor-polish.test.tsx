import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { useSession } from '../store/session';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({}),
  // Anything still put in the stack header shows up here, so a test can tell it is not there.
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => options?.headerRight?.() ?? null },
}));

const mockCreateTask = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    createTask: (...args: unknown[]) => mockCreateTask(...args),
    projects: async () => ({ projects: [] }),
    tasks: async () => ({ tasks: [], timeZone: 'Asia/Kolkata' }),
  },
}));

import NewTask from '../../app/task/new';

/** 9e82c95 "Polish the iOS Create New Task screen" (ios/App/RootView.swift:2262-2462, :2613-2653). */

async function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return await render(
    <QueryClientProvider client={queryClient}>
      <NewTask />
    </QueryClientProvider>,
  );
}

const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: 'Asia/Kolkata' } });
});

describe('Create New Task header (Phase 15, `creationHeader` :2346-2387)', () => {
  it('draws its own header: Close, the heading and the gradient microphone', async () => {
    await renderEditor();
    const heading = screen.getByTestId('task-editor-heading');
    expect(heading).toHaveTextContent('Create New Task');
    expect(heading.props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('task-editor-close')).toHaveTextContent('Close');
    expect(screen.getByTestId('task-editor-voice-gradient')).toBeTruthy();
    // The header is the screen's, not the stack's.
    expect(screen.getAllByTestId('task-editor-voice')).toHaveLength(1);
  });

  it('Close goes back, and is off while the task is being created', async () => {
    await renderEditor();
    await fireEvent.press(screen.getByTestId('task-editor-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockCreateTask.mockReturnValue(new Promise(() => undefined));
    await fireEvent.changeText(screen.getByTestId('task-title'), 'Read a book');
    await fireEvent.press(screen.getByTestId('create-task'));
    await waitFor(() => expect(screen.getByTestId('task-editor-close').props.accessibilityState.disabled).toBe(true));
  });
});

describe('Create New Task estimate (Phase 15, `estimateSection` :2424-2462)', () => {
  it('has no inline stepper: a Custom button opens the Custom estimate sheet', async () => {
    await renderEditor();
    expect(screen.queryByTestId('duration-stepper')).toBeNull();
    const custom = screen.getByTestId('duration-custom');
    expect(custom).toHaveTextContent('Custom');
    expect(custom.props.accessibilityLabel).toBe('Custom estimate');
    expect(custom.props.accessibilityValue).toEqual({ text: '30 minutes' });

    await fireEvent.press(custom);

    expect(screen.getByTestId('custom-estimate-sheet')).toBeTruthy();
    expect(screen.getByText('Custom estimate')).toBeTruthy();
    expect(screen.getByTestId('duration-stepper')).toBeTruthy();
    expect(screen.getByText('30 minutes')).toBeTruthy();
  });

  it('steps by 5 within 5–480 in the sheet, and the button then shows the minutes', async () => {
    await renderEditor();
    await fireEvent.press(screen.getByTestId('duration-custom'));
    await fireEvent.press(screen.getByTestId('duration-increase'));
    expect(screen.getByText('35 minutes')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('custom-estimate-done'));

    expect(screen.queryByTestId('custom-estimate-sheet')).toBeNull();
    expect(screen.getByTestId('duration-custom')).toHaveTextContent('35m');
    expect(screen.getByTestId('duration-custom').props.accessibilityValue).toEqual({ text: '35 minutes' });
    expect(screen.getByTestId('duration-30').props.accessibilityState.selected).toBe(false);

    // A preset brings "Custom" back.
    await fireEvent.press(screen.getByTestId('duration-45'));
    expect(screen.getByTestId('duration-custom')).toHaveTextContent('Custom');
  });

  it('reads each preset as minutes', async () => {
    await renderEditor();
    for (const minutes of [15, 30, 45, 60]) {
      expect(screen.getByTestId(`duration-${minutes}`).props.accessibilityLabel).toBe(`${minutes} minutes`);
      expect(screen.getByTestId(`duration-${minutes}`)).toHaveTextContent(`${minutes}m`);
    }
    expect(screen.getByTestId('duration-30').props.accessibilityState.selected).toBe(true);
  });
});

describe('Create New Task card and Create Task (Phase 15)', () => {
  it('puts the fields on a 24-radius card whose spacing follows the height (14–23)', async () => {
    await renderEditor();
    expect(flat('task-editor-card')).toMatchObject({ borderRadius: 24, paddingHorizontal: 18, paddingTop: 18 });

    await fireEvent(screen.getByTestId('task-editor-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 520 } } });
    expect(flat('task-editor-card').gap).toBe(14);
    await fireEvent(screen.getByTestId('task-editor-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 604 } } });
    expect(flat('task-editor-card').gap).toBe(20);
    await fireEvent(screen.getByTestId('task-editor-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 900 } } });
    expect(flat('task-editor-card').gap).toBe(23);
  });

  it('keeps Create Task on its purple gradient, a little dimmed until there is a name', async () => {
    await renderEditor();
    expect(screen.getByTestId('create-task-gradient')).toBeTruthy();
    expect(flat('create-task-gradient').opacity).toBe(0.88);
    expect(screen.getByTestId('create-task').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('task-title'), 'Read a book');
    expect(flat('create-task-gradient').opacity).toBe(1);
    expect(screen.getByTestId('create-task').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('create-task-gradient').props.colors).toEqual(['#572BF2', '#3D24C4']);
  });
});
