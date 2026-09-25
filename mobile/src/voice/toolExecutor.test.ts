import { QueryClient } from '@tanstack/react-query';

import type { NexdoTask } from '../api';
import { queryKeys } from '../query/keys';
import { resetRevisions } from '../query/taskRevision';
import { useCalendarNotice } from '../store/calendarNotice';
import { VoiceToolExecutor } from './toolExecutor';

const mockRequest = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  getApi: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
}));

/** `VoiceToolExecutor` (ios/App/VoiceToolExecutor.swift) + `executeVoiceTool` (NexdoApp.swift:481-493). */

const OWNER = 'user-1';

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

function build({
  scope = 'general' as 'general' | 'calendar',
  currentOwnerId = () => OWNER as string | undefined,
  consent = () => ({ ai: true, voice: true }),
  resolve = jest.fn(),
  tasks = [] as NexdoTask[],
} = {}) {
  // `gcTime: 0` so the cache schedules no garbage-collection timer. Without it every cached query
  // leaves a five-minute `setTimeout` behind and Jest force-exits the worker.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClient.setQueryData(queryKeys.tasks.all(), { tasks, timeZone: 'Asia/Kolkata' });
  let ids = 0;
  const executor = new VoiceToolExecutor({
    queryClient,
    ownerId: OWNER,
    scope,
    consent,
    currentOwnerId,
    uuid: () => `token-${++ids}`,
    resolve: resolve as never,
  });
  return { executor, queryClient, resolve };
}

beforeEach(() => {
  mockRequest.mockReset();
  resetRevisions();
  useCalendarNotice.setState({ notice: null });
});

describe('the server round trip', () => {
  it('POSTs the exact body Swift builds', async () => {
    mockRequest.mockResolvedValue({ success: true });
    const { executor } = build();

    await executor.execute({ name: 'create_task', args: { title: 'Ship it' }, sessionId: 's1', callId: 'c1' });

    expect(mockRequest).toHaveBeenCalledWith('/api/realtime/tool', {
      method: 'POST',
      body: { consent: true, scope: 'general', sessionId: 's1', callId: 'c1', name: 'create_task', arguments: { title: 'Ship it' } },
      timeoutMs: 30_000,
    });
  });

  it('reconciles a returned task into the cache', async () => {
    mockRequest.mockResolvedValue({ success: true, task: task({ id: 't1', title: 'Saved by voice' }) });
    const { executor, queryClient } = build();

    await executor.execute({ name: 'create_task', args: {}, sessionId: 's1', callId: 'c1' });

    const cached = queryClient.getQueryData<{ tasks: NexdoTask[] }>(queryKeys.tasks.all());
    expect(cached?.tasks.find((item) => item.id === 't1')?.title).toBe('Saved by voice');
  });

  it('removes a deleted task from the cache', async () => {
    mockRequest.mockResolvedValue({ success: true, task: task({ id: 't1' }) });
    const { executor, queryClient } = build({ tasks: [task({ id: 't1' }), task({ id: 't2' })] });

    await executor.execute({ name: 'delete_task', args: { taskId: 't1' }, sessionId: 's1', callId: 'c1' });

    const cached = queryClient.getQueryData<{ tasks: NexdoTask[] }>(queryKeys.tasks.all());
    expect(cached?.tasks.map((item) => item.id)).toEqual(['t2']);
  });

  it('refreshes the agenda after a calendar event, as Swift’s `await refresh()` does', async () => {
    mockRequest.mockResolvedValue({ success: true });
    const { executor, queryClient } = build();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await executor.execute({ name: 'create_calendar_event', args: {}, sessionId: 's1', callId: 'c1' });

    expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual(
      expect.arrayContaining([queryKeys.agenda.all(), queryKeys.calendar.all()]),
    );
  });

  it('publishes where a voice-created event went, for this account', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      calendarPush: { status: 'failed', total: 1, succeeded: 0, calendarName: 'Work' },
      message: 'Saved in Nexdo, but it could not be added to your connected calendar. No invitations were sent.',
      warnings: ['Saved in Nexdo, but it could not be added to your connected calendar.'],
    });
    const { executor } = build({ scope: 'calendar' });

    await executor.execute({ name: 'create_calendar_event', args: {}, sessionId: 's1', callId: 'c1' });

    expect(useCalendarNotice.getState().notice).toEqual({
      ownerId: OWNER,
      message: 'Saved in Nexdo, but it could not be added to your connected calendar. No invitations were sent.',
      calendarName: 'Work',
      warnings: ['Saved in Nexdo, but it could not be added to your connected calendar.'],
      tone: 'warning',
    });
  });

  it('publishes no note for another tool, or when the account changed mid-call', async () => {
    const push = { success: true, calendarPush: { status: 'pushed', total: 1, succeeded: 1 }, message: 'Saved in Nexdo and added it to your connected calendar.' };
    mockRequest.mockResolvedValue(push);
    await build().executor.execute({ name: 'create_task', args: {}, sessionId: 's1', callId: 'c1' });
    expect(useCalendarNotice.getState().notice).toBeNull();

    let owner: string | undefined = OWNER;
    mockRequest.mockImplementation(async () => {
      owner = 'someone-else';
      return push;
    });
    await build({ currentOwnerId: () => owner }).executor.execute({ name: 'create_calendar_event', args: {}, sessionId: 's1', callId: 'c2' });
    expect(useCalendarNotice.getState().notice).toBeNull();
  });

  /** "Only reconcile this account." (NexdoApp.swift:486) */
  it('does not touch the cache when the account changed mid-call', async () => {
    mockRequest.mockResolvedValue({ success: true, task: task({ id: 't1', title: 'Wrong account' }) });
    let owner: string | undefined = OWNER;
    const { executor, queryClient } = build({ currentOwnerId: () => owner });
    mockRequest.mockImplementation(async () => {
      owner = 'someone-else';
      return { success: true, task: task({ id: 't1', title: 'Wrong account' }) };
    });

    await executor.execute({ name: 'create_task', args: {}, sessionId: 's1', callId: 'c1' });

    const cached = queryClient.getQueryData<{ tasks: NexdoTask[] }>(queryKeys.tasks.all());
    expect(cached?.tasks).toEqual([]);
  });
});

