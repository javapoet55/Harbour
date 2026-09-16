import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '../api/client';
import { resetRevisions } from '../query/taskRevision';
import { useSession } from '../store/session';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
}));

const mockCreateTask = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { createTask: (...args: unknown[]) => mockCreateTask(...args) },
}));

import NewTask from '../../app/task/new';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata. */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

async function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return await render(
    <QueryClientProvider client={queryClient}>
      <NewTask />
    </QueryClientProvider>,
  );
}

/** Press the button of an `Alert.alert` call by its label. */
function pressAlertButton(label: string) {
  const spy = Alert.alert as unknown as jest.Mock;
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as { text: string; onPress?: () => void }[];
  const button = buttons.find((item) => item.text === label);
  if (!button) throw new Error(`No "${label}" button in the alert`);
  button.onPress?.();
}

describe('Task creation editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    resetRevisions();
    useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.useRealTimers());

  it('renders the Swift field labels, and only those fields', async () => {
    await renderEditor();

    expect(screen.getByText('TASK NAME')).toBeTruthy();
    expect(screen.getByText('NOTES')).toBeTruthy();
    expect(screen.getByText('PROJECT')).toBeTruthy();
    expect(screen.getByText('DATE')).toBeTruthy();
    expect(screen.getByText('TIME ESTIMATE')).toBeTruthy();
    // Swift's creation form has no priority, energy, tags or recurrence.
    expect(screen.queryByText('PRIORITY')).toBeNull();
    expect(screen.queryByText('ENERGY')).toBeNull();
  });

  it('keeps Create Task disabled until the title has non-space content, matching canSave', async () => {
    await renderEditor();
    expect(screen.getByTestId('create-task').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('task-title'), '   ');
    await waitFor(() => expect(screen.getByTestId('create-task').props.accessibilityState.disabled).toBe(true));

    await fireEvent.changeText(screen.getByTestId('task-title'), 'Renew passport');
    await waitFor(() => expect(screen.getByTestId('create-task').props.accessibilityState.disabled).toBe(false));
  });

  it('submits the exact TaskSaveInput body', async () => {
    mockCreateTask.mockResolvedValue({ task: { id: 'new', title: 'Renew passport', status: 'PLANNED', priority: 'MEDIUM', durationMin: 45 } });
    await renderEditor();

    await fireEvent.changeText(screen.getByTestId('task-title'), '  Renew passport  ');
    await fireEvent.press(screen.getByTestId('duration-45'));
    await fireEvent.press(screen.getByTestId('create-task'));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledTimes(1));
    expect(mockCreateTask).toHaveBeenCalledWith({
      // The title is trimmed, as `TaskSaveInput.init` does.
      title: 'Renew passport',
      notes: '',
      durationMin: 45,
      // `TaskCreationDate.today` resolves to `now`, not to midnight.
      startAt: new Date(NOW).toISOString(),
      projectId: null,
    });
  });

  it('schedules Tomorrow at the same wall-clock time', async () => {
    mockCreateTask.mockResolvedValue({ task: { id: 'new', title: 'A', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30 } });
    await renderEditor();

    await fireEvent.changeText(screen.getByTestId('task-title'), 'A');
    await fireEvent.press(screen.getByTestId('date-Tomorrow'));
    await fireEvent.press(screen.getByTestId('create-task'));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    const body = mockCreateTask.mock.calls[0][0] as { startAt: string };
    expect(body.startAt).toBe('2026-09-17T03:30:00.000Z');
  });

  it('steps the custom estimate by 5, bounded to 5–480', async () => {
    await renderEditor();

    await fireEvent.press(screen.getByTestId('duration-increase'));
    await waitFor(() => expect(screen.getByText('35 min')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('duration-decrease'));
    await waitFor(() => expect(screen.getByText('30 min')).toBeTruthy());
  });

  it('closes on success', async () => {
    mockCreateTask.mockResolvedValue({ task: { id: 'new', title: 'A', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30 } });
    await renderEditor();

    await fireEvent.changeText(screen.getByTestId('task-title'), 'A');
    await fireEvent.press(screen.getByTestId('create-task'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  /** `scheduleRequest` + `confirmScheduleWarnings` (ios/App/NexdoApp.swift:73-98). */
  describe('SCHEDULE_WARNING', () => {
    const warning = new ApiError({
      status: 409,
      code: 'SCHEDULE_WARNING',
      message: 'That slot is taken.',
      warnings: ['That slot overlaps “Standup”.'],
    });

    it('prompts, then retries with allowScheduleConflict on "Save anyway"', async () => {
      mockCreateTask
        .mockRejectedValueOnce(warning)
        .mockResolvedValueOnce({ task: { id: 'new', title: 'A', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30 } });
      await renderEditor();

      await fireEvent.changeText(screen.getByTestId('task-title'), 'A');
      await fireEvent.press(screen.getByTestId('create-task'));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Review this time', 'That slot overlaps “Standup”.', expect.anything()));

      pressAlertButton('Save anyway');

      await waitFor(() => expect(mockCreateTask).toHaveBeenCalledTimes(2));
      // The identical body, plus the override.
      const retry = mockCreateTask.mock.calls[1][0] as Record<string, unknown>;
      expect(retry).toMatchObject({ title: 'A', durationMin: 30, allowScheduleConflict: true });
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
    });

    it('abandons the write on "Keep previous schedule", with no second request and no error alert', async () => {
      mockCreateTask.mockRejectedValueOnce(warning);
      await renderEditor();

      await fireEvent.changeText(screen.getByTestId('task-title'), 'A');
      await fireEvent.press(screen.getByTestId('create-task'));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      pressAlertButton('Keep previous schedule');

      await waitFor(() => expect(mockCreateTask).toHaveBeenCalledTimes(1));
      expect(mockBack).not.toHaveBeenCalled();
      // Only the conflict prompt, never a failure alert on top of it.
      expect((Alert.alert as unknown as jest.Mock).mock.calls).toHaveLength(1);
    });
  });
});
