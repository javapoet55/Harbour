import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Platform, StyleSheet, Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SMS from 'expo-sms';

const mockDismissTo = jest.fn();
let mockParams: Record<string, string> = { ids: 'a' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
const mockPost = jest.fn();
const mockSnapshot = jest.fn();
jest.mock('../../../api/moments', () => ({
  ...jest.requireActual('../../../api/moments'),
  momentsApi: { snapshot: (...args: unknown[]) => mockSnapshot(...args), post: (...args: unknown[]) => mockPost(...args), deleteAll: jest.fn() },
}));

import type { ImportantMoment, MomentsSnapshot, WishDeliveryPlan } from '../../../api/moments';
import { useAppearance } from '../../../store/appearance';
import { FixedScheme, useTheme } from '../../../theme';
import { momentLabel } from '../dates';
import { MESSAGES_UNAVAILABLE, messagesUnavailableFor, sendNowNotice } from '../ScheduleReview';
import { momentsStore } from '../store';
import { draft, moment, plan, settings } from '../testFixtures';

import ManageMoment from '../../../../app/wellness/moments/manage';

/**
 * Review schedule, Send now and Schedule confirmed (ManageFestivalView.swift:348-634). Every server
 * answer and the Messages composer are mocked: nothing is sent.
 */

/** jest.setup.js: iOS Modal dismissals, held while a test looks at the sheet sliding away. */
const modalDismissals = (global as unknown as { modalDismissals: { hold: boolean; flush: () => void } }).modalDismissals;
const settle = () => act(async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
});

let platform: { restore: () => void } | null = null;
const onAndroid = () => {
  platform = jest.replaceProperty(Platform, 'OS', 'android');
};
afterEach(() => {
  platform?.restore();
  platform = null;
});

const sms = SMS as unknown as { isAvailableAsync: jest.Mock; sendSMSAsync: jest.Mock };
const DAY = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const EMAIL_READY: Partial<MomentsSnapshot> = { emailAccount: { email: 'me@gmail.com', status: 'connected' }, emailConfigured: true, automaticEmailEnabled: true };
const APPROVED = { groupID: 'g', baseMessage: 'Have a wonderful day!', approvedAt: '2030-08-30T00:00:00Z' };

function person(id: string, name: string, extra: Partial<ImportantMoment> = {}, selected: Record<string, boolean> = {}, channels: Record<string, string> = {}) {
  return moment({
    id,
    type: 'birthday',
    title: 'Sam’s Birthday',
    firstName: name,
    phone: '+15555550100',
    occurrenceDate: DAY,
    nextOccurrence: DAY,
    sourceKey: `birthday:g:${id}`,
    festivalSettings: settings({ ...APPROVED, selected, channels }),
    ...extra,
  });
}

function load(moments: ImportantMoment[], extra: Partial<MomentsSnapshot> = {}) {
  const snapshot: MomentsSnapshot = { moments, emailAccount: null, emailConfigured: false, automaticEmailEnabled: false, ...extra };
  mockSnapshot.mockResolvedValue(snapshot);
  momentsStore.setState({ snapshot, owner: 'owner', error: null, busy: false, loading: false });
}

/** Answers the schedule and send operations; `connectStatus` says connect calls are off. */
function serve(sendNowPlans: (momentID: string) => WishDeliveryPlan[] = () => []) {
  mockPost.mockImplementation(async (operation: string, input: Record<string, unknown>) => {
    switch (operation) {
      case 'connectStatus':
        return { available: false, callerId: null, userTimeZone: 'UTC', moments: [] };
      case 'generate':
      case 'approve':
        return { draft: draft({ id: `d-${input.momentID ?? input.id}` }) };
      case 'schedule':
        return { plan: plan({ id: `p-${input.draftID}`, scheduledAtUTC: input.scheduledAtUTC as string, timeZoneID: 'UTC' }) };
      case 'sendGreetingNow':
        return { plans: sendNowPlans(input.momentID as string) };
      default:
        return { ok: true };
    }
  });
}
const calls = (operation: string) => mockPost.mock.calls.filter(([name]) => name === operation).map(([, input]) => input);

