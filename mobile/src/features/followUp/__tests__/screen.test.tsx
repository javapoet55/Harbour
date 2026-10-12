import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { NexdoTask, Profile } from '../../../api';
import { ApiError } from '../../../api/client';
import type { StoredTaskAction } from '../../../lib/taskAction';
import { useSession } from '../../../store/session';
import { palettes } from '../../../theme';

const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockSchedule = jest.fn();
const mockUpdateTask = jest.fn();
jest.mock('../../../api/followUp', () => ({
  ...jest.requireActual('../../../api/followUp'),
  followUpApi: {
    load: (...args: unknown[]) => mockLoad(...args),
    save: (...args: unknown[]) => mockSave(...args),
    schedule: (...args: unknown[]) => mockSchedule(...args),
  },
}));
jest.mock('../../../api', () => ({ ...jest.requireActual('../../../api'), endpoints: { updateTask: (...args: unknown[]) => mockUpdateTask(...args) } }));

import { FollowUpPreparationScreen } from '../FollowUpPreparationScreen';

/** `FollowUpPreparationView` (ios/App/FollowUpPreparationView.swift, 6f079c0). Captures `follow-up-*` (Mac, 0bb8212). */

const NOW = Date.parse('2026-10-12T16:00:00Z');
const ZONE = 'America/Los_Angeles';
const TASK: NexdoTask = { id: 't1', title: 'Follow up with Acme Insurance', status: 'PLANNED', priority: 'NORMAL', durationMin: 15, notes: 'Policy 123' };
const ACTION: StoredTaskAction = {
  id: 'a1',
  taskId: 't1',
  sourceTitle: TASK.title,
  type: 'followUp',
  contactName: 'Acme Insurance',
  preferredAction: null,
  context: 'Claim status',
  scheduledAt: null,
  snoozedUntil: null,
  contactIdentifier: null,
  status: 'awaitingApproval',
  executedAt: null,
};
const SAVED = { company: 'Acme Insurance', purpose: 'Claim status', phone: '9255550100', email: '', notes: 'Policy 123', draft: 'Hello', checklist: [{ id: 'c1', title: 'Have the policy number', done: true }], outcomes: [] };

const onSaved = jest.fn();
const onClose = jest.fn();

async function show(task = TASK, action = ACTION, initialContact: { name: string; phone: string; email: string } | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <FollowUpPreparationScreen action={action} initialContact={initialContact} now={() => NOW} onClose={onClose} onSaved={onSaved} task={task} zone={ZONE} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: ZONE } as Profile);
});

it('loads, seeding a new preparation from the action and the chosen contact', async () => {
  mockLoad.mockResolvedValue({ revision: 0, preparation: null });
  await show(TASK, ACTION, { name: 'Acme Claims', phone: '9255550100', email: 'claims@acme.example' });
  expect(screen.getByTestId('follow-up-loading')).toHaveTextContent('Loading preparation…');
  await waitFor(() => expect(screen.queryByTestId('follow-up-loading')).toBeNull());
  expect(screen.getByTestId('follow-up-company').props.value).toBe('Acme Claims');
  expect(screen.getByTestId('follow-up-phone').props.value).toBe('9255550100');
  expect(screen.getByTestId('follow-up-purpose').props.value).toBe('Claim status');
  expect(screen.getByTestId('follow-up-notes').props.value).toBe('Policy 123');
  expect(screen.getByTestId('follow-up-check-0').props.value).toBe('Confirm the purpose and desired result');
  expect(screen.getByTestId('follow-up-draft').props.value).toBe('Hello,\n\nI’m following up regarding Claim status. Could you please share an update and the next steps?\n\nThank you.');
  // No reminder and an open task: "Set or change follow-up time" starts on.
  expect(screen.getByTestId('follow-up-use-schedule').props.accessibilityState).toMatchObject({ checked: true });
  for (const header of ['Follow-up', 'Preparation notes', 'Checklist', 'Editable message draft', 'Record outcome']) expect(screen.getByText(header)).toBeTruthy();
  expect(screen.getByText('Save this preparation to your NexDo account. Call and email remain under your control.')).toBeTruthy();
});

