import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
  },
  useLocalSearchParams: () => mockParams,
  // The header buttons are part of each screen, so the mock draws them.
  Stack: {
    Screen: ({ options }: { options?: { headerLeft?: () => unknown; headerRight?: () => unknown } }) => {
      const { View } = jest.requireActual('react-native');
      const React = jest.requireActual('react');
      return React.createElement(View, null, options?.headerLeft?.() ?? null, options?.headerRight?.() ?? null);
    },
  },
}));

const mockedSMS = SMS as unknown as Record<string, jest.Mock>;

const mockPost = jest.fn();
const mockSnapshot = jest.fn();
jest.mock('../../../api/moments', () => ({
  ...jest.requireActual('../../../api/moments'),
  momentsApi: {
    snapshot: (...args: unknown[]) => mockSnapshot(...args),
    post: (...args: unknown[]) => mockPost(...args),
    deleteAll: jest.fn(async () => ({ ok: true })),
  },
}));

import * as SMS from 'expo-sms';

import type { ImportantMoment, MomentsSnapshot } from '../../../api/moments';
import { momentDate, sendDayLabel } from '../dates';
import { OPENED_UNCONFIRMED } from '../domain';
import { rememberDraft } from '../handoff';
import { momentsStore } from '../store';
import { draft, moment, plan, settings } from '../testFixtures';

import ImportantMoments from '../../../../app/(tabs)/(today)/moments/index';
import ManageMoment from '../../../../app/(tabs)/(today)/moments/manage';
import MomentEditor from '../../../../app/(tabs)/(today)/moments/editor';
import MomentSettings from '../../../../app/(tabs)/(today)/moments/settings';
import ChooseDelivery from '../../../../app/(tabs)/(today)/moments/delivery';
import WishDetails from '../../../../app/(tabs)/(today)/moments/wish';
import ChooseFestivals from '../../../../app/(tabs)/(today)/moments/festivals';
import ScheduleWish from '../../../../app/(tabs)/(today)/moments/schedule-wish';

function load(moments: ImportantMoment[], extra: Partial<MomentsSnapshot> = {}) {
  const snapshot: MomentsSnapshot = { moments, emailAccount: null, emailConfigured: false, automaticEmailEnabled: false, ...extra };
  mockSnapshot.mockResolvedValue(snapshot);
  momentsStore.setState({ snapshot, owner: 'owner', error: null, busy: false, loading: false, lastSynced: null, route: null, pendingRoute: null });
}

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockPost.mockResolvedValue({ ok: true });
});

