import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert, Linking } from 'react-native';

import { ApiError } from '../../../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useBugReport, type BugReportSession } from '../coordinator';

const mockSubmit = jest.fn();
jest.mock('../../../api/feedback', () => ({
  ...jest.requireActual('../../../api/feedback'),
  bugReportApi: { submit: (...args: unknown[]) => mockSubmit(...args) },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));

import { BugReportScreen, CONSENT, PRESERVED } from '../BugReportScreen';

/** `BugReportView` (ios/App/BugReportView.swift); captures `bug-report-*` in mobile/docs/reference/ios. */

const DIAGNOSTICS = {
  appVersion: '1.0.1',
  buildNumber: '7',
  deviceModel: 'Pixel 8',
  iosVersion: '15',
  screen: 'tasks' as const,
  timestamp: '2026-10-12T05:40:31Z',
  correlationID: '37251480-3ddd-4725-8e3b-14168521333e',
};
const CAPTURED: BugReportSession = { diagnostics: DIAGNOSTICS, capture: { kind: 'captured', base64: '/9j/AA==' } };
const REFUSED: BugReportSession = { diagnostics: DIAGNOSTICS, capture: { kind: 'refused' } };

let alert: jest.SpyInstance;
const onDone = jest.fn();

async function show(session: BugReportSession = CAPTURED) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <BugReportScreen onDone={onDone} session={session} />
    </QueryClientProvider>,
  );
}

/** Press a button of the last `Alert.alert`. */
async function pressAlert(label: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((button) => button.text === label)?.onPress?.());
}

async function toForm(description = '') {
  await fireEvent.press(screen.getByTestId('bug.primary'));
  if (description) await fireEvent.changeText(screen.getByTestId('bug.description'), description);
}

