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

/** `ShoppingEmailView` (ios/App/ShoppingEmailView.swift), closing part 1's 19 gaps. */

const CONNECTED: ShoppingEmailSnapshot = { available: true, account: { email: 'ada@gmail.com', status: 'connected' }, schedule: null };
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
    runs: [{ id: 'r1', dueAt: '2026-09-29T22:30:00.000Z', status: 'SENT', detail: 'Gmail accepted' }],
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

describe('Weekly shopping email', () => {
  it('shows Swift’s copy: the intro, the list with what will be sent, and no RN-only preview', async () => {
    await open();
    expect(screen.getByText('WEEKLY SHOPPING EMAIL')).toBeTruthy();
    expect(screen.getByText('Send your shopping list automatically')).toBeTruthy();
    expect(screen.getByText('Keep your store in sync. Save time on your weekly shop.')).toBeTruthy();
    expect(screen.getByText('Saturday groceries')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-count')).toHaveTextContent('1 to send · 2 items');
    expect(screen.getByText('Include your country code, for example +1.')).toBeTruthy();
    expect(screen.getByText('Preferred pickup time')).toBeTruthy();
    expect(screen.queryByText('Email preview')).toBeNull();
    expect(screen.queryByText('Recent emails')).toBeNull();
  });

  it('draws Time as a captioned box like Repeat, with the pill inside and no second label', async () => {
    await open();
    // `field("Time") { DatePicker(…).labelsHidden() }`: one "Time" caption, the value as a pill.
    expect(screen.getAllByText('Time')).toHaveLength(1);
    expect(screen.getByTestId('shopping-email-time').props.accessibilityLabel).toBe('Time, 10:00 AM');
    // The pickup date's `DatePicker` is `.labelsHidden()` too: only the box's "Date" caption.
    expect(screen.getAllByText('Date')).toHaveLength(1);
  });

  it('when connected, shows the account with its status and no Connect button', async () => {
    await open();
    expect(screen.getByTestId('shopping-email-account')).toHaveTextContent('ada@gmail.com');
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByTestId('shopping-email-connect')).toBeNull();
  });

  it('when not connected, offers Connect / Reconnect Gmail and the settings gear, and says why Save is off', async () => {
    await open({ available: true, account: { email: 'ada@gmail.com', status: 'needs_reauth' }, schedule: null });
    expect(screen.getByText('Needs_reauth')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-connect')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Connect Gmail with email-sending permission before saving. A Calendar connection alone cannot send email.');
    await fireEvent.press(screen.getByLabelText('Open Profile calendar settings'));
    expect(mockPush).toHaveBeenCalledWith('/account/settings');
  });

  it('says when the server has no weekly email, with Check availability again', async () => {
    await open({ available: false, account: null, schedule: null });
    expect(screen.getByText('Weekly email is not enabled on this server yet.')).toBeTruthy();
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Weekly email is unavailable on this server. Your entries are kept; check availability again after it is enabled.');
    mockGet.mockResolvedValueOnce(CONNECTED);
    await fireEvent.press(screen.getByTestId('shopping-email-check'));
    await waitFor(() => expect(screen.getByTestId('shopping-email-account')).toBeTruthy());
  });

  it('names each missing piece in turn, then saves with the pickup and the cleaned phone number', async () => {
    mockSave.mockResolvedValue(SCHEDULED);
    await open();
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Enter the store manager’s name.');
    await fireEvent.changeText(screen.getByTestId('shopping-email-name'), 'Alex');
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Enter the store manager’s email address.');
    await fireEvent.changeText(screen.getByTestId('shopping-email-recipient'), 'manager@store.com');
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Enter your phone number with country code so the store can contact you.');
    await fireEvent.changeText(screen.getByTestId('shopping-customer-phone'), '+1 (415) 555-0123');
    expect(screen.getByTestId('shopping-email-blocker')).toHaveTextContent('Turn on permission to authorize weekly emails.');
    expect(screen.getByTestId('shopping-email-save').props.accessibilityState.disabled).toBe(true);
    await fireEvent(screen.getByTestId('shopping-email-permission'), 'valueChange', true);
    expect(screen.queryByTestId('shopping-email-blocker')).toBeNull();
    expect(screen.getByLabelText('Save schedule')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shopping-email-save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const [listId, input] = mockSave.mock.calls[0];
    expect(listId).toBe('list-1');
    expect(input).toMatchObject({ recipient: 'manager@store.com', recipientName: 'Alex', customerPhone: '+14155550123', weekday: 6, hour: 10, minute: 0, consent: true, pickupStartHour: 9 });
    expect(input.pickupDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Saved: the permission resets and the status card appears.
    await waitFor(() => expect(screen.getByTestId('shopping-email-status')).toBeTruthy());
    expect(screen.getByTestId('shopping-email-permission').props.value).toBe(false);
  });

  it('fills the fields from the saved schedule once, with its pickup, and shows the status and recent emails', async () => {
    await open(SCHEDULED);
    expect(screen.getByTestId('shopping-email-name').props.value).toBe('Alex');
    expect(screen.getByTestId('shopping-customer-phone').props.value).toBe('+14155550123');
    expect(screen.getByText('Your weekly emails are active.')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Next run: Oct 6, 2026 at 6:30 PM (America/New_York)')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Gmail accepted')).toBeTruthy();
    expect(screen.getByLabelText('Save changes')).toBeTruthy();
    expect(screen.getByLabelText('Preferred pickup window, 2 PM – 3 PM')).toBeTruthy();
  });

  // `didLoadSchedule` (:48, :317): the reload after connecting does not re-seed the fields.
  it('connects Gmail, keeps the entries, and says so when the connection is cancelled', async () => {
    mockConnect.mockResolvedValue({ url: 'https://accounts.google.com/x' });
    mockGmail.mockResolvedValueOnce(null).mockResolvedValueOnce('ticket-1');
    mockConfirm.mockResolvedValue({ ok: true });
    await open({ available: true, account: null, schedule: null });
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
    await fireEvent.press(screen.getByLabelText('Pause weekly emails'));
    await waitFor(() => expect(screen.getByText('Your weekly emails are paused.')).toBeTruthy());
    expect(screen.queryByText('Next run:', { exact: false })).toBeNull();
    mockSave.mockRejectedValue(new Error('This list changed. Reload and try again.'));
    await fireEvent(screen.getByTestId('shopping-email-permission'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('shopping-email-save'));
    await waitFor(() => expect(screen.getByTestId('shopping-email-error')).toHaveTextContent('This list changed. Reload and try again.'));
  });

  it('shows a failed load and lets Check availability again retry', async () => {
    mockGet.mockRejectedValueOnce(new Error('Weekly email is temporarily unavailable.'));
    await render(<Screen />);
    await waitFor(() => expect(screen.getByTestId('shopping-email-error')).toHaveTextContent('Weekly email is temporarily unavailable.'));
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