async function openReview(moments: ImportantMoment[], extra: Partial<MomentsSnapshot> = {}) {
  load(moments, extra);
  mockParams = { ids: moments.map((item) => item.id).join(',') };
  await render(<ManageMoment />);
  await fireEvent.press(screen.getByTestId('festival-tab-Schedule'));
  await fireEvent.press(screen.getByTestId('festival-schedule'));
  await waitFor(() => expect(screen.getByText('Review schedule')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  sms.isAvailableAsync.mockResolvedValue(true);
  sms.sendSMSAsync.mockResolvedValue({ result: 'sent' });
  serve();
});

describe('Review schedule', () => {
  it('reviews the wish, the date and the recipient before anything is confirmed', async () => {
    await openReview([person('a', 'Sam')]);
    const review = within(screen.getByTestId('schedule-review'));
    expect(review.getByText('Let’s make sure everything looks good.')).toBeTruthy();
    expect(review.getByTestId('schedule-wish-heading').props.children).toBe('Happy Birthday, Sam!');
    expect(review.getByText('Scheduled for')).toBeTruthy();
    expect(review.getByText(momentLabel(Date.parse(`${DAY}T08:00:00Z`), 'UTC'))).toBeTruthy();
    expect(review.getByText('Messages · Will be sent by you')).toBeTruthy();
    expect(review.getByText('At the scheduled time, we’ll remind you to open the prepared wish and tap Send in Messages. Nexdo does not send Messages automatically.')).toBeTruthy();
    expect(review.getByText('Send Now')).toBeTruthy();
    expect(review.getByText('Confirm Schedule')).toBeTruthy();
    expect(calls('schedule')).toHaveLength(0);
  });

  it('stacks Send Now and Confirm Schedule when a label would wrap (`ViewThatFits`)', async () => {
    await openReview([person('a', 'Sam')]);
    const row = () => StyleSheet.flatten(screen.getByTestId('review-delivery-buttons').props.style);
    expect(row().flexDirection).toBe('row');
    // Android reports the laid-out lines; two lines at half the row means the pair does not fit.
    await act(async () => {
      screen.getByText('Confirm Schedule').props.onTextLayout({ nativeEvent: { lines: [{}, {}] } });
    });
    expect(row().flexDirection).toBe('column');
  });

  it('confirms the schedule and shows Schedule confirmed, then Done returns to Moments', async () => {
    await openReview([person('a', 'Sam')]);
    await fireEvent.press(screen.getByTestId('wish-primary'));
    await waitFor(() => expect(screen.getByText('Schedule confirmed!')).toBeTruthy());
    expect(calls('schedule')).toHaveLength(1);
    expect(screen.getByText('We’ll remind you, the sender, to tap Send in Messages')).toBeTruthy();
    expect(screen.getByTestId('festival-confirmation-recipients').props.children).toBe('For all 1 selected contact');
    expect(screen.getByTestId('schedule-confirmed-date').props.children).toBe(momentLabel(Date.parse(`${DAY}T08:00:00Z`), 'UTC'));
    expect(screen.getByTestId('schedule-wish-heading').props.children).toBe('Happy Birthday, Sam!');
    // No "Manage scheduled wish" and no Back: only Done.
    expect(screen.queryByText('Manage scheduled wish')).toBeNull();
    await fireEvent.press(screen.getByTestId('wish-primary'));
    expect(mockDismissTo).toHaveBeenCalledWith('/wellness/moments');
  });

  it('shows Schedule confirmed only once the review sheet has closed', async () => {
    modalDismissals.hold = true;
    await openReview([person('a', 'Sam')]);
    await fireEvent.press(screen.getByTestId('wish-primary'));
    await waitFor(() => expect(calls('schedule')).toHaveLength(1));
    await settle();
    // The review sheet is hidden but still sliding away: no success screen under it yet.
    expect(screen.queryByText('Schedule confirmed!')).toBeNull();
    await act(async () => modalDismissals.flush());
    await waitFor(() => expect(screen.getByText('Schedule confirmed!')).toBeTruthy());
  });

  it('Android: shows Schedule confirmed once the hidden review sheet is committed', async () => {
    onAndroid();
    // Android reads the notification status before it schedules the wish's reminder.
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true } as never);
    await openReview([person('a', 'Sam')]);
    await fireEvent.press(screen.getByTestId('wish-primary'));
    await waitFor(() => expect(screen.getByText('Schedule confirmed!')).toBeTruthy());
  });

  it('saves a recipient edited in the review before scheduling', async () => {
    await openReview([person('a', 'Sam')]);
    await fireEvent.press(screen.getByTestId('review-edit-recipient-a'));
    await fireEvent.changeText(screen.getByTestId('review-recipient-name'), '');
    expect(screen.getByTestId('review-recipient-done').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('review-recipient-name'), 'Sammy');
    await fireEvent.press(screen.getByTestId('review-recipient-done'));
    expect(within(screen.getByTestId('schedule-review')).getByText('Sammy')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('wish-primary'));
    // The edit withdrew the approval, so the message is approved and saved again first.
    await waitFor(() => expect(calls('festivalSave')).toEqual([expect.objectContaining({ recipients: [expect.objectContaining({ name: 'Sammy' })] })]));
  });

  it('shows two recipients, then the rest with Show more…', async () => {
    const all = { a: true, b: true, c: true };
    await openReview([person('a', 'Sam', {}, all), person('b', 'Lee', { phone: '+15555550101' }, all), person('c', 'Ana', { phone: '+15555550102' }, all)]);
    expect(screen.queryByTestId('review-edit-recipient-c')).toBeNull();
    await fireEvent.press(screen.getByText('Show more…'));
    expect(screen.getByTestId('review-edit-recipient-c')).toBeTruthy();
    expect(screen.getByText('Show less')).toBeTruthy();
  });
});

