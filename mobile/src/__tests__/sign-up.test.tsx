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
