import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../api/client';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ email: 'person@example.com', reason: 'codeSent' }),
}));

const mockVerifyEmail = jest.fn();
const mockResend = jest.fn();
const mockMe = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
    resendVerification: (...args: unknown[]) => mockResend(...args),
    me: (...args: unknown[]) => mockMe(...args),
  },
}));

import VerifyEmail, { RESEND_COOLDOWN_SECONDS } from '../../app/(auth)/verify-email';

async function renderVerify() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return await render(
    <QueryClientProvider client={queryClient}>
      <VerifyEmail />
    </QueryClientProvider>,
  );
}

describe('verify-email screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens with the codeSent message and a disabled Verify button', async () => {
    await renderVerify();
    expect(screen.getByText('We sent a six-digit code to person@example.com. It expires in 24 hours.')).toBeTruthy();
    expect(screen.getByLabelText('Verify Email').props.accessibilityState.disabled).toBe(true);
  });

  it('accepts a pasted code, stripping non-digits, and enables Verify at six digits', async () => {
    await renderVerify();
    await fireEvent.changeText(screen.getByTestId('verification-code'), '12-34 56');
    expect(screen.getByTestId('verification-code').props.value).toBe('123456');
    await waitFor(() => expect(screen.getByLabelText('Verify Email').props.accessibilityState.disabled).toBe(false));
  });

  it('renders the too-many-attempts state the server returns after five wrong codes', async () => {
    const lockout = 'That verification code is invalid, expired, or already used. Send a new code and try again.';
    mockVerifyEmail.mockRejectedValue(new ApiError({ status: 400, message: lockout }));

    await renderVerify();
    await fireEvent.changeText(screen.getByTestId('verification-code'), '000000');
    await waitFor(() => expect(screen.getByLabelText('Verify Email').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByLabelText('Verify Email'));

    await waitFor(() => expect(screen.getByText(lockout)).toBeTruthy());
  });

  describe('resend cooldown', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      // Drop the countdown interval before handing the environment back to real timers, so no
      // fake-timer handle outlives the suite.
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('counts down from 60 seconds and re-enables when it reaches zero', async () => {
      mockResend.mockResolvedValue({ message: 'If that account still needs verification, a new six-digit code has been sent.', delivered: true });

      await renderVerify();
      const resend = screen.getByTestId('resend-code');
      expect(screen.getByText('Send a new code')).toBeTruthy();

      await fireEvent.press(resend);
      await waitFor(() => expect(screen.getByText(`Send a new code in ${RESEND_COOLDOWN_SECONDS}s`)).toBeTruthy());
      expect(screen.getByTestId('resend-code').props.accessibilityState.disabled).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText(`Send a new code in ${RESEND_COOLDOWN_SECONDS - 1}s`)).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(screen.getByText(`Send a new code in ${RESEND_COOLDOWN_SECONDS - 6}s`)).toBeTruthy();

      // Run out the rest of the cooldown.
      await act(async () => {
        jest.advanceTimersByTime((RESEND_COOLDOWN_SECONDS - 6) * 1000);
      });
      expect(screen.getByText('Send a new code')).toBeTruthy();
      expect(screen.getByTestId('resend-code').props.accessibilityState.disabled).toBe(false);
    });

    it('does not resend while the cooldown is running', async () => {
      mockResend.mockResolvedValue({ message: 'sent', delivered: true });

      await renderVerify();
      await fireEvent.press(screen.getByTestId('resend-code'));
      await waitFor(() => expect(mockResend).toHaveBeenCalledTimes(1));

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      await fireEvent.press(screen.getByTestId('resend-code'));
      expect(mockResend).toHaveBeenCalledTimes(1);
    });
  });
});