describe('Send now', () => {
  const email = (momentID: string): WishDeliveryPlan[] => [
    plan({ id: `e-${momentID}`, channel: 'email', recipient: 'sam@example.com', status: 'SENT' }),
    plan({ id: `m-${momentID}`, channel: 'messages', recipient: '+15555550100', status: 'AWAITING_CONFIRMATION', body: 'Happy Birthday, Sam!' }),
  ];

  it('asks once more, listing who gets what, and Cancel sends nothing', async () => {
    await openReview([person('a', 'Sam', { email: 'sam@example.com' })]);
    await fireEvent.press(screen.getByTestId('review-send-now'));
    const sheet = within(screen.getByTestId('send-now-sheet'));
    expect(sheet.getByText('Email is sent now where an address is saved. Messages opens for you to tap Send. Missing channels are skipped.')).toBeTruthy();
    expect(sheet.getByText('sam@example.com')).toBeTruthy();
    expect(sheet.getByText('+15555550100')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('send-now-cancel'));
    expect(calls('sendGreetingNow')).toHaveLength(0);
  });

  it('sends the email, opens Messages for the phone, and reports what went out', async () => {
    serve(email);
    await openReview([person('a', 'Sam', { email: 'sam@example.com' })]);
    await fireEvent.press(screen.getByTestId('review-send-now'));
    await fireEvent.press(screen.getByTestId('send-now-confirm'));
    await waitFor(() => expect(screen.getByTestId('review-send-now-notice').props.children).toBe('1 email sent. Messages still requires you to tap Send.'));
    expect(calls('sendGreetingNow')).toEqual([expect.objectContaining({ momentID: 'a', approved: true, body: 'Happy Birthday, Sam! Have a wonderful day!' })]);
    await waitFor(() => expect(sms.sendSMSAsync).toHaveBeenCalledWith(['+15555550100'], 'Happy Birthday, Sam!'));
    // A send the composer confirmed is recorded as sent.
    await waitFor(() => expect(calls('plan')).toEqual([expect.objectContaining({ id: 'm-a', action: 'sent' })]));
    // From here: Continue Send Now or Done, and the rows can no longer be edited.
    expect(screen.getByText('Continue Send Now')).toBeTruthy();
    expect(screen.getByTestId('review-edit-date').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('review-done'));
    await waitFor(() => expect(screen.queryByText('Review schedule')).toBeNull());
  });

  it('starts sending only once the Send now sheet has closed', async () => {
    serve(email);
    modalDismissals.hold = true;
    await openReview([person('a', 'Sam', { email: 'sam@example.com' })]);
    await fireEvent.press(screen.getByTestId('review-send-now'));
    await fireEvent.press(screen.getByTestId('send-now-confirm'));
    await settle();
    expect(calls('sendGreetingNow')).toHaveLength(0);
    expect(sms.isAvailableAsync).not.toHaveBeenCalled();
    await act(async () => modalDismissals.flush());
    await waitFor(() => expect(calls('sendGreetingNow')).toHaveLength(1));
    await waitFor(() => expect(sms.sendSMSAsync).toHaveBeenCalled());
  });

  it('Cancel on the Send now sheet sends nothing once it has closed', async () => {
    await openReview([person('a', 'Sam', { email: 'sam@example.com' })]);
    await fireEvent.press(screen.getByTestId('review-send-now'));
    await fireEvent.press(screen.getByTestId('send-now-cancel'));
    await settle();
    expect(calls('sendGreetingNow')).toHaveLength(0);
  });

  it('Android: sends once the hidden Send now sheet is committed', async () => {
    onAndroid();
    serve(email);
    await openReview([person('a', 'Sam', { email: 'sam@example.com' })]);
    await fireEvent.press(screen.getByTestId('review-send-now'));
    await fireEvent.press(screen.getByTestId('send-now-confirm'));
    await waitFor(() => expect(calls('sendGreetingNow')).toHaveLength(1));
  });

  it('sends nothing when Messages is not available for a phone recipient', async () => {
    sms.isAvailableAsync.mockResolvedValue(false);
    await openReview([person('a', 'Sam')]);
    await fireEvent.press(screen.getByTestId('review-send-now'));
    await fireEvent.press(screen.getByTestId('send-now-confirm'));
    await waitFor(() => expect(screen.getByTestId('review-schedule-error').props.children).toBe(MESSAGES_UNAVAILABLE));
    expect(calls('sendGreetingNow')).toHaveLength(0);
  });

  it('sends an Email recipient with a phone when Messages is not available, without opening the composer', async () => {
    sms.isAvailableAsync.mockResolvedValue(false);
    serve(email);
    await openReview([person('a', 'Sam', { email: 'sam@example.com' }, {}, { a: 'email' })], EMAIL_READY);
    await fireEvent.press(screen.getByTestId('review-send-now'));
    await fireEvent.press(screen.getByTestId('send-now-confirm'));
    await waitFor(() => expect(screen.getByTestId('review-send-now-notice').props.children).toBe('1 email sent. Messages still requires you to tap Send.'));
    expect(calls('sendGreetingNow')).toEqual([expect.objectContaining({ momentID: 'a' })]);
    expect(screen.queryByTestId('review-schedule-error')).toBeNull();
    expect(sms.sendSMSAsync).not.toHaveBeenCalled();
  });

  it('with Messages unavailable, still sends the Email recipients and names the Messages ones left out', async () => {
    sms.isAvailableAsync.mockResolvedValue(false);
    serve(email);
    const all = { a: true, b: true };
    const channels = { a: 'email', b: 'messages' };
    await openReview([person('a', 'Sam', { email: 'sam@example.com' }, all, channels), person('b', 'Lee', { phone: '+15555550101' }, all, channels)], EMAIL_READY);
    await fireEvent.press(screen.getByTestId('review-send-now'));
    await fireEvent.press(screen.getByTestId('send-now-confirm'));
    await waitFor(() => expect(screen.getByTestId('review-schedule-error').props.children).toBe(messagesUnavailableFor(['Lee'])));
    expect(messagesUnavailableFor(['Lee'])).toBe('Messages is not available on this device. No greeting has been sent to Lee.');
    expect(calls('sendGreetingNow')).toEqual([expect.objectContaining({ momentID: 'a' })]);
    expect(sms.sendSMSAsync).not.toHaveBeenCalled();
  });

  it('words the notice for pending or failed email', () => {
    expect(sendNowNotice([plan({ channel: 'email', status: 'SENT' }), plan({ channel: 'email', status: 'FAILED' })])).toBe(
      '1 email sent. Some emails are pending or failed; check Scheduled wishes for their status. Messages still requires you to tap Send.',
    );
    expect(sendNowNotice([])).toBe('0 emails sent. Messages still requires you to tap Send.');
  });
});

describe('FixedScheme', () => {
  function Probe() {
    return <Text testID="probe">{useTheme().scheme}</Text>;
  }
  afterEach(() => useAppearance.setState({ appearance: 'system' }));

  it('keeps the schedule design light in Night, and nothing outside it', async () => {
    useAppearance.setState({ appearance: 'night' });
    await render(
      <>
        <FixedScheme scheme="light">
          <Probe />
        </FixedScheme>
      </>,
    );
    expect(screen.getByTestId('probe').props.children).toBe('light');
    await act(async () => {
      await render(<Probe />);
    });
    expect(screen.getByTestId('probe').props.children).toBe('dark');
  });
});
