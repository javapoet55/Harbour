import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { Profile } from '../../../api';
import { useSession } from '../../../store/session';

const mockChange = jest.fn();
jest.mock('../../../api', () => ({
  ...jest.requireActual('../../../api'),
  endpoints: { changePassword: (...args: unknown[]) => mockChange(...args) },
}));
const mockClose = jest.fn(async () => undefined);
const mockReplace = jest.fn();
jest.mock('../../../lib/sessionNavigation', () => ({ closePresentedScreens: () => mockClose(), replaceWithSignIn: () => mockReplace() }));

import { ChangePasswordScreen, passwordChangeValid, utf8Length } from '../ChangePasswordScreen';

/** `ChangePasswordView` (ios/App/ProfileView.swift:150-198). */

let client: QueryClient | undefined;
let alert: jest.SpyInstance;

async function open() {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  const onBack = jest.fn();
  await render(
    <QueryClientProvider client={client}>
      <ChangePasswordScreen onBack={onBack} />
    </QueryClientProvider>,
  );
  return onBack;
}

async function fill(current: string, next: string, confirmation: string) {
  await fireEvent.changeText(screen.getByTestId('change-password-current'), current);
  await fireEvent.changeText(screen.getByTestId('change-password-new'), next);
  await fireEvent.changeText(screen.getByTestId('change-password-confirm'), confirmation);
}

const button = () => screen.getByLabelText(/Change password|Changing password…/);

beforeEach(() => {
  mockChange.mockReset();
  mockClose.mockClear();
  mockReplace.mockClear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
});
afterEach(() => {
  alert.mockRestore();
  client?.clear();
});

test('valid: current present, 12+ characters, at most 72 bytes, confirmed, different', () => {
  expect(passwordChangeValid('old', 'a-long-enough-pw', 'a-long-enough-pw')).toBe(true);
  expect(passwordChangeValid('', 'a-long-enough-pw', 'a-long-enough-pw')).toBe(false);
  expect(passwordChangeValid('old', 'short', 'short')).toBe(false);
  expect(passwordChangeValid('old', 'a-long-enough-pw', 'a-long-enough-px')).toBe(false);
  expect(passwordChangeValid('a-long-enough-pw', 'a-long-enough-pw', 'a-long-enough-pw')).toBe(false);
  // 25 emoji: 25 characters but 100 bytes.
  expect(utf8Length('😀'.repeat(25))).toBe(100);
  expect(passwordChangeValid('old', '😀'.repeat(25), '😀'.repeat(25))).toBe(false);
});

test('shows the footer and the mismatch line; the button waits for a valid form', async () => {
  await open();
  expect(screen.getByRole('header')).toHaveTextContent('Change password');
  expect(screen.getByText('Use at least 12 characters (72 bytes maximum). You’ll need to sign in again after changing your password.')).toBeTruthy();
  expect(screen.getByTestId('change-password-new').props.secureTextEntry).toBe(true);
  await fill('old-password', 'a-long-enough-pw', 'a-long-enough-px');
  expect(screen.getByTestId('change-password-mismatch')).toHaveTextContent('The new passwords do not match.');
  expect(button().props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(screen.getByTestId('change-password-confirm'), 'a-long-enough-pw');
  expect(screen.queryByTestId('change-password-mismatch')).toBeNull();
  expect(button().props.accessibilityState.disabled).toBe(false);
});

test('asks "Change password and sign out?"; Cancel changes nothing', async () => {
  await open();
  await fill('old-password', 'a-long-enough-pw', 'a-long-enough-pw');
  await fireEvent.press(button());
  expect(alert).toHaveBeenCalledWith(
    'Change password and sign out?',
    'After your password is changed, you’ll be signed out and must sign in again using your new password. Continue?',
    expect.any(Array),
  );
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  expect(buttons.map((item) => item.text)).toEqual(['Cancel', 'Change password']);
  expect(mockChange).not.toHaveBeenCalled();
});

test('confirmed: changes the password, then signs out and opens Sign in', async () => {
  mockChange.mockResolvedValue({ ok: true });
  await open();
  await fill('old-password', 'a-long-enough-pw', 'a-long-enough-pw');
  await fireEvent.press(button());
  const confirm = (alert.mock.calls[0][2] as { text: string; onPress: () => void }[])[1];
  await act(async () => confirm.onPress());
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  expect(mockChange).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'a-long-enough-pw', confirmPassword: 'a-long-enough-pw' });
  expect(mockClose).toHaveBeenCalled();
  expect(useSession.getState().profile).toBeNull();
});

test('a refused change keeps the session and shows the server\'s message', async () => {
  mockChange.mockRejectedValue(new Error('Your current password is incorrect.'));
  await open();
  await fill('wrong-password', 'a-long-enough-pw', 'a-long-enough-pw');
  await fireEvent.press(button());
  const confirm = (alert.mock.calls[0][2] as { text: string; onPress: () => void }[])[1];
  await act(async () => confirm.onPress());
  await waitFor(() => expect(screen.getByTestId('change-password-failure')).toHaveTextContent('Your current password is incorrect.'));
  expect(mockReplace).not.toHaveBeenCalled();
  expect(useSession.getState().profile?.id).toBe('u1');
});
