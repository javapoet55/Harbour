import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';

import type { Profile } from '../api';
import { morningEmailExplanation } from '../lib/profileSettings';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

const mockEndpoints = { passwordResetConfirm: jest.fn() };
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { passwordResetConfirm: (...args: unknown[]) => mockEndpoints.passwordResetConfirm(...args) },
}));

import { useConfirmPasswordReset } from './useAuth';
import { CALLBACK_UNCONFIRMED, CALLBACK_UNEXPECTED, parseCalendarCallback, parseGoogleCallback } from './useCalendar';

/** Phase 13 profile and settings model: 08be688, 12bb9d4 and 4185501. */

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));
beforeEach(() => {
  mockEndpoints.passwordResetConfirm.mockReset().mockResolvedValue({ ok: true });
  useSession.getState().clear();
});

async function renderHook<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(queryClient);
  const result: { current: T | undefined } = { current: undefined };
  function Probe() {
    result.current = hook();
    return null;
  }
  await render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  return { queryClient, result: result as { current: T } };
}

/** The cases are Swift's own: ios/Tests/NexdoCoreTests/SettingsFixesTests.swift (08be688). */
describe('CalendarOAuthResult', () => {
  // microsoftCalendarCallbackUsesItsOwnProvider
  it('confirms only the provider that was connected', () => {
    const callback = 'nexdo://calendar-connected?calendar=microsoft-connected';
    expect(parseCalendarCallback(callback, 'Microsoft')).toEqual({ kind: 'connected' });
    expect(parseCalendarCallback(callback)).toEqual({ kind: 'failed', message: CALLBACK_UNCONFIRMED });
    expect(parseCalendarCallback('nexdo://calendar-connected?calendar=error', 'Microsoft')).toEqual({ kind: 'failed', message: 'Microsoft Calendar connection failed: authorization failed' });
  });

  // calendarCallbackMustConfirmTheExpectedConnection
  it('needs the expected connection confirmed, from Nexdo’s own link', () => {
    for (const raw of ['nexdo://calendar-connected', 'nexdo://calendar-connected?calendar=unsupported', 'nexdo://calendar-connected?calendar=google-cancelled']) {
      expect(parseGoogleCallback(raw)).toEqual({ kind: 'failed', message: CALLBACK_UNCONFIRMED });
    }
    for (const raw of ['https://calendar-connected?calendar=google-connected', 'nexdo://other?calendar=google-connected']) {
      expect(parseGoogleCallback(raw)).toEqual({ kind: 'failed', message: CALLBACK_UNEXPECTED });
    }
  });

  it('reads Android’s triple-slash form of the same link, and no callback as cancelled', () => {
    expect(parseGoogleCallback('nexdo:///calendar-connected?calendar=google-connected')).toEqual({ kind: 'connected' });
    expect(parseGoogleCallback(null)).toEqual({ kind: 'cancelled' });
  });
});

describe('password reset while signed in (4185501)', () => {
  it('ends the session, like Change password', async () => {
    useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
    const closed = jest.fn(async () => undefined);
    const { result, queryClient } = await renderHook(() => useConfirmPasswordReset({ beforeSessionEnds: closed }));
    queryClient.setQueryData(queryKeys.tasks.all(), { tasks: [] });
    await act(async () => {
      await result.current.mutateAsync({ email: 'ada@example.com', code: '123456', password: 'a long new password' });
    });
    expect(closed).toHaveBeenCalled();
    expect(useSession.getState().status).toBe('signedOut');
    expect(queryClient.getQueryData(queryKeys.tasks.all())).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.me())).toBeNull();
  });

  it('changes nothing else when signed out', async () => {
    const closed = jest.fn(async () => undefined);
    const { result } = await renderHook(() => useConfirmPasswordReset({ beforeSessionEnds: closed }));
    await act(async () => {
      await result.current.mutateAsync({ email: 'ada@example.com', code: '123456', password: 'a long new password' });
    });
    expect(closed).not.toHaveBeenCalled();
    expect(mockEndpoints.passwordResetConfirm).toHaveBeenCalledWith('ada@example.com', '123456', 'a long new password');
  });

  it('keeps the session when the reset fails', async () => {
    useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
    mockEndpoints.passwordResetConfirm.mockRejectedValue(new Error('That verification code is invalid, expired, or already used.'));
    const { result } = await renderHook(() => useConfirmPasswordReset());
    await act(async () => {
      await result.current.mutateAsync({ email: 'ada@example.com', code: '000000', password: 'a long new password' }).catch(() => undefined);
    });
    expect(useSession.getState().status).toBe('signedIn');
  });
});

it('explains the morning email in the profile zone', () => {
  expect(morningEmailExplanation('ada@example.com', 'Asia/Kolkata', 'America/Los_Angeles')).toBe(
    'Today’s tasks, calendar events and conflicts, sent to ada@example.com at 6:00 a.m. in Asia/Kolkata. Email notifications must also be enabled.',
  );
  expect(morningEmailExplanation(null, null, 'America/Los_Angeles')).toContain('sent to your profile email at 6:00 a.m. in America/Los_Angeles.');
});
