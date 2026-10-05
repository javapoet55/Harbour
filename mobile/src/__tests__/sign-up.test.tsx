jest.mock('../lib/signupChallenge', () => ({
  SECURITY_CHECK_MESSAGE: 'Please complete the security check and try again.',
  signupChallenge: jest.fn().mockResolvedValue(undefined),
}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../api/client';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockRegister = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { register: (...args: unknown[]) => mockRegister(...args) },
}));

import SignUp from '../../app/(auth)/sign-up';

async function renderSignUp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return await render(
    <QueryClientProvider client={queryClient}>
      <SignUp />
    </QueryClientProvider>,
  );
}

async function fillIn() {
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Sri Ram');
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'a-long-enough-password');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'a-long-enough-password');
  await waitFor(() => expect(screen.getByLabelText('Create Account').props.accessibilityState.disabled).toBe(false));
}

/**
 * `SignUpView` keeps ONE `localError` string (RootView.swift:479, 531-532) and renders it as a single
 * red footnote under the card. It does not attach server messages to individual fields, so neither
 * does this screen — a Phase 2 deviation reverted in Phase 3.
 */
describe('sign-up server errors', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    'An account with this email already exists.',
    'Use a password with at least 12 characters.',
    'The request could not be completed (500). Refresh to check the current state before retrying.',
  ])('shows %s once, in the single inline slot', async (message) => {
    mockRegister.mockRejectedValue(new ApiError({ status: 400, message }));
    await renderSignUp();
    await fillIn();

    await fireEvent.press(screen.getByLabelText('Create Account'));

    // Exactly one node carries the message: no per-field copy alongside the footnote.
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(1));
  });
});

/**
 * `SignUpView.create()` (RootView.swift:674-693): the security check runs under its own
 * `checkingSignup` flag. The button is disabled while the browser check is open but still reads
 * "Create Account"; "Creating Account…" is `model.busy`, the register call. The token the check
 * returns is sent with the registration, and a failed check shows Swift's one message.
 */
describe('the security check before registering', () => {
  const challenge = jest.requireMock('../lib/signupChallenge').signupChallenge as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    challenge.mockResolvedValue(undefined);
  });

  it('keeps "Create Account", disabled, while the browser check is open', async () => {
    let finish: (token: string) => void = () => undefined;
    challenge.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    let register: (value: unknown) => void = () => undefined;
    mockRegister.mockReturnValue(new Promise((resolve) => (register = resolve)));
    await renderSignUp();
    await fillIn();

    await fireEvent.press(screen.getByLabelText('Create Account'));
    await waitFor(() => expect(screen.getByLabelText('Create Account').props.accessibilityState.disabled).toBe(true));
    expect(screen.queryByLabelText('Creating Account…')).toBeNull();
    expect(mockRegister).not.toHaveBeenCalled();

    finish('turnstile-token');
    await waitFor(() => expect(screen.getByLabelText('Creating Account…')).toBeTruthy());
    expect(mockRegister).toHaveBeenCalledWith('Sri Ram', 'person@example.com', 'a-long-enough-password', undefined, 'turnstile-token');
    register({ email: 'person@example.com', emailVerificationRequired: true, emailSent: true });
  });

  it("shows Swift's message when the check fails, and does not register", async () => {
    challenge.mockRejectedValue(new Error('Please complete the security check and try again.'));
    await renderSignUp();
    await fillIn();

    await fireEvent.press(screen.getByLabelText('Create Account'));
    await waitFor(() => expect(screen.getAllByText('Please complete the security check and try again.')).toHaveLength(1));
    expect(mockRegister).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('Create Account').props.accessibilityState.disabled).toBe(false));
  });
});
