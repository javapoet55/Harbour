import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';

import type { AssistantTurn } from '../api';
import { useAssistantStore } from '../store/assistant';
import { useConsent } from '../store/consent';
import { queryKeys } from './keys';

const mockAssistant = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { assistant: (...args: unknown[]) => mockAssistant(...args) },
}));

import { AskRefused, useAsk } from './useAssistant';

function turn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
  return {
    spoken: 'Here is your day.',
    visual: { summary: 'Here is your day.', sections: [{ title: 'Today', items: ['Pack the boxes'] }] },
    contextActionId: 'ctx-1',
    confirmation: null,
    executive: null,
    ...overrides,
  };
}

/**
 * `useAsk` needs a mounted component and a query client. `renderHook` is not used: this project's
 * React 19 setup renders through a concurrent root, and `await render(...)` is the flush every other
 * screen test here relies on.
 */
async function harness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const result: { current: ReturnType<typeof useAsk> } = { current: null as unknown as ReturnType<typeof useAsk> };

  function Probe() {
    result.current = useAsk();
    return null;
  }

  await render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(result.current).toBeTruthy());
  return { result, invalidate };
}

beforeEach(() => {
  mockAssistant.mockReset();
  useAssistantStore.getState().reset();
  useConsent.setState({ ai: true, voice: false });
});

it('stores the turn, the prompt and the thread handle on success', async () => {
  mockAssistant.mockResolvedValue(turn());
  const { result } = await harness();

  await act(async () => {
    await result.current.mutateAsync({ text: 'Nexdo, brief me for the next 5 days.' });
  });

  const state = useAssistantStore.getState();
  expect(state.turn?.spoken).toBe('Here is your day.');
  expect(state.lastAssistantPrompt).toBe('Nexdo, brief me for the next 5 days.');
  expect(state.contextId).toBe('ctx-1');
  expect(mockAssistant).toHaveBeenCalledWith({
    transcript: 'Nexdo, brief me for the next 5 days.',
    contextActionId: undefined,
    confirmActionId: undefined,
    rejectActionId: undefined,
  });
});

it('sends the stored contextActionId on the next turn', async () => {
  mockAssistant.mockResolvedValue(turn({ contextActionId: 'ctx-2' }));
  const { result } = await harness();

  await act(async () => {
    await result.current.mutateAsync({ text: 'first' });
  });
  await act(async () => {
    await result.current.mutateAsync({ text: 'second' });
  });

  expect(mockAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: 'second', contextActionId: 'ctx-2' }));
});

/** `guard aiConsent … else { return false }` (ios/App/NexdoApp.swift:695): no request at all. */
it('refuses without AI consent and never calls the server', async () => {
  useConsent.setState({ ai: false, voice: false });
  const { result } = await harness();

  await expect(result.current.mutateAsync({ text: 'anything' })).rejects.toBeInstanceOf(AskRefused);
  expect(mockAssistant).not.toHaveBeenCalled();
});

it('refuses an empty prompt and one over 4,000 characters', async () => {
  const { result } = await harness();

  await expect(result.current.mutateAsync({ text: '   ' })).rejects.toBeInstanceOf(AskRefused);
  await expect(result.current.mutateAsync({ text: 'x'.repeat(4001) })).rejects.toBeInstanceOf(AskRefused);
  expect(mockAssistant).not.toHaveBeenCalled();
});

describe('a pending proposal', () => {
  const PROPOSAL = turn({
    confirmation: { actionId: 'act-9', prompt: 'Move two tasks?' },
    executive: {
      proposedScheduleChanges: [
        { taskId: 't1', title: 'Pack boxes', before: null, after: 'Tomorrow 10:00', durationMin: 30, reason: 'Frees this evening' },
      ],
    },
  });

  it('approves with confirmActionId and reloads everything the assistant may have changed', async () => {
    mockAssistant.mockResolvedValueOnce(PROPOSAL).mockResolvedValueOnce(turn());
    const { result, invalidate } = await harness();

    await act(async () => {
      await result.current.mutateAsync({ text: 'Plan my week' });
    });
    invalidate.mockClear();
    await act(async () => {
      await result.current.mutateAsync({ text: 'yes', accept: true });
    });

    expect(mockAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({ transcript: 'yes', confirmActionId: 'act-9', rejectActionId: undefined }),
    );
    const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        queryKeys.tasks.all(),
        queryKeys.agenda.all(),
        queryKeys.scheduleIntelligence(),
        queryKeys.calendar.all(),
      ]),
    );
  });

  /**
   * DIVERGENCE from the brief, which expected rejecting to be local: Swift's
   * `AskResponseView` "Keep my current plan" calls `model.ask("no", accept: false)`
   * (ios/App/AskResponseView.swift:62), which POSTs `rejectActionId`. The proposal is server-side
   * state, so declining it is a request. Following Swift.
   */
  it('rejects with rejectActionId, and does NOT reload task data', async () => {
    mockAssistant.mockResolvedValueOnce(PROPOSAL).mockResolvedValueOnce(turn());
    const { result, invalidate } = await harness();

    await act(async () => {
      await result.current.mutateAsync({ text: 'Plan my week' });
    });
    invalidate.mockClear();
    await act(async () => {
      await result.current.mutateAsync({ text: 'no', accept: false });
    });

    expect(mockAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({ transcript: 'no', rejectActionId: 'act-9', confirmActionId: undefined }),
    );
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('answers nothing when there is no proposal to answer', async () => {
    mockAssistant.mockResolvedValue(turn());
    const { result } = await harness();

    await act(async () => {
      await result.current.mutateAsync({ text: 'Plan my week' });
    });
    mockAssistant.mockClear();

    await expect(result.current.mutateAsync({ text: 'yes', accept: true })).rejects.toBeInstanceOf(AskRefused);
    expect(mockAssistant).not.toHaveBeenCalled();
  });
});

/** `if accept == true || result.createdTaskId != nil` (NexdoApp.swift:704). */
it('reloads when a plain question created a task', async () => {
  mockAssistant.mockResolvedValue(turn({ createdTaskId: 'new-task' }));
  const { result, invalidate } = await harness();

  await act(async () => {
    await result.current.mutateAsync({ text: 'Remind me to call Damien tomorrow at 11 AM.' });
  });

  await waitFor(() => expect(invalidate).toHaveBeenCalled());
  expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual(expect.arrayContaining([queryKeys.tasks.all()]));
});

/** `withdrawConsent()` (NexdoApp.swift:720) clears the answer as well as the flags. */
it('withdrawing consent clears the turn, the prompt and the thread handle', async () => {
  mockAssistant.mockResolvedValue(turn());
  const { result } = await harness();

  await act(async () => {
    await result.current.mutateAsync({ text: 'Plan my week' });
  });
  act(() => useConsent.getState().withdraw());

  expect(useAssistantStore.getState()).toMatchObject({ turn: null, lastAssistantPrompt: null, contextId: null });
  expect(useConsent.getState()).toMatchObject({ ai: false, voice: false });
});
