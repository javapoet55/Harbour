import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';

import { ApiError } from '../api/client';

const mockEndpoints = { register: jest.fn(), passwordResetRequest: jest.fn(), accountExists: jest.fn() };
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    register: (...args: unknown[]) => mockEndpoints.register(...args),
    passwordResetRequest: (...args: unknown[]) => mockEndpoints.passwordResetRequest(...args),
    accountExists: (...args: unknown[]) => mockEndpoints.accountExists(...args),
  },
}));

import { accountExists, useRequestPasswordReset, useSignUp } from './useAuth';

/** Phase 14: register's 409 and the reset request's 404 come back from the hooks as typed results. */

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));
beforeEach(() => Object.values(mockEndpoints).forEach((mock) => mock.mockReset()));

async function renderHook<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
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
  return result as { current: T };
}

const SIGN_UP = { name: 'Sri', email: 'person@example.com', password: 'pw' };

describe('useSignUp', () => {
  it('returns accountExists for a 409, with the email that was sent', async () => {
    mockEndpoints.register.mockRejectedValue(new ApiError({ status: 409, message: 'An account with this email already exists. Sign in or reset your password.' }));
    const hook = await renderHook(useSignUp);

    let result: unknown;
    await act(async () => {
      result = await hook.current.mutateAsync(SIGN_UP);
    });

    expect(result).toEqual({ kind: 'accountExists', email: 'person@example.com', message: 'An account with this email already exists. Sign in or reset your password.' });
  });

  it('still throws other failures', async () => {
    mockEndpoints.register.mockRejectedValue(new ApiError({ status: 400, message: 'Enter a password (72 bytes maximum).' }));
    const hook = await renderHook(useSignUp);

    await act(async () => {
      await expect(hook.current.mutateAsync(SIGN_UP)).rejects.toThrow('Enter a password (72 bytes maximum).');
    });
  });

  it('returns verify with the pending verification, or signedIn', async () => {
    mockEndpoints.register.mockResolvedValueOnce({ email: 'person@example.com', emailVerificationRequired: true, emailSent: false, verificationProof: 'p' });
    mockEndpoints.register.mockResolvedValueOnce({ email: 'person@example.com', emailVerificationRequired: false });
    const hook = await renderHook(useSignUp);

    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = await hook.current.mutateAsync(SIGN_UP);
      second = await hook.current.mutateAsync(SIGN_UP);
    });

    expect(first).toEqual({ kind: 'verify', pending: { email: 'person@example.com', reason: 'codeNotSent', verificationProof: 'p' } });
    expect(second).toEqual({ kind: 'signedIn' });
  });
});

describe('useRequestPasswordReset', () => {
  it('returns unknownEmail for a 404', async () => {
    mockEndpoints.passwordResetRequest.mockRejectedValue(new ApiError({ status: 404, message: 'We don’t have an account with this email address. Check the address or create an account.' }));
    const hook = await renderHook(useRequestPasswordReset);

    let result: unknown;
    await act(async () => {
      result = await hook.current.mutateAsync({ email: 'nobody@example.com' });
    });

    expect(result).toEqual({ kind: 'unknownEmail', message: 'We don’t have an account with this email address. Check the address or create an account.' });
  });

  it('returns sent with the server message', async () => {
    mockEndpoints.passwordResetRequest.mockResolvedValue({ message: 'A six-digit verification code has been sent to your email.', delivered: true });
    const hook = await renderHook(useRequestPasswordReset);

    let result: unknown;
    await act(async () => {
      result = await hook.current.mutateAsync({ email: 'person@example.com' });
    });

    expect(result).toEqual({ kind: 'sent', message: 'A six-digit verification code has been sent to your email.' });
  });

  it('still throws other failures', async () => {
    mockEndpoints.passwordResetRequest.mockRejectedValue(new ApiError({ status: 429, message: 'Too many attempts. Please try again later.' }));
    const hook = await renderHook(useRequestPasswordReset);

    await act(async () => {
      await expect(hook.current.mutateAsync({ email: 'person@example.com' })).rejects.toThrow('Too many attempts. Please try again later.');
    });
  });
});

it('accountExists reads the flag', async () => {
  mockEndpoints.accountExists.mockResolvedValue({ exists: false });
  await expect(accountExists('person@example.com')).resolves.toBe(false);
  expect(mockEndpoints.accountExists).toHaveBeenCalledWith('person@example.com');
});
