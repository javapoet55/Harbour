import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '../api/client';
import { useSession } from '../store/session';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: jest.fn() },
}));

const mockLogin = jest.fn();
const mockMe = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    login: (...args: unknown[]) => mockLogin(...args),
    me: (...args: unknown[]) => mockMe(...args),
  },
}));

import SignIn from '../../app/(auth)/sign-in';

const profile = { id: 'u1', name: 'Sri Ram', email: 'person@example.com', timeZone: 'Asia/Kolkata' };

async function renderSignIn() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return await render(
    <QueryClientProvider client={queryClient}>
      <SignIn />
    </QueryClientProvider>,
  );
}

async function fillIn(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email address'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  // useWatch updates the enable rule outside the act() fireEvent already flushed.
  await waitFor(() => expect(screen.getByLabelText('Sign In').props.accessibilityState.disabled).toBe(false));
}

describe('sign-in screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ status: 'unknown', profile: null });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('renders the Swift screen copy and controls', async () => {
    await renderSignIn();
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByText('Your day is clearer with Nexdo.')).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Forgot password?')).toBeTruthy();
    expect(screen.getByText('New to Nexdo?')).toBeTruthy();
    expect(screen.getByText('Your password stays on this device only for this sign-in.')).toBeTruthy();
  });

  it('keeps Sign In disabled until there is an "@" and a password, matching canSignIn', async () => {
    await renderSignIn();
    expect(screen.getByLabelText('Sign In').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.com');
    await waitFor(() => expect(screen.getByLabelText('Sign In').props.accessibilityState.disabled).toBe(true));

    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await waitFor(() => expect(screen.getByLabelText('Sign In').props.accessibilityState.disabled).toBe(false));
  });

  it('submits the credentials and publishes the profile', async () => {
    mockLogin.mockResolvedValue({ id: 'u1', name: 'Sri Ram', email: 'person@example.com' });
    mockMe.mockResolvedValue({ user: profile });

    await renderSignIn();
    await fillIn('person@example.com', 'a-real-password');
    await fireEvent.press(screen.getByLabelText('Sign In'));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('person@example.com', 'a-real-password'));
    await waitFor(() => expect(useSession.getState().profile).toEqual(profile));
    expect(useSession.getState().status).toBe('signedIn');
  });

  it('shows a server error in the alert Swift routes AppModel.error to', async () => {
    mockLogin.mockRejectedValue(new ApiError({ status: 401, message: 'Invalid email or password.' }));

    await renderSignIn();
    await fillIn('person@example.com', 'wrong-password');
    await fireEvent.press(screen.getByLabelText('Sign In'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Unable to complete request', 'Invalid email or password.', [{ text: 'OK' }]),
    );
    expect(useSession.getState().status).not.toBe('signedIn');
  });

  it('routes to verify-email, with the email prefilled, on EMAIL_NOT_VERIFIED', async () => {
    mockLogin.mockRejectedValue(
      new ApiError({
        status: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email address to sign in.',
        email: 'person@example.com',
      }),
    );

    await renderSignIn();
    await fillIn('person@example.com', 'a-real-password');
    await fireEvent.press(screen.getByLabelText('Sign In'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/verify-email',
        params: { email: 'person@example.com', reason: 'signInRequiresVerification' },
      }),
    );
    // Swift does not resend from here; the verify screen offers "Send a new code".
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('opens reset-password carrying the typed email', async () => {
    await renderSignIn();
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.com');
    await act(async () => undefined);
    await fireEvent.press(screen.getByLabelText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reset-password', params: { email: 'person@example.com' } });
  });

  it('opens sign-up from "Create account"', async () => {
    await renderSignIn();
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(mockPush).toHaveBeenCalledWith('/sign-up');
  });
});