it('a saved preparation wins, and Save preparation sends it with its revision', async () => {
  mockLoad.mockResolvedValue({ revision: 2, preparation: SAVED });
  mockSave.mockResolvedValue({ revision: 3, preparation: SAVED });
  mockSchedule.mockResolvedValue({ task: TASK });
  await show(TASK, { ...ACTION, scheduledAt: NOW + 86_400_000 });
  await waitFor(() => expect(screen.getByTestId('follow-up-company').props.value).toBe('Acme Insurance'));
  expect(screen.getByTestId('follow-up-scheduled')).toBeTruthy();
  expect(screen.getByTestId('follow-up-use-schedule').props.accessibilityState).toMatchObject({ checked: false });
  await fireEvent.press(screen.getByTestId('follow-up-save'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(mockSave).toHaveBeenCalledWith('t1', { revision: 2, preparation: SAVED });
  expect(mockSchedule).not.toHaveBeenCalled();
  expect(onSaved).toHaveBeenCalledWith(SAVED);
});

it('Save preparation is off until loaded, and without a company or purpose', async () => {
  let finish: (value: unknown) => void = () => undefined;
  mockLoad.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  await show();
  expect(screen.getByTestId('follow-up-save').props.accessibilityState).toMatchObject({ disabled: true });
  finish({ revision: 0, preparation: null });
  await waitFor(() => expect(screen.getByTestId('follow-up-save').props.accessibilityState).toMatchObject({ disabled: false }));
  await fireEvent.changeText(screen.getByTestId('follow-up-purpose'), '  ');
  expect(screen.getByTestId('follow-up-save').props.accessibilityState).toMatchObject({ disabled: true });
});

it('Record and complete task: appends the outcome, saves, then completes', async () => {
  mockLoad.mockResolvedValue({ revision: 1, preparation: SAVED });
  mockSave.mockImplementation(async (_id: string, envelope: { preparation: typeof SAVED }) => ({ revision: 2, preparation: envelope.preparation }));
  mockUpdateTask.mockResolvedValue({ task: { ...TASK, status: 'COMPLETED' } });
  await show();
  await waitFor(() => expect(screen.queryByTestId('follow-up-loading')).toBeNull());
  await fireEvent.changeText(screen.getByTestId('follow-up-outcome-notes'), 'Claim approved');
  // Choose Resolved through the picker's menu.
  await fireEvent.press(screen.getByTestId('follow-up-result'));
  await fireEvent.press(screen.getByText('Resolved'));
  await fireEvent.press(screen.getByTestId('follow-up-record-complete'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const sent = mockSave.mock.calls[0][1];
  expect(sent.revision).toBe(1);
  expect(sent.preparation.outcomes).toEqual([{ id: expect.any(String), date: '2026-10-12T16:00:00Z', result: 'resolved', notes: 'Claim approved' }]);
  expect(mockUpdateTask).toHaveBeenCalledWith('t1', { status: 'COMPLETED' });
});

it('Record and schedule next follow-up: a retry after a failure resends the same outcome', async () => {
  mockLoad.mockResolvedValue({ revision: 0, preparation: null });
  mockSave.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK', message: 'Nexdo could not reach the server.' }));
  await show();
  await waitFor(() => expect(screen.queryByTestId('follow-up-loading')).toBeNull());
  await fireEvent.press(screen.getByTestId('follow-up-record-schedule'));
  await waitFor(() => expect(screen.getByTestId('follow-up-error')).toHaveTextContent('Nexdo could not reach the server.'));
  const first = mockSave.mock.calls[0][1].preparation.outcomes;
  expect(first).toHaveLength(1);
  mockSave.mockImplementationOnce(async (_id: string, envelope: { preparation: typeof SAVED }) => ({ revision: 1, preparation: envelope.preparation }));
  mockSchedule.mockResolvedValue({ task: TASK });
  await fireEvent.press(screen.getByTestId('follow-up-record-schedule'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(mockSave.mock.calls[1][1].preparation.outcomes).toEqual(first);
  // An hour from now by default, the task's own 15 minutes.
  expect(mockSchedule).toHaveBeenCalledWith('t1', { startAt: '2026-10-12T17:00:00Z', durationMin: 15 });
});

it('a load failure offers Retry loading', async () => {
  mockLoad.mockRejectedValueOnce(new ApiError({ status: 404, message: 'Not found.' }));
  await show();
  await waitFor(() => expect(screen.getByTestId('follow-up-error')).toHaveTextContent('Not found.'));
  mockLoad.mockResolvedValueOnce({ revision: 0, preparation: null });
  await fireEvent.press(screen.getByTestId('follow-up-retry'));
  await waitFor(() => expect(screen.queryByTestId('follow-up-retry')).toBeNull());
  expect(screen.getByTestId('follow-up-save').props.accessibilityState).toMatchObject({ disabled: false });
});

it('a completed task shows the outcome history, newest first, and no Record outcome', async () => {
  const outcomes = [
    { id: 'o1', date: '2026-10-01T16:00:00Z', result: 'noAnswer', notes: 'Voicemail' },
    { id: 'o2', date: '2026-10-05T16:00:00Z', result: 'resolved', notes: 'Approved' },
  ];
  mockLoad.mockResolvedValue({ revision: 4, preparation: { ...SAVED, outcomes } });
  await show({ ...TASK, status: 'COMPLETED' });
  await waitFor(() => expect(screen.getByTestId('follow-up-history')).toBeTruthy());
  expect(screen.queryByText('Record outcome')).toBeNull();
  const titles = screen.getAllByText(/^(Resolved|No answer)$/).map((node) => node.props.children);
  expect(titles).toEqual(['Resolved', 'No answer']);
});

it('Create draft from purpose rebuilds the draft; Add takes a new step', async () => {
  mockLoad.mockResolvedValue({ revision: 0, preparation: null });
  await show();
  await waitFor(() => expect(screen.queryByTestId('follow-up-loading')).toBeNull());
  await fireEvent.changeText(screen.getByTestId('follow-up-purpose'), 'the refund');
  await fireEvent.press(screen.getByTestId('follow-up-create-draft'));
  expect(screen.getByTestId('follow-up-draft').props.value).toContain('regarding the refund.');
  expect(screen.getByTestId('follow-up-add-check').props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.changeText(screen.getByTestId('follow-up-new-check'), 'Bring the receipt');
  await fireEvent.press(screen.getByTestId('follow-up-add-check'));
  expect(screen.getByTestId('follow-up-check-4').props.value).toBe('Bring the receipt');
});

/** Captures `follow-up-outcome-history`, `-saved`: the sheet's buttons and Close are ink, not the tint. */
it('draws its button rows in ink, grey while disabled, and the notes three lines tall', async () => {
  mockLoad.mockResolvedValue({ revision: 0, preparation: null });
  await show();
  await waitFor(() => expect(screen.queryByTestId('follow-up-loading')).toBeNull());
  const colour = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style).color;
  expect(colour('Save preparation')).toBe(palettes.light.ink);
  expect(colour('Create draft from purpose')).toBe(palettes.light.ink);
  expect(colour('Close')).toBe(palettes.light.ink);
  expect(colour('Add')).toBe('rgba(60, 60, 67, 0.3)');
  expect(StyleSheet.flatten(screen.getByTestId('follow-up-notes').props.style).minHeight).toBe(88);
});

/** Phone parity pass 4: an unfocused step title reads from its start; the Result label keeps its width. */
it('parks a step title at its start until focused, and keeps the Result label beside its pill', async () => {
  mockLoad.mockResolvedValue({ revision: 0, preparation: null });
  await show();
  await waitFor(() => expect(screen.queryByTestId('follow-up-loading')).toBeNull());
  const step = screen.getByTestId('follow-up-check-0');
  expect(step.props.selection).toEqual({ start: 0, end: 0 });
  await fireEvent(step, 'focus');
  expect(screen.getByTestId('follow-up-check-0').props.selection).toBeUndefined();
  const label = StyleSheet.flatten(screen.getByText('Result').props.style);
  expect(label).toMatchObject({ flexShrink: 0, maxWidth: '60%' });
});

/**
 * Parity pass 4 (§39): saving turned the wrapper's pointerEvents to 'none'; a flattened wrapper then had
 * to be created and the keyboard-aware scroll view moved into it, which Fabric refused on Android
 * (`addViewAt: … already has a parent`). The wrapper is never flattened.
 */
it('keeps the busy wrapper a real view, so disabling it never re-parents the form', async () => {
  mockLoad.mockResolvedValue({ revision: 0, preparation: null });
  await show();
  await waitFor(() => expect(screen.queryByTestId('follow-up-loading')).toBeNull());
  const wrapper = screen.getByTestId('follow-up-form').parent;
  const real = (node: typeof wrapper): boolean => node !== null && (node.props.collapsable === false || real(node.parent));
  expect(real(wrapper)).toBe(true);
});