beforeEach(() => {
  mockSubmit.mockReset();
  onDone.mockClear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => alert.mockRestore());

describe('introduction (`bug-report-intro`)', () => {
  it('says what Swift says, in order, with Report Bug and ×', async () => {
    await show();
    for (const text of [
      'NexDo',
      'Less on your mind, more done in your day.',
      'Report a bug?',
      'If something isn’t working correctly, you can report it to help us improve NexDo for everyone.',
      'Shake iPhone to report a bug',
      'Thank you! Your feedback helps make NexDo better for everyone.',
      'Together we make NexDo better!',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByTestId('bug.primary')).toHaveTextContent('Report Bug');
    expect(screen.queryByTestId('bug.back')).toBeNull();
    await fireEvent.press(screen.getByTestId('bug.close'));
    expect(onDone).toHaveBeenCalled();
  });
});

describe('the shake toggle', () => {
  it('is the signed-in account’s setting, saved as bug.shake.<owner>', async () => {
    useBugReport.setState({ owner: 'u1', shakeEnabled: false });
    await show();
    await fireEvent(screen.getByTestId('bug.shake'), 'valueChange', true);
    expect(useBugReport.getState().shakeEnabled).toBe(true);
    await waitFor(async () => expect(await AsyncStorage.getItem('bug.shake.u1')).toBe('true'));
    useBugReport.setState({ owner: null, shakeEnabled: false });
  });
});

describe('form (`bug-report-form-*`)', () => {
  it('opens on "Report app issue" with Send off until there is a description', async () => {
    await show();
    await toForm();
    expect(screen.getByText('Report app issue')).toBeTruthy();
    expect(screen.getByText('What happened?')).toBeTruthy();
    expect(screen.getByText('Optional. Capture the original app screen, then review it before sending.')).toBeTruthy();
    expect(screen.getByText('Reports are kept for 90 days and screenshots for 7 days. No full logs or screen recordings are collected.')).toBeTruthy();
    expect(screen.getByTestId('bug.count')).toHaveTextContent('0 / 2000');
    expect(screen.getByTestId('bug.primary')).toHaveTextContent('Send');
    expect(screen.getByTestId('bug.primary').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('bug.description'), '   ');
    expect(screen.getByTestId('bug.primary').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('bug.description'), 'Calendar does not open after a sync.');
    expect(screen.getByTestId('bug.count')).toHaveTextContent('36 / 2000');
    expect(screen.getByTestId('bug.primary').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('caps the description at 2,000 units', async () => {
    await show();
    await toForm('a'.repeat(2050));
    expect(screen.getByTestId('bug.description').props.value).toHaveLength(2000);
    expect(screen.getByTestId('bug.count')).toHaveTextContent('2000 / 2000');
  });

  it('lists what will be included, as sent', async () => {
    await show();
    await toForm();
    await fireEvent.press(screen.getByTestId('bug.include'));
    for (const text of ['App version and build', '1.0.1 (7)', 'Device model', 'Pixel 8', 'iOS version', '15', 'Current app screen', 'tasks', 'Timestamp', '2026-10-12T05:40:31Z', 'Anonymous correlation ID', '37251480-3ddd-4725-8e3b-14168521333e']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('Back returns to the introduction; × with text asks before discarding', async () => {
    await show();
    await toForm('Something broke');
    await fireEvent.press(screen.getByTestId('bug.close'));
    expect(alert).toHaveBeenLastCalledWith('Discard this report?', undefined, [
      { text: 'Keep Report', style: 'cancel' },
      expect.objectContaining({ text: 'Discard Report', style: 'destructive' }),
    ]);
    expect(onDone).not.toHaveBeenCalled();
    await pressAlert('Discard Report');
    expect(onDone).toHaveBeenCalled();
  });

  it('Contact support opens a mail to support', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await show();
    await toForm();
    await fireEvent.press(screen.getByTestId('bug.support'));
    expect(open).toHaveBeenCalledWith('mailto:support@nexdoapp.com');
    open.mockRestore();
  });
});

describe('screenshot (`bug-report-screenshot-consent`, `-form-screenshot`)', () => {
  it('asks first, then shows the screen the report opened over, with Retake and Remove', async () => {
    await show();
    await toForm('Broken');
    await fireEvent(screen.getByTestId('bug.screenshot'), 'valueChange', true);
    expect(alert).toHaveBeenLastCalledWith(CONSENT.title, CONSENT.message, [{ text: 'Cancel', style: 'cancel' }, expect.objectContaining({ text: 'Include Screenshot' })]);
    expect(screen.queryByTestId('bug.preview')).toBeNull();
    await pressAlert('Include Screenshot');
    await waitFor(() => expect(screen.getByTestId('bug.preview')).toBeTruthy());
    expect(screen.getByLabelText('Screenshot preview of original app screen').props.source.uri).toBe('data:image/jpeg;base64,/9j/AA==');
    expect(screen.getByText('Screenshot captured')).toBeTruthy();
    expect(screen.getByText('Review for private information before sending.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('bug.remove'));
    expect(screen.queryByTestId('bug.preview')).toBeNull();
    expect(screen.getByTestId('bug.screenshot').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('on a secure screen, says the screenshot is unavailable and keeps the description', async () => {
    await show(REFUSED);
    await toForm('Broken');
    await fireEvent(screen.getByTestId('bug.screenshot'), 'valueChange', true);
    await pressAlert('Include Screenshot');
    await waitFor(() => expect(screen.getByTestId('bug.error')).toHaveTextContent('Screenshot unavailable on this screen. You can still send your description.'));
    expect(screen.queryByTestId('bug.preview')).toBeNull();
    expect(screen.getByTestId('bug.description').props.value).toBe('Broken');
  });
});

describe('sending (`bug-report-sending`, `-error-network`, `-success`, `-success-copied`)', () => {
  it('sends the trimmed report with the screenshot, then shows the reference and copies it', async () => {
    let finish: (value: { reference: string }) => void = () => undefined;
    mockSubmit.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await show();
    await toForm('  Calendar does not open.  ');
    await fireEvent(screen.getByTestId('bug.screenshot'), 'valueChange', true);
    await pressAlert('Include Screenshot');
    await fireEvent.press(screen.getByTestId('bug.primary'));
    await waitFor(() => expect(screen.getByTestId('bug.sending')).toHaveTextContent('Sending report...'));
    expect(mockSubmit.mock.calls[0][0]).toEqual({
      id: expect.any(String),
      description: 'Calendar does not open.',
      metadata: DIAGNOSTICS,
      screenshotConsent: true,
      screenshot: '/9j/AA==',
    });
    await act(async () => finish({ reference: 'BR-134902' }));
    await waitFor(() => expect(screen.getByTestId('bug.reference')).toHaveTextContent('BR-134902'));
    expect(screen.getByText('Thanks for helping improve NexDo!')).toBeTruthy();
    expect(screen.getByText('Your bug report has been received.')).toBeTruthy();
    expect(screen.queryByText('Report app issue')).toBeNull();
    await fireEvent.press(screen.getByTestId('bug.copy'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('BR-134902');
    await waitFor(() => expect(screen.getByText('Reference copied')).toBeTruthy());
    expect(screen.getByTestId('bug.primary')).toHaveTextContent('Done');
    await fireEvent.press(screen.getByTestId('bug.primary'));
    expect(onDone).toHaveBeenCalled();
  });

  it('on a network failure keeps the report, locks it, and Retry Send resends the same one', async () => {
    mockSubmit.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK', message: 'offline' }));
    await show();
    await toForm('Broken');
    await fireEvent.press(screen.getByTestId('bug.primary'));
    await waitFor(() => expect(screen.getByTestId('bug.error')).toHaveTextContent('Couldn’t send the report. Check your connection and try again.'));
    expect(screen.getByText(PRESERVED)).toBeTruthy();
    expect(screen.getByTestId('bug.description').props.editable).toBe(false);
    expect(screen.getByTestId('bug.primary')).toHaveTextContent('Retry Send');

    mockSubmit.mockResolvedValueOnce({ reference: 'BR-000417' });
    await fireEvent.press(screen.getByTestId('bug.primary'));
    await waitFor(() => expect(screen.getByTestId('bug.reference')).toHaveTextContent('BR-000417'));
    expect(mockSubmit.mock.calls[1][0]).toBe(mockSubmit.mock.calls[0][0]);
  });

  it.each([
    [new ApiError({ status: 404, message: 'Not found.' }), 'Bug reporting is not available on this server yet. Please try again later.'],
    [new ApiError({ status: 401, code: 'SIGNED_OUT', message: 'Your session has expired. Please sign in again.' }), 'Your session has expired. Please sign in again before sending your report.'],
    [new ApiError({ status: 429, message: 'Too many attempts. Please try again later.' }), 'Too many attempts. Please try again later.'],
    // The server's own text for a rejected report, shown as it came (Swift shows `localizedDescription`).
    [new ApiError({ status: 400, message: 'Enter a description of 1–2,000 characters and review screenshot consent.' }), 'Enter a description of 1–2,000 characters and review screenshot consent.'],
    [new Error('boom'), 'Couldn’t send the report. Please try again later.'],
  ])('shows %s as Swift words it', async (failure, message) => {
    mockSubmit.mockRejectedValueOnce(failure);
    await show();
    await toForm('Broken');
    await fireEvent.press(screen.getByTestId('bug.primary'));
    await waitFor(() => expect(screen.getByTestId('bug.error')).toHaveTextContent(message));
  });
});
