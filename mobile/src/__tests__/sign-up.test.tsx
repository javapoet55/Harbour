jest.mock('../lib/signupChallenge', () => ({
  ...jest.requireActual('../lib/signupChallenge'),
  signupChallenge: jest.fn().mockResolvedValue(undefined),
}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Platform, StyleSheet } from 'react-native';

import { ApiError } from '../api/client';
import { SECURITY_CHECK_CANCELLED, SignupChallengeCancelled } from '../lib/signupChallenge';
import { palettes } from '../theme';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
}));

const mockRegister = jest.fn();
const mockAccountExists = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    register: (...args: unknown[]) => mockRegister(...args),
    accountExists: (...args: unknown[]) => mockAccountExists(...args),
  },
}));

import SignUp, { EXISTING_ACCOUNT_MESSAGE, EXISTING_ACCOUNT_TITLE, resetExistingAccountAlert } from '../../app/(auth)/sign-up';

/**
 * Create Account, redesigned in Phase 14 (ios/App/RootView.swift:618-797; captures `sign-up-v4`,
 * `-keyboard`, `-filled`, `-passwords-mismatch`, `sign-up-existing-account-alert`).
 */

const challenge = jest.requireMock('../lib/signupChallenge').signupChallenge as jest.Mock;
let alert: jest.SpyInstance;

async function renderSignUp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return await render(
    <QueryClientProvider client={queryClient}>
      <SignUp />
    </QueryClientProvider>,
  );
}

const submitState = () => screen.getByTestId('sign-up-submit').props.accessibilityState;

async function fillIn({ password = 'a', confirmation }: { password?: string; confirmation?: string } = {}) {
  confirmation ??= password;
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Sri Ram');
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), confirmation);
}

