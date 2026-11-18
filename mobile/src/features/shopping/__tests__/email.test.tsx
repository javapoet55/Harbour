import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) }, useLocalSearchParams: () => ({ id: 'list-1' }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockSave = jest.fn();
const mockPause = jest.fn();
const mockConnect = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../../../api/shopping', () => ({
  ...jest.requireActual('../../../api/shopping'),
  shoppingEmailApi: {
    get: (...args: unknown[]) => mockGet(...args),
    save: (...args: unknown[]) => mockSave(...args),
    pause: (...args: unknown[]) => mockPause(...args),
    connect: (...args: unknown[]) => mockConnect(...args),
    confirmGmail: (...args: unknown[]) => mockConfirm(...args),
  },
}));
const mockGmail = jest.fn();
jest.mock('../../moments/device', () => ({ connectGmail: (...args: unknown[]) => mockGmail(...args) }));
jest.mock('../store', () => ({
  useShopping: (select: (state: unknown) => unknown) =>
    select({
      lists: [
        {
          id: 'list-1',
          title: 'Saturday groceries',
          timeZone: 'America/Los_Angeles',
          items: [
            { id: '1', name: 'Milk', quantity: '2', size: 'litres', notes: '', checked: false },
            { id: '2', name: 'Eggs', quantity: '1', size: '', notes: '', checked: true },
          ],
        },
      ],
    }),
}));

import type { ShoppingEmailSnapshot } from '../../../api/shopping';
import Screen from '../../../../app/wellness/shopping/email';
import { displayDate, normalizedPhone, pickupWindow, saveBlocker } from '../EmailScreen';
import { deviceZone, momentDay } from '../../moments/dates';

/** `ShoppingEmailView` (ios/App/ShoppingEmailView.swift), closing part 1's 19 gaps. */

const CONNECTED: ShoppingEmailSnapshot = { available: true, supportsOneTime: true, account: { email: 'ada@gmail.com', status: 'connected' }, schedule: null };
const SCHEDULED: ShoppingEmailSnapshot = {
  ...CONNECTED,
  schedule: {
    recipient: 'manager@store.com',
    recipientName: 'Alex',
    timeZone: 'America/New_York',
    weekday: 2,
    hour: 18,
    minute: 30,
    customerPhone: '+14155550123',
    pickupDate: '2026-10-10',
    pickupStartHour: 14,
    enabled: true,
    nextRunAt: '2026-10-06T22:30:00.000Z',
    sendDate: null,
    oneTimeQueued: false,
    runs: [{ id: 'r1', dueAt: '2026-09-29T22:30:00.000Z', status: 'SENT', detail: 'Gmail accepted' }],
  },
};
/** d471768: a one-time schedule (`sendDate` set). */
const ONE_TIME: ShoppingEmailSnapshot = {
  ...CONNECTED,
  schedule: {
    recipient: 'manager@store.com',
    recipientName: 'Alex',
    timeZone: 'America/New_York',
    weekday: 6,
    hour: 10,
    minute: 0,
    customerPhone: '+14155550123',
    sendDate: '2026-10-09',
    oneTimeQueued: false,
    pickupDate: '2026-10-09',
    pickupStartHour: 11,
    enabled: true,
    nextRunAt: '2026-10-09T14:00:00.000Z',
    runs: [],
  },
};

async function open(snapshot: ShoppingEmailSnapshot = CONNECTED) {
  mockGet.mockResolvedValue(snapshot);
  await render(<Screen />);
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith('list-1'));
  await waitFor(() => expect(screen.queryByTestId('shopping-email-busy')).toBeNull());
}

async function fill() {
  await fireEvent.changeText(screen.getByTestId('shopping-email-name'), 'Alex');
  await fireEvent.changeText(screen.getByTestId('shopping-email-recipient'), 'manager@store.com');
  await fireEvent.changeText(screen.getByTestId('shopping-customer-phone'), '+1 (415) 555-0123');
}

beforeEach(() => {
  jest.clearAllMocks();
  [mockGet, mockSave, mockPause, mockConnect, mockConfirm, mockGmail].forEach((mock) => mock.mockReset());
});