describe('Important Moments list', () => {
  it('shows the summary card, the weekly buckets and a greeting-card group', async () => {
    const day = future(2);
    const encoded = settings({ groupID: 'g', baseMessage: 'Hi', approvedAt: '2030-01-01T00:00:00Z' });
    load([
      moment({ id: 'a', type: 'festival', title: 'Diwali', firstName: 'A', occurrenceDate: day, nextOccurrence: day, festivalSettings: encoded }),
      moment({ id: 'b', type: 'festival', title: 'Diwali', firstName: 'B', occurrenceDate: day, nextOccurrence: day, festivalSettings: encoded }),
      moment({ id: 'c', type: 'custom', title: 'Team lunch', occurrenceDate: future(3), nextOccurrence: future(3) }),
    ]);
    await render(<ImportantMoments />);
    expect(screen.getByText('2 upcoming moments')).toBeTruthy();
    expect(screen.getByText('0 wishes scheduled')).toBeTruthy();
    expect(screen.getByText('1 wish needs review')).toBeTruthy();
    expect(screen.getByText('2 ready to schedule')).toBeTruthy();
    expect(screen.getByText('Ready to schedule')).toBeTruthy();
    expect(screen.getByText('Create a personal wish')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('festival-manage-a'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moments/manage', params: { ids: 'a,b' } });
    await fireEvent.press(screen.getByLabelText('Create wish'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/moments/review', params: { id: 'c' } });
    await waitFor(() => expect(mockSnapshot).toHaveBeenCalled());
  });

  it('shows the empty state, and no message on an empty Sent tab when moments exist', async () => {
    load([]);
    await render(<ImportantMoments />);
    expect(screen.getByText('No moments yet')).toBeTruthy();
    expect(screen.getByText('Add a moment manually, or select contacts and calendars in Settings.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('moments-add'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moments/editor', params: { done: 'list' } });
  });

  it('lists wishes on the Scheduled tab and filters them by delivery', async () => {
    const d = future(5);
    load([
      moment({
        id: 'x',
        occurrenceDate: d,
        nextOccurrence: d,
        drafts: [draft({ plans: [plan({ id: 'p1', subject: 'Sam’s Birthday', scheduledAtUTC: `${d}T08:00:00Z` })] })],
      }),
    ]);
    await render(<ImportantMoments />);
    await fireEvent.press(screen.getByTestId('moments-tab-Scheduled'));
    expect(screen.getByText('Sam’s Birthday')).toBeTruthy();
    expect(screen.getByText('Confirmation required')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('moments-delivery-filter'));
    await fireEvent.press(screen.getByTestId('moments-delivery-filter-Automatic'));
    expect(screen.queryByText('Sam’s Birthday')).toBeNull();
    await fireEvent.press(screen.getByTestId('moments-tab-Sent'));
    expect(screen.queryByText('No moments yet')).toBeNull();
  });
});

describe('Manage Moment', () => {
  const day = future(20);
  const group = () => [
    moment({ id: 'a', type: 'birthday', title: 'Sam’s Birthday', firstName: 'Sam', phone: '+15555550100', occurrenceDate: day, nextOccurrence: day, sourceKey: 'birthday:g:k1', festivalSettings: settings({ groupID: 'g' }) }),
  ];

  it('shows the header card, the four steps and the in-content section title', async () => {
    load(group());
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    expect(screen.getByText('Moment Details')).toBeTruthy();
    for (const tab of ['Details', 'Contacts', 'Wish Message', 'Schedule']) expect(screen.getByTestId(`festival-tab-${tab}`)).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    // The header reads the occasion date, not the delivery date (ManageFestivalView.swift:114).
    expect(screen.getByText(`Moment date · ${sendDayLabel(momentDate(day, 'UTC'), 'UTC')}`)).toBeTruthy();
  });

  // The header used to show the delivery date. A draft send date moves delivery to another day
  // while the occasion stays put, which is exactly where the two disagreed.
  it('header shows the occasion date even when delivery is set for another day', async () => {
    const delivery = future(35);
    load([
      moment({
        id: 'a',
        type: 'birthday',
        title: 'Sam’s Birthday',
        firstName: 'Sam',
        occurrenceDate: day,
        nextOccurrence: day,
        sourceKey: 'birthday:g:k1',
        festivalSettings: settings({ groupID: 'g', draftSendDate: `${delivery}T08:00:00.000Z` }),
      }),
    ]);
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    expect(screen.getByText(`Moment date · ${sendDayLabel(momentDate(day, 'UTC'), 'UTC')}`)).toBeTruthy();
    expect(screen.queryByText(`Moment date · ${sendDayLabel(momentDate(delivery, 'UTC'), 'UTC')}`)).toBeNull();
  });

  it('changes step without saving when nothing changed, and shows the recipients', async () => {
    load(group());
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Contacts'));
    expect(screen.getByText('Recipients')).toBeTruthy();
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByText('Mobile · ••• ••• 0100')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalledWith('festivalSave', expect.anything(), undefined);
  });

  it('shows the Schedule Wish validation inline, under the button', async () => {
    load(group());
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Schedule'));
    await fireEvent.press(screen.getByTestId('festival-schedule'));
    expect(screen.getByTestId('festival-error').props.children).toBe('Review and save the message before scheduling.');
  });

  it('counts the wish message and asks before replacing an edited one', async () => {
    load(group());
    mockParams = { ids: 'a' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Wish Message'));
    await fireEvent.changeText(screen.getByTestId('festival-message'), 'Hello');
    expect(screen.getByText('5/500')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('festival-regenerate'));
    expect(alert).toHaveBeenCalledWith('Replace the edited message with a new draft?', undefined, expect.any(Array));
  });

  // ManageFestivalView.swift:168
  it('disables Save Message when the message is blank or over 500 characters', async () => {
    load(group());
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Wish Message'));
    const save = () => screen.getByTestId('festival-save-message').props.accessibilityState.disabled;

    await fireEvent.changeText(screen.getByTestId('festival-message'), 'Happy birthday!');
    expect(save()).toBe(false);

    await fireEvent.changeText(screen.getByTestId('festival-message'), '');
    expect(save()).toBe(true);

    // Whitespace only is still nothing to approve.
    await fireEvent.changeText(screen.getByTestId('festival-message'), '   \n\t ');
    expect(save()).toBe(true);

    await fireEvent.changeText(screen.getByTestId('festival-message'), 'x'.repeat(500));
    expect(save()).toBe(false);

    await fireEvent.changeText(screen.getByTestId('festival-message'), 'x'.repeat(501));
    expect(save()).toBe(true);
  });

  it('asks before discarding unsaved changes', async () => {
    load(group());
    mockParams = { ids: 'a' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('festival-name'), 'Renamed');
    await fireEvent.press(screen.getByTestId('festival-back'));
    expect(alert).toHaveBeenCalledWith('Discard unsaved changes?', undefined, expect.any(Array));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('Create Moment', () => {
  it('keeps Save disabled without a title and shows the February 29 note', async () => {
    load([]);
    await render(<MomentEditor />);
    expect(screen.getByText('February 29 is observed on February 28 in non-leap years. Dates for festivals with moving calendars must be confirmed each year.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('moment-title'), '');
    expect(screen.getByTestId('moment-save').props.accessibilityState.disabled).toBe(true);
  });

  it('starts with no recipient and a default birthday title', async () => {
    load([]);
    await render(<MomentEditor />);
    expect(screen.getByTestId('moment-title').props.value).toBe('Happy Birthday');
    expect(screen.getByTestId('moment-first-name').props.value).toBe('');
    await fireEvent.changeText(screen.getByTestId('moment-first-name'), 'Kate');
    expect(screen.getByTestId('moment-title').props.value).toBe('Kate’s Birthday');
  });

  it('opens a new birthday straight into Manage Moment after saving', async () => {
    load([]);
    const saved = moment({ id: 'new', title: 'Kate’s Birthday', firstName: 'Kate', occurrenceDate: future(30), nextOccurrence: future(30) });
    mockPost.mockResolvedValueOnce({ moment: saved });
    mockSnapshot.mockResolvedValue({ moments: [saved], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false });
    await render(<MomentEditor />);
    await fireEvent.changeText(screen.getByTestId('moment-first-name'), 'Kate');
    await fireEvent.press(screen.getByTestId('moment-save'));
    await waitFor(() => expect(screen.getByText('Moment Details')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith('save', expect.objectContaining({ type: 'birthday', title: 'Kate’s Birthday', firstName: 'Kate', source: 'manual' }), undefined);
  });

  it('asks to confirm an imported date that is missing', async () => {
    load([]);
    mockParams = { imported: JSON.stringify({ type: 'festival', title: 'Diwali Wishes', firstName: '', phone: '', email: '', occurrenceDate: '', timeZoneID: 'UTC', yearly: false, source: 'festivalCatalog', sourceKey: 'k' }) };
    await render(<MomentEditor />);
    expect(screen.getByText('I have confirmed the event date')).toBeTruthy();
    expect(screen.getByTestId('moment-save').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Choose multiple contacts')).toBeTruthy();
  });

  // MomentEditor.swift:43-45: a past date is accepted, and explained rather than rejected.
  it('explains a past date instead of refusing it, and says what repeats yearly', async () => {
    const past = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    load([]);
    mockParams = { imported: JSON.stringify({ type: 'custom', title: 'Past thing', firstName: '', phone: '', email: '', occurrenceDate: past, timeZoneID: 'UTC', yearly: false, source: 'manual', sourceKey: 'k' }) };
    await render(<MomentEditor />);
    expect(screen.getByTestId('moment-past-date').props.children).toBe('This date is in the past. You can save it, but choose a future time before scheduling delivery.');

    await fireEvent.press(screen.getByTestId('moment-yearly'));
    expect(screen.getByTestId('moment-past-date').props.children).toBe('The original date is kept; the next yearly occurrence appears in Moments.');
  });

  it('shows no past-date note for a future date', async () => {
    load([]);
    mockParams = { imported: JSON.stringify({ type: 'custom', title: 'Later', firstName: '', phone: '', email: '', occurrenceDate: future(10), timeZoneID: 'UTC', yearly: false, source: 'manual', sourceKey: 'k' }) };
    await render(<MomentEditor />);
    expect(screen.queryByTestId('moment-past-date')).toBeNull();
  });
});

describe('Moments Settings', () => {
  it('greys out Gmail when the server has no email configured, and confirms Delete all', async () => {
    load([]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<MomentSettings />);
    expect(screen.getByTestId('settings-connect').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('settings-delete-all'));
    expect(alert).toHaveBeenCalledWith('Delete all moments and cancel pending wishes?', undefined, expect.any(Array));
    await fireEvent.press(screen.getByTestId('settings-contact'));
    expect(alert).toHaveBeenLastCalledWith('Select one contact', expect.stringContaining('Nexdo will show the selected birthday'), expect.any(Array));
  });

  it('shows a connected account', async () => {
    load([], { emailAccount: { email: 'me@gmail.com', status: 'connected' }, emailConfigured: true });
    await render(<MomentSettings />);
    expect(screen.getByText('me@gmail.com')).toBeTruthy();
    expect(screen.getByText('Disconnect email')).toBeTruthy();
    expect(screen.getByTestId('settings-connect').props.accessibilityState.disabled).toBe(false);
  });

  // MomentEditor.swift:232-237 — this copy names no platform.
  it('names no platform in the reminder and Settings copy', async () => {
    load([]);
    await render(<MomentSettings />);
    expect(screen.getByText('Open Settings')).toBeTruthy();
    expect(screen.getByText('Reminders are on by default once you allow notifications. They apply to wishes you schedule; enabling them does not send messages.')).toBeTruthy();
    expect(screen.getByText('Reminders require notifications. Denied or limited Contacts and Calendar access can be changed in your phone’s Settings.')).toBeTruthy();
    expect(screen.queryByText(/iOS/)).toBeNull();
  });
});

describe('Choose Delivery', () => {
  it('explains each channel and offers Schedule for Messages', async () => {
    const item = moment({ id: 'm', type: 'custom', title: 'Lunch', phone: '+15555550100', email: 'a@b.co', drafts: [draft({ id: 'd', body: 'See you!' })] });
    load([item]);
    mockParams = { momentId: 'm', draftId: 'd' };
    await render(<ChooseDelivery />);
    expect(screen.getByText('Nexdo opens Messages. You confirm the final send.')).toBeTruthy();
    expect(screen.getByTestId('delivery-recipient').props.value).toBe('+15555550100');
    expect(screen.getByText('Open Messages')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('delivery-when-Schedule'));
    await fireEvent.press(screen.getByTestId('delivery-choose-time'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moments/schedule-wish', params: { momentId: 'm', draftId: 'd', channel: 'messages', recipient: '+15555550100' } });
    await fireEvent.press(screen.getByTestId('delivery-email'));
    expect(screen.getByText('From: Connect email in Important Moments Settings')).toBeTruthy();
    expect(screen.getByTestId('delivery-recipient').props.value).toBe('a@b.co');
    await fireEvent.press(screen.getByTestId('delivery-copy'));
    expect(screen.getByText('Copying or sharing is recorded separately from sending.')).toBeTruthy();
    // The channel card and the primary button both read "Copy".
    expect(screen.getAllByText('Copy')).toHaveLength(2);
  });

  it('copies the wish and records it as copied, not sent', async () => {
    const item = moment({ id: 'm', type: 'custom', drafts: [draft({ id: 'd', body: 'See you!' })] });
    load([item]);
    mockParams = { momentId: 'm', draftId: 'd' };
    mockPost.mockImplementation(async (operation: string) => (operation === 'schedule' ? { plan: plan({ id: 'cp', channel: 'copy' }) } : { ok: true }));
    await render(<ChooseDelivery />);
    await fireEvent.press(screen.getByTestId('delivery-copy'));
    await fireEvent.press(screen.getByTestId('delivery-send'));
    expect(mockPost).toHaveBeenCalledWith('schedule', expect.objectContaining({ channel: 'copy', sendNow: true, automaticDelivery: false }), undefined);
    expect(mockPost).toHaveBeenCalledWith('plan', { id: 'cp', action: 'copied' }, undefined);
  });
});

describe('Wish details', () => {
  it('offers edit, open Messages and cancel for a Messages wish awaiting you', async () => {
    const item = moment({ drafts: [draft({ plans: [plan({ id: 'p1' })] })] });
    load([item]);
    mockParams = { planId: 'p1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<WishDetails />);
    expect(screen.getByTestId('wish-title').props.children).toBe('Confirmation required');
    expect(screen.getByText('Review & Open Messages')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('wish-cancel'));
    expect(alert).toHaveBeenCalledWith('Cancel this wish?', undefined, expect.any(Array));
  });

  // Android's composer cannot report whether the person tapped Send, so the wish is recorded as
  // opened — not sent, and not failed — and stays awaiting confirmation.
  it('records an unverifiable Messages outcome as opened', async () => {
    mockedSMS.sendSMSAsync.mockResolvedValueOnce({ result: 'unknown' });
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    await fireEvent.press(screen.getByTestId('wish-open-messages'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('plan', { id: 'p1', action: 'opened' }, undefined));
  });

  it('records a verified send as sent and a composer error as failed', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);

    mockedSMS.sendSMSAsync.mockResolvedValueOnce({ result: 'sent' });
    await fireEvent.press(screen.getByTestId('wish-open-messages'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('plan', { id: 'p1', action: 'sent' }, undefined));

    mockedSMS.sendSMSAsync.mockRejectedValueOnce(new Error('boom'));
    await fireEvent.press(screen.getByTestId('wish-open-messages'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('plan', { id: 'p1', action: 'failed' }, undefined));
  });

  it('shows the opened, unconfirmed state once Messages has been opened', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', lastError: OPENED_UNCONFIRMED })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    expect(screen.getByTestId('wish-title').props.children).toBe('Opened — delivery not confirmed');
  });

  it('shows the scheduled confirmation and history actions', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', status: 'SENT' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    expect(screen.getByText('Your wish was submitted successfully.')).toBeTruthy();
    expect(screen.getByText('Copy message')).toBeTruthy();
    expect(screen.getByText('Reuse next year')).toBeTruthy();
  });
});

describe('Choose Festivals', () => {
  it('lists the India festivals once India is chosen', async () => {
    await render(<ChooseFestivals />);
    expect(screen.queryByText('Diwali')).toBeNull();
    await fireEvent.press(screen.getByTestId('festival-region'));
    await fireEvent.press(screen.getByTestId('festival-region-India'));
    for (const name of ['Diwali', 'Holi', 'Eid', 'Pongal']) expect(screen.getByText(name)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('festival-Diwali'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moments/editor', params: { imported: expect.stringContaining('"title":"Diwali Wishes"'), done: 'back' } });
  });
});

describe('Schedule Wish', () => {
  const setup = async () => {
    const item = moment({ id: 'm', type: 'custom', title: 'Lunch', phone: '+15555550100', drafts: [draft({ id: 'd', body: 'See you!' })] });
    load([item]);
    // The screen reads the draft through the handoff cache, as Choose Delivery leaves it.
    rememberDraft(item.drafts[0]);
    mockParams = { momentId: 'm', draftId: 'd', channel: 'messages', recipient: '+15555550100' };
    await render(<ScheduleWish />);
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // ImportantMomentsView.swift:496: the disabled state follows a one-second clock.
  it('disables the button on its own once the send time lapses', async () => {
    await setup();
    const submit = () => screen.getByTestId('schedule-wish-submit').props.accessibilityState.disabled;
    expect(submit()).toBe(false);

    // The default send time is an hour out; step past it, then let one tick land.
    await act(async () => {
      jest.setSystemTime(Date.now() + 3_600_000 + 1_000);
      jest.advanceTimersByTime(1000);
    });
    expect(submit()).toBe(true);
  });

  // `guard date > Date()` (:488): the time can lapse between the last tick and the tap.
  it('re-checks the time on submit and does not schedule a lapsed wish', async () => {
    await setup();
    // Move the clock without letting the interval fire, so the button is still enabled.
    jest.setSystemTime(Date.now() + 3_600_000 + 1_000);
    expect(screen.getByTestId('schedule-wish-submit').props.accessibilityState.disabled).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByTestId('schedule-wish-submit'));
    });
    expect(screen.getByTestId('schedule-wish-error').props.children).toBe('Choose a future time.');
    expect(mockPost).not.toHaveBeenCalledWith('schedule', expect.anything(), undefined);
  });
});