/** The "Account already exists" alert's buttons, by title. */
function alertButtons(): Record<string, { onPress?: () => void; style?: string }> {
  const call = alert.mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void; style?: string }[]];
  return Object.fromEntries(call[2].map((button) => [button.text, button]));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetExistingAccountAlert();
  challenge.mockResolvedValue(undefined);
  mockAccountExists.mockResolvedValue({ exists: false });
  mockRegister.mockResolvedValue({ email: 'person@example.com', emailVerificationRequired: true, emailSent: true });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the layout (sign-up-v4)', () => {
  it('shows Swift’s copy, captions and placeholders', async () => {
    await renderSignUp();
    expect(screen.getByLabelText('NexDo')).toBeTruthy();
    expect(screen.getByText('Less on your mind. More done in your day.')).toBeTruthy();
    expect(screen.getByText('Create your account')).toBeTruthy();
    expect(screen.getByText('Your tasks, plans, and everyday life — together.')).toBeTruthy();
    for (const caption of ['Full name', 'Email address', 'Password', 'Confirm password']) expect(screen.getByText(caption, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByPlaceholderText('Your name')).toBeTruthy();
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(screen.getByText('We protect your password and never store a readable copy.')).toBeTruthy();
    expect(screen.getByLabelText('Already have an account? Sign In')).toBeTruthy();
  });

  it('pins Create Account in the bottom bar, grey until the form is complete', async () => {
    await renderSignUp();
    expect(screen.getByTestId('sign-up-bar')).toBeTruthy();
    expect(submitState().disabled).toBe(true);
    expect(screen.getByTestId('sign-up-submit-disabled')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('sign-up-submit-disabled').props.style).backgroundColor).toBe(palettes.light.tertiaryFill);

    await fillIn();
    await waitFor(() => expect(submitState().disabled).toBe(false));
    expect(screen.queryByTestId('sign-up-submit-disabled')).toBeNull();
  });

  // `sign-up-v4-passwords-mismatch`: a mismatch only keeps the button grey; no message (the gate is `==`).
  it('keeps the button grey and quiet when the passwords differ', async () => {
    await renderSignUp();
    await fillIn({ password: 'parity-pass', confirmation: 'parity-passx' });
    expect(submitState().disabled).toBe(true);
    expect(screen.queryByTestId('sign-up-error')).toBeNull();
  });

  // `password.utf8.count <= 72` (:753).
  it('keeps the button grey for a password over 72 bytes', async () => {
    await renderSignUp();
    await fillIn({ password: 'é'.repeat(37) });
    expect(submitState().disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'é'.repeat(36));
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'é'.repeat(36));
    await waitFor(() => expect(submitState().disabled).toBe(false));
  });

  it('closes from "Already have an account? Sign In"', async () => {
    await renderSignUp();
    await fireEvent.press(screen.getByLabelText('Already have an account? Sign In'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('borders the focused field in the accent on Android only', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await renderSignUp();
    await fireEvent(screen.getByLabelText('Full name'), 'focus');
    expect(StyleSheet.flatten(screen.getByTestId('sign-up-field-person-outline').props.style).borderColor).toBe(palettes.light.accent);
    expect(StyleSheet.flatten(screen.getByTestId('sign-up-field-mail-outline').props.style).borderColor).toBe(palettes.light.fieldBorder);
  });
});

describe('creating the account (`create()`, :771-796)', () => {
  it('checks the account, runs the check, then registers with its token', async () => {
    challenge.mockResolvedValue('turnstile-token');
    await renderSignUp();
    await fillIn();
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('Sri Ram', 'person@example.com', 'a', undefined, 'turnstile-token'));
    expect(mockAccountExists).toHaveBeenCalledWith('person@example.com');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/verify-email', params: { email: 'person@example.com', reason: 'codeSent' } }));
  });

  // Phase 14: "Creating Account…" with a spinner for the whole of `checkingSignup`, the check included.
  it('says "Creating Account…" from the moment it is tapped', async () => {
    let finish: (token: string) => void = () => undefined;
    challenge.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderSignUp();
    await fillIn();
    await waitFor(() => expect(submitState().disabled).toBe(false));

    await fireEvent.press(screen.getByTestId('sign-up-submit'));
    await waitFor(() => expect(screen.getByLabelText('Creating Account…')).toBeTruthy());
    expect(submitState()).toMatchObject({ disabled: true, busy: true });
    expect(screen.getByLabelText('Already have an account? Sign In').props.accessibilityState.disabled).toBe(true);
    expect(mockRegister).not.toHaveBeenCalled();

    finish('token');
    await waitFor(() => expect(mockRegister).toHaveBeenCalled());
  });

  it('says the check was cancelled, and registers nothing', async () => {
    challenge.mockRejectedValue(new SignupChallengeCancelled());
    await renderSignUp();
    await fillIn();
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    await waitFor(() => expect(screen.getByTestId('sign-up-error')).toHaveTextContent(SECURITY_CHECK_CANCELLED));
    expect(mockRegister).not.toHaveBeenCalled();
    await waitFor(() => expect(submitState().disabled).toBe(false));
  });

  it.each([
    'Enter a password (72 bytes maximum).',
    'Account security checks are temporarily unavailable. Please try again shortly.',
    'The request could not be completed (500). Refresh to check the current state before retrying.',
  ])('shows the server’s text once, in the single inline slot: %s', async (message) => {
    mockRegister.mockRejectedValue(new ApiError({ status: 400, message }));
    await renderSignUp();
    await fillIn();
    await fireEvent.press(screen.getByTestId('sign-up-submit'));
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(1));
  });
});