describe('Shopping list email', () => {
  it('shows Swift’s copy: the intro, the list with what will be sent, and no RN-only preview', async () => {
    await open();
    // d471768: "weekly" is gone from the introduction and the list card.
    expect(screen.getByText('SHOPPING LIST EMAIL')).toBeTruthy();
    expect(screen.getByText('Send your shopping list automatically')).toBeTruthy();
    expect(
      screen.getByText('Send checked shopping items to your store manager, even when NexDo is closed. Unchecked items are excluded. If nothing is checked, the email is skipped.'),
    ).toBeTruthy();
    expect(screen.getByText('Keep your store in sync. Save time on your next shop.')).toBeTruthy();
    expect(screen.getByText('Selected list for sharing.')).toBeTruthy();
    expect(screen.getByText('Saturday groceries')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-count')).toHaveTextContent('1 to send · 2 items');
    expect(screen.getByText('Include your country code, for example +1.')).toBeTruthy();
    expect(screen.getByText('Preferred pickup time')).toBeTruthy();
    expect(screen.queryByText('Email preview')).toBeNull();
    expect(screen.queryByText('Recent emails')).toBeNull();
    expect(screen.queryByText(/weekly/i)).toBeNull();
  });

  it('draws Send time as a captioned box, with the pill inside and no second label', async () => {
    await open();
    expect(screen.getAllByText('Send time')).toHaveLength(1);
    expect(screen.getByTestId('shopping-email-time').props.accessibilityLabel).toBe('Send time, 10:00 AM');
    // The pickup date's `DatePicker` is `.labelsHidden()` too: only the box's "Date" caption.
    expect(screen.getAllByText('Date')).toHaveLength(1);
  });

  /** d471768 `scheduleCard` (ShoppingEmailView.swift:165-215): One Time by default, Repeat on request. */
  it('starts on One Time with a send date, and Repeat brings back the weekday', async () => {
    await open();
    expect(screen.getByTestId('shopping-email-frequency-oneTime').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('One Time')).toBeTruthy();
    expect(screen.getByText('Repeat')).toBeTruthy();
    expect(screen.getByText('Send date')).toBeTruthy();
    expect(screen.queryByTestId('shopping-email-weekday')).toBeNull();
    expect(screen.getByText('The list is sent once. The pickup window is a request for the store to confirm.')).toBeTruthy();
    expect(screen.getByText('Send and pickup times follow the selected timezone. Sending may take a few minutes.')).toBeTruthy();
    expect(screen.getByText('Allow NexDo to send this list once.')).toBeTruthy();
    expect(screen.getByText('Authorize one email to this recipient')).toBeTruthy();
    expect(screen.getByText('Saving replaces the schedule. You can pause it before the email is submitted.')).toBeTruthy();
    // Pickup defaults to 11 AM – 12 PM (`:47`).
    expect(screen.getByLabelText('Preferred pickup window, 11 AM – 12 PM')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('shopping-email-frequency-weekly'));
    expect(screen.getByTestId('shopping-email-frequency-weekly').props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText('Send date')).toBeNull();
    expect(screen.getByText('Repeat weekly on')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-weekday')).toBeTruthy();
    expect(screen.getByText('The list is sent weekly. The pickup window repeats from the selected date and is a request for the store to confirm.')).toBeTruthy();
    expect(screen.getByText('Allow NexDo to email this list each week.')).toBeTruthy();
    expect(screen.getByText('Authorize weekly emails to this recipient')).toBeTruthy();
  });

  it('turns permission off when the frequency changes (`.onChange(of: frequency)`)', async () => {
    await open();
    await fireEvent(screen.getByTestId('shopping-email-permission'), 'valueChange', true);
    expect(screen.getByTestId('shopping-email-permission').props.value).toBe(true);
    await fireEvent.press(screen.getByTestId('shopping-email-frequency-weekly'));
    expect(screen.getByTestId('shopping-email-permission').props.value).toBe(false);
  });

  it('when connected, shows the account with its status and no Connect button', async () => {
    await open();
    expect(screen.getByTestId('shopping-email-account')).toHaveTextContent('ada@gmail.com');
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByTestId('shopping-email-connect')).toBeNull();
  });

  it('when not connected, offers Connect / Reconnect Gmail and the settings gear, and says why Save is off', async () => {
    await open({ available: true, supportsOneTime: true, account: { email: 'ada@gmail.com', status: 'needs_reauth' }, schedule: null });
    expect(screen.getByText('Needs_reauth')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-connect')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Connect Gmail with email-sending permission before saving. A Calendar connection alone cannot send email.');
    await fireEvent.press(screen.getByLabelText('Open Profile calendar settings'));
    expect(mockPush).toHaveBeenCalledWith('/account/settings');
  });

  it('says when the server has no scheduled email, with Check availability again', async () => {
    await open({ available: false, account: null, schedule: null });
    expect(screen.getByText('Scheduled email is not enabled on this server yet.')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Scheduled email is unavailable on this server. Your entries are kept; check availability again after it is enabled.');
    mockGet.mockResolvedValueOnce(CONNECTED);
    await fireEvent.press(screen.getByTestId('shopping-email-check'));
    await waitFor(() => expect(screen.getByTestId('shopping-email-account')).toBeTruthy());
  });

  it('blocks One Time on a server without one-time scheduling, but not Repeat', async () => {
    await open({ available: true, account: { email: 'ada@gmail.com', status: 'connected' }, schedule: null });
    await fill();
    await fireEvent(screen.getByTestId('shopping-email-permission'), 'valueChange', true);
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('One-time scheduling is unavailable on this server.');
    await fireEvent.press(screen.getByTestId('shopping-email-frequency-weekly'));
    await fireEvent(screen.getByTestId('shopping-email-permission'), 'valueChange', true);
    expect(screen.queryByTestId('shopping-email-blocker')).toBeNull();
  });

  it('names each missing piece in turn, then saves one email with tomorrow’s send date and the pickup', async () => {
    mockSave.mockResolvedValue(ONE_TIME);
    await open();
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Enter the store manager’s name.');
    await fireEvent.changeText(screen.getByTestId('shopping-email-name'), 'Alex');
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Enter the store manager’s email address.');
    await fireEvent.changeText(screen.getByTestId('shopping-email-recipient'), 'manager@store.com');
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Enter your phone number with country code so the store can contact you.');
    await fireEvent.changeText(screen.getByTestId('shopping-customer-phone'), '+1 (415) 555-0123');
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Turn on permission to authorize scheduled email.');
    expect(screen.getByTestId('shopping-email-save').props.accessibilityState.disabled).toBe(true);
    await fireEvent(screen.getByTestId('shopping-email-permission'), 'valueChange', true);
    expect(screen.queryByTestId('shopping-email-blocker')).toBeNull();
    expect(screen.getByLabelText('Save schedule')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shopping-email-save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const [listId, input] = mockSave.mock.calls[0];
    const tomorrow = momentDay(Date.now() + 86_400_000, deviceZone());
    expect(listId).toBe('list-1');
    expect(input).toMatchObject({ recipient: 'manager@store.com', recipientName: 'Alex', customerPhone: '+14155550123', weekday: 6, hour: 10, minute: 0, consent: true, sendDate: tomorrow, pickupDate: tomorrow, pickupStartHour: 11 });
    // Saved: the permission resets and the status card appears.
    await waitFor(() => expect(screen.getByTestId('shopping-email-status')).toBeTruthy());
    expect(screen.getByTestId('shopping-email-permission').props.value).toBe(false);
  });

  it('saves Repeat with no send date', async () => {
    mockSave.mockResolvedValue(SCHEDULED);
    await open();
    await fill();
    await fireEvent.press(screen.getByTestId('shopping-email-frequency-weekly'));
    await fireEvent(screen.getByTestId('shopping-email-permission'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('shopping-email-save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][1]).toMatchObject({ sendDate: null, weekday: 6 });
  });

  it('fills a weekly schedule once, on Repeat, and shows the status and recent emails', async () => {
    await open(SCHEDULED);
    expect(screen.getByTestId('shopping-email-name').props.value).toBe('Alex');
    expect(screen.getByTestId('shopping-customer-phone').props.value).toBe('+14155550123');
    expect(screen.getByTestId('shopping-email-frequency-weekly').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Weekly email')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Next run: Oct 6, 2026 at 6:30 PM (America/New_York)')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Gmail accepted')).toBeTruthy();
    expect(screen.getByLabelText('Save changes')).toBeTruthy();
    expect(screen.getByLabelText('Preferred pickup window, 2 PM – 3 PM')).toBeTruthy();
  });

  it('fills a one-time schedule on One Time with its send date, and hides Next run once it is queued', async () => {
    await open({ ...ONE_TIME, schedule: { ...ONE_TIME.schedule!, oneTimeQueued: true } });
    expect(screen.getByTestId('shopping-email-frequency-oneTime').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('shopping-email-send-date')).toHaveTextContent('Oct 9, 2026');
    expect(screen.getByText('One-time email')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.queryByText('Next run:', { exact: false })).toBeNull();
  });

  it('calls a delivered one-time email Finished', async () => {
    const delivered = { ...ONE_TIME.schedule!, enabled: false, oneTimeQueued: true, runs: [{ id: 'r9', dueAt: ONE_TIME.schedule!.nextRunAt, status: 'sent', detail: null }] };
    await open({ ...ONE_TIME, schedule: delivered });
    expect(screen.getByText('Finished')).toBeTruthy();
    expect(screen.queryByText('Paused')).toBeNull();
    expect(screen.queryByLabelText('Pause scheduled email')).toBeNull();
  });

  it('calls a one-time email whose run was cancelled Paused, not Finished', async () => {
    const cancelled = { ...ONE_TIME.schedule!, enabled: false, oneTimeQueued: true, runs: [{ id: 'r9', dueAt: ONE_TIME.schedule!.nextRunAt, status: 'cancelled', detail: 'Shopping trip completed' }] };
    await open({ ...ONE_TIME, schedule: cancelled });
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.queryByText('Finished')).toBeNull();
  });

  // `didLoadSchedule` (:51, :345): the reload after connecting does not re-seed the fields.
  it('connects Gmail, keeps the entries, and says so when the connection is cancelled', async () => {
    mockConnect.mockResolvedValue({ url: 'https://accounts.google.com/x' });
    mockGmail.mockResolvedValueOnce(null).mockResolvedValueOnce('ticket-1');
    mockConfirm.mockResolvedValue({ ok: true });
    await open({ available: true, supportsOneTime: true, account: null, schedule: null });
    await fill();
    await fireEvent.press(screen.getByTestId('shopping-email-connect'));
    await waitFor(() => expect(screen.getByTestId('shopping-email-error')).toHaveTextContent('Email connection cancelled or failed.'));
    mockGet.mockResolvedValueOnce(CONNECTED);
    await fireEvent.press(screen.getByTestId('shopping-email-connect'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith('ticket-1'));
    await waitFor(() => expect(screen.getByTestId('shopping-email-account')).toBeTruthy());
    expect(screen.getByTestId('shopping-email-name').props.value).toBe('Alex');
  });

  it('pauses, and shows a refused save inline', async () => {
    mockPause.mockResolvedValue({ ...SCHEDULED, schedule: { ...SCHEDULED.schedule!, enabled: false } });
    await open(SCHEDULED);
    await fireEvent.press(screen.getByLabelText('Pause scheduled email'));
    await waitFor(() => expect(screen.getByText('Paused')).toBeTruthy());
    expect(screen.queryByText('Next run:', { exact: false })).toBeNull();
    mockSave.mockRejectedValue(new Error('This list changed. Reload and try again.'));
    await fireEvent(screen.getByTestId('shopping-email-permission'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('shopping-email-save'));
    await waitFor(() => expect(screen.getByTestId('shopping-email-error')).toHaveTextContent('This list changed. Reload and try again.'));
  });

  it('shows a failed load and lets Check availability again retry', async () => {
    mockGet.mockRejectedValueOnce(new Error('Scheduled email is temporarily unavailable.'));
    await render(<Screen />);
    await waitFor(() => expect(screen.getByTestId('shopping-email-error')).toHaveTextContent('Scheduled email is temporarily unavailable.'));
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Unable to check email setup. Tap Check availability again.');
  });
});

describe('the pure parts', () => {
  it('formats pickup windows, phone numbers and dates as Swift', () => {
    expect(pickupWindow(9)).toBe('9 AM – 10 AM');
    expect(pickupWindow(11)).toBe('11 AM – 12 PM');
    expect(pickupWindow(19)).toBe('7 PM – 8 PM');
    expect(normalizedPhone('+1 (415) 555-0123')).toBe('+14155550123');
    expect(displayDate('2026-10-06T22:30:00.000Z', 'UTC')).toBe('Oct 6, 2026 at 10:30 PM (UTC)');
    // Swift's formatter requires fractional seconds; anything else is shown as it came.
    expect(displayDate('2026-10-06T22:30:00Z', 'UTC')).toBe('2026-10-06T22:30:00Z');
    expect(saveBlocker(null, { name: '', recipient: '', phone: '', consent: false })).toBe('Unable to check email setup. Tap Check availability again.');
  });
});
