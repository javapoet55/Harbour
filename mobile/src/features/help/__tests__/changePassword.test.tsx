import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import type { Profile } from '../../../api';
import { useAppearance } from '../../../store/appearance';
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

const onForgotPassword = jest.fn();

async function open() {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  const onBack = jest.fn();
  await render(
    <QueryClientProvider client={client}>
      <ChangePasswordScreen onBack={onBack} onForgotPassword={onForgotPassword} />
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

test('valid: current present, non-empty, at most 72 bytes, confirmed, different', () => {
  expect(passwordChangeValid('old', 'a-long-enough-pw', 'a-long-enough-pw')).toBe(true);
  expect(passwordChangeValid('', 'a-long-enough-pw', 'a-long-enough-pw')).toBe(false);
  expect(passwordChangeValid('old', 'short', 'short')).toBe(true);
  expect(passwordChangeValid('old', 'a-long-enough-pw', 'a-long-enough-px')).toBe(false);
  expect(passwordChangeValid('a-long-enough-pw', 'a-long-enough-pw', 'a-long-enough-pw')).toBe(false);
  // 25 emoji: 25 characters but 100 bytes.
  expect(utf8Length('😀'.repeat(25))).toBe(100);
  expect(passwordChangeValid('old', '😀'.repeat(25), '😀'.repeat(25))).toBe(false);
});

test('shows the footer and the mismatch line; the button waits for a valid form', async () => {
  await open();
  expect(screen.getByRole('header')).toHaveTextContent('Change password');
  expect(screen.getByText('Choose a password (72 bytes maximum). You’ll need to sign in again after changing your password.')).toBeTruthy();
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

/** 4185501 (ProfileView.swift:192-195): "Forgot password?" opens the reset sheet. */
test('"Forgot password?" sits under the fields and opens the reset sheet', async () => {
  onForgotPassword.mockClear();
  await open();
  const forgot = screen.getByTestId('change-password-forgot');
  expect(forgot).toHaveTextContent('Forgot password?');
  await fireEvent.press(forgot);
  expect(onForgotPassword).toHaveBeenCalledTimes(1);
  expect(mockChange).not.toHaveBeenCalled();
});

/**
 * Phase 14 (a80c206, 61788dc; capture `change-password-v4`): Swift's footer and gate, and My Page's
 * `nexdoActionForeground` tint on "Forgot password?" and the back chevron — indigo in light, white in dark.
 */
describe('Change password, Phase 14', () => {
  afterEach(() => useAppearance.setState({ appearance: 'system', voiceVolume: 1 }));

  it('says the 72-byte footer and has no 12-character minimum', async () => {
    await open();
    expect(screen.getByText('Choose a password (72 bytes maximum). You’ll need to sign in again after changing your password.')).toBeTruthy();
    expect(passwordChangeValid('old', 'a', 'a')).toBe(true);
    expect(passwordChangeValid('old', 'é'.repeat(37), 'é'.repeat(37))).toBe(false);
  });

  it.each([
    ['night', '#FFFFFF'],
    ['day', '#3D29F0'],
  ] as const)('tints Forgot password? and Back with the action foreground (%s)', async (appearance, color) => {
    useAppearance.setState({ appearance, voiceVolume: 1 });
    await open();
    expect(StyleSheet.flatten(screen.getByText('Forgot password?').props.style).color).toBe(color);
    // The glyph (Ionicons is a plain View in tests) carries the colour as a prop.
    type Node = { props: Record<string, unknown>; children: (Node | string)[] };
    const colours: unknown[] = [];
    const walk = (node: Node | string) => {
      if (typeof node === 'string') return;
      if (node.props.color !== undefined) colours.push(node.props.color);
      node.children.forEach(walk);
    };
    walk(screen.getByLabelText('Back') as unknown as Node);
    expect(colours).toEqual([color]);
  });
});