describe('Account already exists (sign-up-existing-account-alert)', () => {
  it('asks when account-exists says yes, before any check or registration', async () => {
    mockAccountExists.mockResolvedValue({ exists: true });
    await renderSignUp();
    await fillIn();
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(EXISTING_ACCOUNT_TITLE, EXISTING_ACCOUNT_MESSAGE, expect.any(Array), expect.anything()));
    expect(EXISTING_ACCOUNT_MESSAGE).toBe('We already have an account with this email address. Do you want to reset the password?');
    expect(Object.keys(alertButtons())).toEqual(['No', 'Yes, reset password']);
    expect(alertButtons().No.style).toBe('cancel');
    expect(challenge).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sign-up-error')).toBeNull();
  });

  it('asks for register’s 409 too, with no error line', async () => {
    mockRegister.mockRejectedValue(new ApiError({ status: 409, message: 'An account with this email already exists. Sign in or reset your password.' }));
    await renderSignUp();
    await fillIn();
    await fireEvent.press(screen.getByTestId('sign-up-submit'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(EXISTING_ACCOUNT_TITLE, EXISTING_ACCOUNT_MESSAGE, expect.any(Array), expect.anything()));
    expect(screen.queryByTestId('sign-up-error')).toBeNull();
  });

  it('clears the passwords and opens Reset password with the address on “Yes, reset password”', async () => {
    mockAccountExists.mockResolvedValue({ exists: true });
    await renderSignUp();
    await fillIn({ password: 'parity-pass' });
    await fireEvent.press(screen.getByTestId('sign-up-submit'));
    await waitFor(() => expect(alert).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('sign-up-submit')); // ignored: the button is grey again soon
    alertButtons()['Yes, reset password'].onPress?.();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reset-password', params: { email: 'person@example.com' } });
    await waitFor(() => expect(screen.getByLabelText('Password').props.value).toBe(''));
    expect(screen.getByLabelText('Confirm password').props.value).toBe('');
    expect(screen.getByLabelText('Email address').props.value).toBe('person@example.com');
  });

  it('keeps everything on “No”', async () => {
    mockAccountExists.mockResolvedValue({ exists: true });
    await renderSignUp();
    await fillIn({ password: 'parity-pass' });
    await fireEvent.press(screen.getByTestId('sign-up-submit'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    alertButtons().No.onPress?.();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password').props.value).toBe('parity-pass');
  });

  // `checkEmail()` (:759-769) on leaving the field: trimmed and lowercased, silent on failure.
  it('asks as soon as the email field is left', async () => {
    mockAccountExists.mockResolvedValue({ exists: true });
    await renderSignUp();
    await fireEvent.changeText(screen.getByLabelText('Email address'), '  Person@Example.com ');
    await fireEvent(screen.getByLabelText('Email address'), 'blur');
    await waitFor(() => expect(alert).toHaveBeenCalledWith(EXISTING_ACCOUNT_TITLE, EXISTING_ACCOUNT_MESSAGE, expect.any(Array), expect.anything()));
    expect(mockAccountExists).toHaveBeenCalledWith('person@example.com');
  });

  it.each([
    ['an address with no @', 'person', () => undefined],
    ['an address that does not exist', 'new@example.com', () => mockAccountExists.mockResolvedValue({ exists: false })],
    ['a failed check', 'person@example.com', () => mockAccountExists.mockRejectedValue(new Error('offline'))],
  ])('stays quiet on leaving the field for %s', async (_, address, arrange) => {
    arrange();
    await renderSignUp();
    await fireEvent.changeText(screen.getByLabelText('Email address'), address);
    await fireEvent(screen.getByLabelText('Email address'), 'blur');
    await waitFor(() => expect(mockAccountExists.mock.calls.length).toBe(address.includes('@') ? 1 : 0));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sign-up-error')).toBeNull();
  });

  it('drops the answer if the address changed meanwhile', async () => {
    let answer: (value: { exists: boolean }) => void = () => undefined;
    mockAccountExists.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await renderSignUp();
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.com');
    await fireEvent(screen.getByLabelText('Email address'), 'blur');
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'other@example.com');
    answer({ exists: true });
    await waitFor(() => expect(mockAccountExists).toHaveBeenCalled());
    expect(alert).not.toHaveBeenCalled();
  });

  it('never stacks a second alert on the first', async () => {
    mockAccountExists.mockResolvedValue({ exists: true });
    await renderSignUp();
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.com');
    await fireEvent(screen.getByLabelText('Email address'), 'blur');
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    await fireEvent(screen.getByLabelText('Email address'), 'blur');
    await waitFor(() => expect(mockAccountExists).toHaveBeenCalledTimes(2));
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
