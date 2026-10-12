import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { Profile } from '../api';
import { useSession } from '../store/session';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: () => mockBack() },
  useLocalSearchParams: () => ({ email: 'ada@example.com' }),
}));

const mockRequest = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    passwordResetRequest: (...args: unknown[]) => mockRequest(...args),
    passwordResetConfirm: (...args: unknown[]) => mockConfirm(...args),
  },
}));
const mockClose = jest.fn(async () => undefined);
const mockReplace = jest.fn();
jest.mock('../lib/sessionNavigation', () => ({ closePresentedScreens: () => mockClose(), replaceWithSignIn: () => mockReplace() }));

import ResetPassword from '../../app/(auth)/reset-password';

/**
 * 4185501: Reset password, opened from Change password while signed in (ProfileView.swift:192-206).
 * A confirmed reset ends the session as Change password does; signed out, nothing else changes.
 */

const ADA = { id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile;

async function resetTo(password: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <ResetPassword />
    </QueryClientProvider>,
  );
  // `initialEmail` is the signed-in account's.
  expect(screen.getByTestId('reset-email').props.value).toBe('ada@example.com');
  await fireEvent.press(screen.getByTestId('reset-request'));
  await waitFor(() => expect(screen.getByTestId('reset-code')).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirm new password'), password);
  await fireEvent.press(screen.getByTestId('reset-update'));
}

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({ message: 'Check your email.' });
  mockConfirm.mockResolvedValue({ ok: true });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => alert.mockRestore());

it('signed in: ends the session, opens Sign in and says the password was updated', async () => {
  useSession.getState().setProfile(ADA);
  await resetTo('correct horse battery');
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  expect(mockConfirm).toHaveBeenCalledWith('ada@example.com', '123456', 'correct horse battery');
  expect(mockClose).toHaveBeenCalled();
  expect(useSession.getState().status).toBe('signedOut');
  expect(alert).toHaveBeenCalledWith('Password updated', 'You can now sign in with your new password.', [{ text: 'Sign In' }]);
});

it('signed out: keeps Swift’s alert, whose Sign In closes the sheet', async () => {
  useSession.getState().clear();
  await resetTo('correct horse battery');
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(mockClose).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress: () => void }[];
  buttons[0].onPress();
  expect(mockBack).toHaveBeenCalled();
});
