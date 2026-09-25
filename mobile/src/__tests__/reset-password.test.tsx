import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { ANDROID_DISABLED_GRADIENT_OPACITY } from '../components/GradientButton';
import { palettes } from '../theme';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ email: 'person@example.com' }),
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

import ResetPassword from '../../app/(auth)/reset-password';

/** docs/android-polish.md §12: Reset password on Android. Tests render in the light scheme. */
const light = palettes.light;
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style);

function wrap() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResetPassword />
    </QueryClientProvider>,
  );
}

/** Request a code, so the Verification group and "Update Password" appear. */
async function sendCode() {
  await fireEvent.press(screen.getByTestId('reset-request'));
  await waitFor(() => expect(screen.getByTestId('reset-code')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({ message: 'Check your email.' });
  mockConfirm.mockResolvedValue({ ok: true });
});

afterEach(() => jest.restoreAllMocks());

describe('Reset password on Android', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

  it('draws the email as the auth field row, keeping its helper text', async () => {
    await wrap();
    expect(screen.getByTestId('field-icon-envelope', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('We’ll email a six-digit code if an account exists. Codes expire after 15 minutes.')).toBeTruthy();
    await fireEvent(screen.getByTestId('reset-email'), 'focus');
    expect(flat('field-icon-envelope')).toMatchObject({ borderColor: light.accent });
  });

  it('makes "Send Verification Code" the gradient button, full width, 24 under the group', async () => {
    await wrap();
    expect(flat('reset-request')).toMatchObject({ marginHorizontal: 16, marginTop: 24 });
    expect(flat('reset-request-gradient')).toMatchObject({ opacity: 1 });
  });

  it('makes "Update Password" the gradient button, faded until the code and password are valid', async () => {
    await wrap();
    await sendCode();

    expect(flat('reset-update')).toMatchObject({ marginHorizontal: 16, marginTop: 24 });
    expect(screen.getByTestId('reset-update').props.accessibilityState.disabled).toBe(true);
    expect(flat('reset-update-gradient')).toMatchObject({ opacity: ANDROID_DISABLED_GRADIENT_OPACITY });

    await fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'correct horse battery');
    expect(screen.getByTestId('reset-update').props.accessibilityState.disabled).toBe(false);
    expect(flat('reset-update-gradient')).toMatchObject({ opacity: 1 });
  });

  it('turns "Send a new code" into a centred link 16 under the button, and it still resends', async () => {
    await wrap();
    await sendCode();
    expect(flat('reset-resend')).toMatchObject({ alignSelf: 'center', marginTop: 16 });
    expect(StyleSheet.flatten(screen.getByText('Send a new code').props.style).color).toBe(light.link);

    await fireEvent.press(screen.getByTestId('reset-resend'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
  });

  it('keeps the code numeric and at most six characters', async () => {
    await wrap();
    await sendCode();
    const code = screen.getByTestId('reset-code');
    expect(code.props.keyboardType).toBe('number-pad');
    expect(code.props.maxLength).toBe(6);
    await fireEvent.changeText(code, '12a34567');
    expect(screen.getByTestId('reset-code').props.value).toBe('123456');
  });

  it('still updates the password, checking the confirmation first', async () => {
    await wrap();
    await sendCode();
    await fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'correct horse battery');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'something else entirely');
    await fireEvent.press(screen.getByTestId('reset-update'));
    expect(screen.getByText('The passwords do not match.')).toBeTruthy();
    expect(mockConfirm).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'correct horse battery');
    await fireEvent.press(screen.getByTestId('reset-update'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith('person@example.com', '123456', 'correct horse battery'));
  });
});

describe('Reset password on iOS', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));

  it('keeps the Form rows: no gradient button, no field icon, no link', async () => {
    await wrap();
    expect(screen.queryByTestId('reset-request-gradient')).toBeNull();
    expect(screen.queryByTestId('field-icon-envelope', { includeHiddenElements: true })).toBeNull();
    await sendCode();
    expect(screen.queryByTestId('reset-update-gradient')).toBeNull();
    expect(screen.queryByTestId('reset-resend')).toBeNull();
    expect(screen.getByText('Send a new code')).toBeTruthy();
    expect(screen.getByTestId('reset-code').props.maxLength).toBeUndefined();
  });
});