/** The owner and consent guard (VoiceToolExecutor.swift:13). */
describe('the guard', () => {
  it.each([
    ['a different account', { currentOwnerId: () => 'someone-else' }],
    ['no AI consent', { consent: () => ({ ai: false, voice: true }) }],
    ['no voice consent', { consent: () => ({ ai: true, voice: false }) }],
  ])('refuses with %s, before any request', async (_label, options) => {
    const { executor } = build(options);

    await expect(executor.execute({ name: 'create_task', args: {}, sessionId: 's1', callId: 'c1' })).rejects.toThrow(/session has expired/);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

/** `calendarOnly` (VoiceToolExecutor.swift:17-19). */
describe('the calendar scope', () => {
  it.each(['get_current_time', 'create_calendar_event', 'get_schedule', 'find_free_time'])('allows %s', async (name) => {
    mockRequest.mockResolvedValue({ success: true });
    const { executor } = build({ scope: 'calendar' });

    await executor.execute({ name, args: {}, sessionId: 's1', callId: 'c1' });

    expect(mockRequest).toHaveBeenCalled();
  });

  it.each(['create_task', 'update_task', 'delete_task', 'prepare_call'])('refuses %s with Swift’s message', async (name) => {
    const { executor } = build({ scope: 'calendar' });

    const result = await executor.execute({ name, args: {}, sessionId: 's1', callId: 'c1' });

    expect(result).toEqual({ success: false, error: 'This screen creates appointments and events only.' });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sends the scope on every tool', async () => {
    mockRequest.mockResolvedValue({ success: true });
    const { executor } = build({ scope: 'calendar' });

    await executor.execute({ name: 'get_schedule', args: {}, sessionId: 's1', callId: 'c1' });

    expect(mockRequest).toHaveBeenCalledWith('/api/realtime/tool', expect.objectContaining({ body: expect.objectContaining({ scope: 'calendar' }) }));
  });
});

/** `prepare_call` / `prepare_email` (VoiceToolExecutor.swift:20-30). */
describe('the contact tools', () => {
  const DAMIEN = { id: 'c1', name: 'Damien Hall', phones: [{ id: 'p1', label: 'mobile', value: '+15551234567' }], emails: [] };
  const ANA = { id: 'c2', name: 'Ana Ruiz', phones: [], emails: [{ id: 'e1', label: 'work', value: 'ana@example.com' }] };

  it('NEVER sends a phone number or an email address to the model', async () => {
    const resolve = jest.fn().mockResolvedValue([DAMIEN]);
    const { executor } = build({ resolve });

    const result = (await executor.execute({ name: 'prepare_call', args: { contactName: 'Damien' }, sessionId: 's1', callId: 'c1' })) as Record<
      string,
      unknown
    >;

    expect(JSON.stringify(result)).not.toContain('+15551234567');
    expect(result.candidates).toEqual([{ candidateId: 'token-1', name: 'Damien Hall' }]);
    expect(result).toMatchObject({ success: true, moreMatches: false, requiresUserApproval: true });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('filters by the channel the tool asked for', async () => {
    const resolve = jest.fn().mockResolvedValue([DAMIEN, ANA]);
    const { executor } = build({ resolve });

    const call = (await executor.execute({ name: 'prepare_call', args: { contactName: 'x' }, sessionId: 's1', callId: 'c1' })) as Record<string, unknown>;
    expect(call.candidates).toEqual([{ candidateId: 'token-1', name: 'Damien Hall' }]);

    const email = (await executor.execute({ name: 'prepare_email', args: { contactName: 'x' }, sessionId: 's1', callId: 'c2' })) as Record<string, unknown>;
    expect(email.candidates).toEqual([{ candidateId: 'token-2', name: 'Ana Ruiz' }]);
  });

  it('reports moreMatches past five', async () => {
    const resolve = jest.fn().mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({ ...DAMIEN, id: `c${index}` })));
    const { executor } = build({ resolve });

    const result = (await executor.execute({ name: 'prepare_call', args: { contactName: 'x' }, sessionId: 's1', callId: 'c1' })) as Record<string, unknown>;

    expect((result.candidates as unknown[]).length).toBe(5);
    expect(result.moreMatches).toBe(true);
  });

  it('resolves a candidate token without searching again, and places no call', async () => {
    const resolve = jest.fn().mockResolvedValue([DAMIEN]);
    const { executor } = build({ resolve });
    await executor.execute({ name: 'prepare_call', args: { contactName: 'Damien' }, sessionId: 's1', callId: 'c1' });
    resolve.mockClear();

    const result = (await executor.execute({
      name: 'prepare_call',
      args: { contactName: 'Damien', candidateId: 'token-1' },
      sessionId: 's1',
      callId: 'c2',
    })) as Record<string, unknown>;

    expect(resolve).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, prepared: true, contactName: 'Damien Hall', requiresUserApproval: true });
    expect(result.message).toMatch(/No call was placed and no email sent/);
  });

  it('rejects a missing or over-long name', async () => {
    const { executor } = build();
    await expect(executor.execute({ name: 'prepare_call', args: {}, sessionId: 's1', callId: 'c1' })).rejects.toThrow(/arguments were invalid/);
    await expect(
      executor.execute({ name: 'prepare_call', args: { contactName: 'x'.repeat(201) }, sessionId: 's1', callId: 'c1' }),
    ).rejects.toThrow(/arguments were invalid/);
  });

  it('clear() forgets the tokens', async () => {
    const resolve = jest.fn().mockResolvedValue([DAMIEN]);
    const { executor } = build({ resolve });
    await executor.execute({ name: 'prepare_call', args: { contactName: 'Damien' }, sessionId: 's1', callId: 'c1' });

    executor.clear();
    resolve.mockResolvedValue([DAMIEN]);
    const result = (await executor.execute({
      name: 'prepare_call',
      args: { contactName: 'Damien', candidateId: 'token-1' },
      sessionId: 's1',
      callId: 'c2',
    })) as Record<string, unknown>;

    // The token is gone, so it searches again rather than reusing a stale contact.
    expect(resolve).toHaveBeenCalled();
    expect(result.prepared).toBeUndefined();
  });
});
