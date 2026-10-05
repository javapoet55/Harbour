import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert, Platform, StyleSheet } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
let mockParams: Record<string, string> = {};
/** Every focus callback a screen registered, so a test can bring the screen back into focus. */
const mockFocusCallbacks: (() => void)[] = [];
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
  },
  useLocalSearchParams: () => mockParams,
  // Runs the callback on mount, like a first focus, and records it so a test can focus the screen again.
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(() => {
      mockFocusCallbacks.push(callback);
      callback();
    }, [callback]);
  },
  // The header buttons are part of each screen, so the mock draws them.
  Stack: {
    Screen: ({ options }: { options?: { headerLeft?: () => unknown; headerRight?: () => unknown } }) => {
      const { View } = jest.requireActual('react-native');
      const React = jest.requireActual('react');
      return React.createElement(View, null, options?.headerLeft?.() ?? null, options?.headerRight?.() ?? null);
    },
  },
}));

const mockOpenAuthSession = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
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
import * as Contacts from 'expo-contacts/legacy';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ImportantMoment, MomentsSnapshot } from '../../../api/moments';
import { momentDate, sendDayLabel } from '../dates';
import { newMomentInput, OPENED_UNCONFIRMED } from '../domain';
import { MomentEditorView } from '../MomentEditorView';
import { rememberDraft } from '../handoff';
import { momentsStore } from '../store';
import { draft, moment, plan, settings } from '../testFixtures';
import { deliverOAuthCallback, redirectOAuthCallback, resetOAuthCallbacks } from '../../../lib/oauthCallbacks';

import ImportantMoments from '../../../../app/wellness/moments/index';
import ManageMoment from '../../../../app/wellness/moments/manage';
import MomentEditor from '../../../../app/wellness/moments/editor';
import MomentSettings from '../../../../app/wellness/moments/settings';
import ChooseDelivery from '../../../../app/wellness/moments/delivery';
import WishDetails from '../../../../app/wellness/moments/wish';
import ChooseFestivals from '../../../../app/wellness/moments/festivals';
import ScheduleWish from '../../../../app/wellness/moments/schedule-wish';
import ReviewWish from '../../../../app/wellness/moments/review';

function load(moments: ImportantMoment[], extra: Partial<MomentsSnapshot> = {}) {
  const snapshot: MomentsSnapshot = { moments, emailAccount: null, emailConfigured: false, automaticEmailEnabled: false, ...extra };
  mockSnapshot.mockResolvedValue(snapshot);
  momentsStore.setState({ snapshot, owner: 'owner', error: null, busy: false, loading: false, lastSynced: null, route: null, pendingRoute: null });
}

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** `generate` waits until the test settles it; every other operation answers `{ ok: true }` at once. */
function pendingGenerate() {
  const settle: { resolve: (value: unknown) => void; reject: (error: unknown) => void } = { resolve: () => undefined, reject: () => undefined };
  mockPost.mockImplementation((operation: string) =>
    operation === 'generate'
      ? new Promise((resolve, reject) => {
          settle.resolve = resolve;
          settle.reject = reject;
        })
      : Promise.resolve({ ok: true }),
  );
  return {
    resolve: (value: unknown) => act(async () => settle.resolve(value)),
    reject: (error: unknown) => act(async () => settle.reject(error)),
  };
}
const generateCalls = () => mockPost.mock.calls.filter(([operation]) => operation === 'generate');
const isDisabled = (testID: string) => Boolean(screen.getByTestId(testID).props.accessibilityState?.disabled);
const opacity = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style).opacity;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockPost.mockResolvedValue({ ok: true });
});

describe('Important Moments list', () => {
  // Phase 12: the date chips replace the weekly buckets (ImportantMomentsView.swift:256-281).
  it('shows the summary card, the date chips with Today first, and a greeting-card group', async () => {
    const today = future(0);
    const encoded = settings({ groupID: 'g', baseMessage: 'Hi', approvedAt: '2030-01-01T00:00:00Z' });
    load([
      moment({ id: 'a', type: 'festival', title: 'Diwali', firstName: 'A', occurrenceDate: today, nextOccurrence: today, festivalSettings: encoded }),
      moment({ id: 'b', type: 'festival', title: 'Diwali', firstName: 'B', occurrenceDate: today, nextOccurrence: today, festivalSettings: encoded }),
      moment({ id: 'c', type: 'custom', title: 'Team lunch', occurrenceDate: future(1), nextOccurrence: future(1) }),
    ]);
    await render(<ImportantMoments />);
    expect(screen.getByText('2 upcoming moments')).toBeTruthy();
    expect(screen.getByText('0 wishes scheduled')).toBeTruthy();
    expect(screen.getByText('1 wish needs review')).toBeTruthy();
    expect(screen.getByText('2 ready to schedule')).toBeTruthy();
    // Each chip counts the groups it would show; Today is selected first.
    expect(screen.getByText('Today (1)')).toBeTruthy();
    expect(screen.getByText('Tomorrow (1)')).toBeTruthy();
    expect(screen.getByTestId('moments-period-Today').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('Ready to schedule')).toBeTruthy();
    // Tomorrow's custom moment is not on Today.
    expect(screen.queryByText('Create a personal wish')).toBeNull();
    await fireEvent.press(screen.getByTestId('festival-manage-a'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/moments/manage', params: { ids: 'a,b' } });
    await fireEvent.press(screen.getByTestId('moments-period-Tomorrow'));
    expect(screen.queryByText('Diwali')).toBeNull();
    expect(screen.getByText('Create a personal wish')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Create wish'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/wellness/moments/review', params: { id: 'c' } });
    await waitFor(() => expect(mockSnapshot).toHaveBeenCalled());
  });

  // `ContentUnavailableView("No moments \(…)")` (:279-281) replaced "No moments yet".
  it('shows the chosen chip’s empty state', async () => {
    load([]);
    await render(<ImportantMoments />);
    expect(screen.getByText('No moments today')).toBeTruthy();
    expect(screen.getByText('Choose another date filter or add a moment.')).toBeTruthy();
    expect(screen.queryByText('No moments yet')).toBeNull();
    for (const [chip, title] of [['Tomorrow', 'No moments tomorrow'], ['This Week', 'No moments this week'], ['Later', 'No moments later']]) {
      expect(screen.getByText(`${chip} (0)`)).toBeTruthy();
      await fireEvent.press(screen.getByTestId(`moments-period-${chip}`));
      expect(screen.getByText(title)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId('moments-add'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/moments/editor', params: { done: 'list' } });
  });

  // ImportantMomentsView.swift:274-276, :293: the wish tabs answer for their own filtered plans.
  it('shows a per-tab empty state when no wish matches, even though moments exist', async () => {
    const d = future(5);
    load([moment({ id: 'x', occurrenceDate: d, nextOccurrence: d })]);
    await render(<ImportantMoments />);

    await fireEvent.press(screen.getByTestId('moments-tab-Scheduled'));
    expect(screen.getByText('No scheduled wishes')).toBeTruthy();
    expect(screen.getByText('Wishes matching your filters will appear here.')).toBeTruthy();
    expect(screen.queryByTestId('moments-empty')).toBeNull();

    await fireEvent.press(screen.getByTestId('moments-tab-Sent'));
    expect(screen.getByText('No sent wishes yet')).toBeTruthy();
    expect(screen.queryByTestId('moments-empty')).toBeNull();
  });

  // The filter, not the absence of moments, decides the wish tabs' empty state.
  it('shows the Scheduled empty state when the delivery filter excludes every wish', async () => {
    const d = future(5);
    load([
      moment({
        id: 'x',
        occurrenceDate: d,
        nextOccurrence: d,
        drafts: [draft({ plans: [plan({ id: 'p1', scheduledAtUTC: `${d}T08:00:00Z` })] })],
      }),
    ]);
    await render(<ImportantMoments />);
    await fireEvent.press(screen.getByTestId('moments-tab-Scheduled'));
    expect(screen.queryByText('No scheduled wishes')).toBeNull();

    await fireEvent.press(screen.getByTestId('moments-delivery-filter'));
    await fireEvent.press(screen.getByTestId('moments-delivery-filter-Automatic'));
    expect(screen.getByText('No scheduled wishes')).toBeTruthy();
  });

  it('keeps the date chips and their empty state on Upcoming only', async () => {
    load([]);
    await render(<ImportantMoments />);
    expect(screen.getByTestId('moments-period-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('moments-tab-Scheduled'));
    expect(screen.queryByTestId('moments-period-empty')).toBeNull();
    expect(screen.queryByTestId('moments-periods')).toBeNull();
    expect(screen.getByText('No scheduled wishes')).toBeTruthy();
  });

  // `MomentScheduleSummary` badges, one per send time (ImportantMomentsView.swift:148-150).
  it('badges a group’s scheduled wishes by send time, and keeps the gear on the card', async () => {
    const day = future(0);
    const encoded = settings({ groupID: 'g', baseMessage: 'Hi', approvedAt: '2030-01-01T00:00:00Z' });
    const scheduled = (id: string, time: string) => [draft({ id: `d${id}`, momentID: id, plans: [plan({ id: `p${id}`, draftID: `d${id}`, scheduledAtUTC: `${day}T${time}:00.000Z` })] })];
    load([
      moment({ id: 'a', type: 'birthday', title: 'Sam’s Birthday', firstName: 'A', occurrenceDate: day, nextOccurrence: day, festivalSettings: encoded, drafts: scheduled('a', '23:58') }),
      moment({ id: 'b', type: 'birthday', title: 'Sam’s Birthday', firstName: 'B', occurrenceDate: day, nextOccurrence: day, festivalSettings: encoded, drafts: scheduled('b', '23:58') }),
      moment({ id: 'c', type: 'birthday', title: 'Sam’s Birthday', firstName: 'C', occurrenceDate: day, nextOccurrence: day, festivalSettings: encoded, drafts: scheduled('c', '23:59') }),
    ]);
    await render(<ImportantMoments />);
    expect(screen.getByText('2 scheduled @ 11:58 PM')).toBeTruthy();
    expect(screen.getByText('1 scheduled @ 11:59 PM')).toBeTruthy();
    expect(screen.getByLabelText('Manage Sam’s Birthday')).toBeTruthy();
  });

  it('puts a moment beyond this week under Later only', async () => {
    const later = future(9);
    load([moment({ id: 'l', type: 'custom', title: 'Far lunch', occurrenceDate: later, nextOccurrence: later })]);
    await render(<ImportantMoments />);
    expect(screen.getByText('Later (1)')).toBeTruthy();
    expect(screen.getByText('This Week (0)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('moments-period-Later'));
    expect(screen.getByText('Far lunch')).toBeTruthy();
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
    expect(screen.getByText('Scheduled — manual send')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('moments-delivery-filter'));
    await fireEvent.press(screen.getByTestId('moments-delivery-filter-Automatic'));
    expect(screen.queryByText('Sam’s Birthday')).toBeNull();
    await fireEvent.press(screen.getByTestId('moments-tab-Sent'));
    expect(screen.queryByText('No moments yet')).toBeNull();
  });
});

/**
 * Moments issue A: after the worker sent an automatic email, the wish stayed under Scheduled. The list
 * refreshed only on mount; SwiftUI's `.task` re-runs whenever the list appears again.
 */
describe('Moments list after an automatic send', () => {
  const d = future(5);
  const withPlans = (plans: ReturnType<typeof plan>[]) => [
    moment({ id: 'x', title: 'Sam’s Birthday', occurrenceDate: d, nextOccurrence: d, drafts: [draft({ plans })] }),
  ];

  it('moves the wish to Sent when the list comes back into focus', async () => {
    load(withPlans([plan({ id: 'p1', subject: 'Sam’s Birthday', channel: 'email', automaticDelivery: true, status: 'SCHEDULED', scheduledAtUTC: `${d}T08:00:00Z` })]));
    mockFocusCallbacks.length = 0;
    await render(<ImportantMoments />);
    await fireEvent.press(screen.getByTestId('moments-tab-Scheduled'));
    await waitFor(() => expect(screen.getByText('Auto-send scheduled')).toBeTruthy());
    const fetches = mockSnapshot.mock.calls.length;

    // The worker sends it while the person is on another screen.
    load(withPlans([plan({ id: 'p1', subject: 'Sam’s Birthday', channel: 'email', automaticDelivery: true, status: 'SENT', sentAt: `${d}T08:00:05Z`, scheduledAtUTC: `${d}T08:00:00Z` })]));
    await act(async () => mockFocusCallbacks[mockFocusCallbacks.length - 1]());

    await waitFor(() => expect(mockSnapshot.mock.calls.length).toBeGreaterThan(fetches));
    await waitFor(() => expect(screen.getByText('No scheduled wishes')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('moments-tab-Sent'));
    expect(within(screen.getByTestId('plan-card-p1')).getByText('Sent')).toBeTruthy();
  });

  // service.ts:167-168: a sent yearly wish gets next year's plan at once, as SCHEDULED. Both tabs are right.
  it('lists a yearly wish under Sent and next year’s under Scheduled', async () => {
    const nextYear = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
    load(
      withPlans([
        plan({ id: 'p1', subject: 'Sam’s Birthday', channel: 'email', automaticDelivery: true, repeatYearly: true, status: 'SENT', sentAt: `${d}T08:00:05Z`, scheduledAtUTC: `${d}T08:00:00Z` }),
        plan({ id: 'p2', subject: 'Sam’s Birthday', channel: 'email', automaticDelivery: true, repeatYearly: true, status: 'SCHEDULED', scheduledAtUTC: `${nextYear}T08:00:00Z` }),
      ]),
    );
    await render(<ImportantMoments />);
    await fireEvent.press(screen.getByTestId('moments-tab-Scheduled'));
    await waitFor(() => expect(within(screen.getByTestId('plan-card-p2')).getByText('Auto-send scheduled')).toBeTruthy());
    expect(screen.queryByTestId('plan-card-p1')).toBeNull();
    await fireEvent.press(screen.getByTestId('moments-tab-Sent'));
    expect(within(screen.getByTestId('plan-card-p1')).getByText('Sent')).toBeTruthy();
    expect(screen.queryByTestId('plan-card-p2')).toBeNull();
  });
});

describe('Manage Moment', () => {
  const day = future(20);
  const group = (settingsOverrides: Record<string, unknown> = {}) => [
    moment({
      id: 'a',
      type: 'birthday',
      title: 'Sam’s Birthday',
      firstName: 'Sam',
      phone: '+15555550100',
      occurrenceDate: day,
      nextOccurrence: day,
      sourceKey: 'birthday:g:k1',
      festivalSettings: settings({ groupID: 'g', ...settingsOverrides }),
    }),
  ];

  /** docs/android-polish.md §9: the three steps share one size, each as wide as its label. */
  it('draws the three steps at one size on Android, dropping together when they do not fit', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load(group());
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    const tabs = ['Contacts', 'Message', 'Schedule'];
    const size = (tab: string) => StyleSheet.flatten(within(screen.getByTestId(`festival-tab-${tab}`)).getByText(tab).props.style).fontSize;
    const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 64 } } });

    // No per-tab shrink: each label is one line of plain text, not a FitText.
    for (const tab of tabs) expect(within(screen.getByTestId(`festival-tab-${tab}`)).getByText(tab).props.numberOfLines).toBe(1);

    // Three short labels fit a 360dp row at full size, and drop a step together on a narrow one.
    for (const [index, width] of [66, 62, 66].entries()) {
      await fireEvent(screen.getByTestId(`festival-tabs-measure-${index}`, { includeHiddenElements: true }), 'layout', layout(width));
    }
    await fireEvent(screen.getByTestId('festival-tabs'), 'layout', layout(360));
    expect(tabs.map(size)).toEqual([15, 15, 15]);
    await fireEvent(screen.getByTestId('festival-tabs'), 'layout', layout(200));
    expect(tabs.map(size)).toEqual([13, 13, 13]);

    // Contacts is the first step, on the filled indigo pill, and a tab still switches the step.
    expect(StyleSheet.flatten(screen.getByTestId('festival-tab-Contacts').props.style).backgroundColor).toBe('#3D29F0');
    await fireEvent.press(screen.getByTestId('festival-tab-Message'));
    expect(StyleSheet.flatten(screen.getByTestId('festival-tab-Message').props.style).backgroundColor).toBe('#3D29F0');
    jest.restoreAllMocks();
  });

  it('opens on Contacts, with the header card, the three steps and the in-content section title', async () => {
    load(group());
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    expect(screen.getByText('Recipients')).toBeTruthy();
    for (const tab of ['Contacts', 'Message', 'Schedule']) expect(screen.getByTestId(`festival-tab-${tab}`)).toBeTruthy();
    for (const old of ['Details', 'Wish Message']) expect(screen.queryByTestId(`festival-tab-${old}`)).toBeNull();
    expect(screen.getByText('Active')).toBeTruthy();
    // The header reads the moment's own date, not the delivery date (ManageFestivalView.swift:155).
    expect(within(screen.getByTestId('festival-send-date')).getByText(sendDayLabel(momentDate(day, 'UTC'), 'UTC'))).toBeTruthy();
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
    expect(within(screen.getByTestId('festival-send-date')).getByText(sendDayLabel(momentDate(day, 'UTC'), 'UTC'))).toBeTruthy();
    expect(within(screen.getByTestId('festival-send-date')).queryByText(sendDayLabel(momentDate(delivery, 'UTC'), 'UTC'))).toBeNull();
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
    // A saved but unapproved message, so the block is the approval and not the empty wish.
    load(group({ baseMessage: 'Happy Diwali' }));
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
    await fireEvent.press(screen.getByTestId('festival-tab-Message'));
    await fireEvent.changeText(screen.getByTestId('festival-message'), 'Hello');
    expect(screen.getByText('5/500')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('festival-regenerate'));
    expect(alert).toHaveBeenCalledWith('Replace the edited message with a new draft?', undefined, expect.any(Array));
  });

  describe('while a wish is being written (android-polish.md §14)', () => {
    // Puts `Platform.OS` back, so the iOS twin runs as iOS.
    afterEach(() => jest.restoreAllMocks());
    const tones = ['Warm', 'Personal', 'Short', 'Fun'];
    async function openWishMessage() {
      load(group({ baseMessage: 'Old wish' }));
      mockParams = { ids: 'a' };
      await render(<ManageMoment />);
      await fireEvent.press(screen.getByTestId('festival-tab-Message'));
      await fireEvent.press(screen.getByTestId('festival-ai'));
    }
    const regenerate = () => screen.getByTestId('festival-regenerate');
    // Three taps before the reply; each waits only for its own render, never for the request.
    const burst = async () => {
      for (let tap = 0; tap < 3; tap += 1) await fireEvent.press(regenerate());
    };

    it('holds the controls on Android, sends one request, and releases them with the new draft', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      await openWishMessage();
      const reply = pendingGenerate();

      await burst();
      expect(generateCalls()).toHaveLength(1);
      expect(within(regenerate()).getByText('Writing your wish…')).toBeTruthy();
      expect(screen.getByTestId('festival-regenerate-spinner')).toBeTruthy();
      expect(isDisabled('festival-regenerate')).toBe(true);
      for (const tone of tones) expect(isDisabled(`festival-tone-${tone}`)).toBe(true);
      expect(isDisabled('festival-ai')).toBe(true);
      // The current draft stays on screen, dimmed and read-only, until the new one arrives.
      expect(screen.getByTestId('festival-message').props.value).toBe('Old wish');
      expect(screen.getByTestId('festival-message').props.editable).toBe(false);
      expect(opacity('festival-message')).toBe(0.5);
      expect(isDisabled('festival-edit-message')).toBe(true);
      expect(isDisabled('festival-save-message')).toBe(true);
      // Only the wish controls are held: no "Saving…", and the rest of the screen still takes touches.
      expect(screen.queryByText('Saving…')).toBeNull();
      expect(screen.getByTestId('festival-screen').props.pointerEvents).toBe('auto');

      // A tap on the held button still sends nothing.
      await fireEvent.press(regenerate());
      expect(generateCalls()).toHaveLength(1);

      await reply.resolve({ draft: draft({ body: 'A brand new wish' }), usedAI: true });
      await waitFor(() => expect(within(regenerate()).getByText('Regenerate')).toBeTruthy());
      expect(screen.queryByTestId('festival-regenerate-spinner')).toBeNull();
      expect(isDisabled('festival-regenerate')).toBe(false);
      for (const tone of tones) expect(isDisabled(`festival-tone-${tone}`)).toBe(false);
      expect(isDisabled('festival-ai')).toBe(false);
      expect(screen.getByTestId('festival-message').props.value).toBe('A brand new wish');
      expect(screen.getByTestId('festival-message').props.editable).toBe(true);
      expect(opacity('festival-message')).toBeUndefined();
      expect(isDisabled('festival-edit-message')).toBe(false);
      expect(isDisabled('festival-save-message')).toBe(false);
      expect(screen.getByTestId('festival-notice').props.children).toBe('AI draft ready for review.');
    });

    it('does not save on Android while the draft is being written', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      await openWishMessage();
      const reply = pendingGenerate();
      const saves = () => mockPost.mock.calls.filter(([operation]) => operation !== 'generate');

      await fireEvent.press(regenerate());
      await fireEvent.press(screen.getByTestId('festival-save-message'));
      await fireEvent.press(screen.getByTestId('festival-tab-Schedule'));
      expect(saves()).toHaveLength(0);
      expect(screen.getByTestId('festival-message')).toBeTruthy();

      await reply.resolve({ draft: draft({ body: 'A brand new wish' }), usedAI: true });
      await waitFor(() => expect(isDisabled('festival-save-message')).toBe(false));
      await fireEvent.press(screen.getByTestId('festival-save-message'));
      await waitFor(() => expect(saves().length).toBeGreaterThan(0));
    });

    it('releases the controls on Android when the request fails, with the fallback notice', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      await openWishMessage();
      const reply = pendingGenerate();

      await burst();
      expect(isDisabled('festival-regenerate')).toBe(true);
      await reply.reject(new Error('The request timed out.'));

      await waitFor(() => expect(within(regenerate()).getByText('Regenerate')).toBeTruthy());
      expect(isDisabled('festival-regenerate')).toBe(false);
      for (const tone of tones) expect(isDisabled(`festival-tone-${tone}`)).toBe(false);
      expect(isDisabled('festival-ai')).toBe(false);
      expect(isDisabled('festival-edit-message')).toBe(false);
      expect(isDisabled('festival-save-message')).toBe(false);
      expect(screen.getByTestId('festival-message').props.editable).toBe(true);
      expect(screen.getByTestId('festival-notice').props.children).toBe('Offline fallback — review before saving.');

      // Released for real: the next tap writes again.
      await fireEvent.press(regenerate());
      expect(generateCalls()).toHaveLength(2);
    });

    it('keeps the iOS screen unchanged, still with one request per burst', async () => {
      await openWishMessage();
      const reply = pendingGenerate();

      await burst();
      expect(generateCalls()).toHaveLength(1);
      expect(within(regenerate()).getByText('Regenerate')).toBeTruthy();
      expect(screen.queryByTestId('festival-regenerate-spinner')).toBeNull();
      expect(isDisabled('festival-regenerate')).toBe(false);
      for (const tone of tones) expect(isDisabled(`festival-tone-${tone}`)).toBe(false);
      expect(isDisabled('festival-ai')).toBe(false);
      expect(screen.getByTestId('festival-message').props.editable).not.toBe(false);
      expect(opacity('festival-message')).toBeUndefined();
      // As before on iOS: the draft holds the whole screen behind "Saving…".
      expect(screen.getByText('Saving…')).toBeTruthy();
      expect(screen.getByTestId('festival-screen').props.pointerEvents).toBe('none');

      await reply.resolve({ draft: draft({ body: 'A brand new wish' }), usedAI: true });
      await waitFor(() => expect(screen.getByTestId('festival-message').props.value).toBe('A brand new wish'));
      expect(screen.queryByText('Saving…')).toBeNull();
      expect(screen.getByTestId('festival-screen').props.pointerEvents).toBe('auto');
    });
  });

  // A contact with one number and one address each saved twice used to crash the address menus
  // ("Encountered two children with the same key").
  describe('a contact with a repeated number and email', () => {
    afterEach(() => jest.restoreAllMocks());

    // Android shows the addresses as quick choices in the recipient sheet (tested below); iOS keeps the menus.
    it.each(['ios'] as const)('offers each address once on %s, with no key warning', async (os) => {
      jest.replaceProperty(Platform, 'OS', os);
      const errors = jest.spyOn(console, 'error');
      (Contacts.presentContactPickerAsync as jest.Mock).mockResolvedValueOnce({
        id: 'dup',
        contactType: 'person',
        name: 'Priya Raman',
        firstName: 'Priya',
        lastName: 'Raman',
        phoneNumbers: [{ number: '+1 (555) 010-0200' }, { number: '+1 555-010-0200' }, { number: '+15550100300' }],
        emails: [{ email: 'Priya@example.com' }, { email: 'priya@EXAMPLE.com' }, { email: 'priya@work.com' }],
      });
      load(group());
      mockParams = { ids: 'a' };
      await render(<ManageMoment />);
      await fireEvent.press(screen.getByTestId('festival-tab-Contacts'));
      await fireEvent.press(screen.getByTestId('festival-add-contact'));
      // The menu's rows, not the picker's own pill or dismiss layer.
      const rows = (picker: string) =>
        screen
          .getAllByTestId(new RegExp(`^${picker}-`))
          .map((row) => row.props.testID as string)
          .filter((id) => id !== `${picker}-pill` && id !== `${picker}-dismiss`);

      // The first of each repeat is shown, as written, and chosen.
      expect(screen.getByLabelText('Phone, +1 (555) 010-0200')).toBeTruthy();
      expect(screen.getByLabelText('Email, Priya@example.com')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('address-phone'));
      expect(rows('address-phone')).toEqual(['address-phone-', 'address-phone-+1 (555) 010-0200', 'address-phone-+15550100300']);
      await fireEvent.press(screen.getByTestId('address-phone-+15550100300'));

      await fireEvent.press(screen.getByTestId('address-email'));
      expect(rows('address-email')).toEqual(['address-email-', 'address-email-Priya@example.com', 'address-email-priya@work.com']);
      await fireEvent.press(screen.getByTestId('address-email-priya@work.com'));

      expect(screen.getByLabelText('Phone, +15550100300')).toBeTruthy();
      expect(screen.getByLabelText('Email, priya@work.com')).toBeTruthy();
      expect(errors.mock.calls.filter(([message]) => String(message).includes('same key'))).toEqual([]);
    });

    it('offers each address once as a quick choice on android, with no key warning', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const errors = jest.spyOn(console, 'error');
      (Contacts.presentContactPickerAsync as jest.Mock).mockResolvedValueOnce({
        id: 'dup',
        contactType: 'person',
        name: 'Priya Raman',
        firstName: 'Priya',
        lastName: 'Raman',
        phoneNumbers: [{ number: '+1 (555) 010-0200' }, { number: '+1 555-010-0200' }, { number: '+15550100300' }],
        emails: [{ email: 'Priya@example.com' }, { email: 'priya@EXAMPLE.com' }, { email: 'priya@work.com' }],
      });
      load(group());
      mockParams = { ids: 'a' };
      await render(<ManageMoment />);
      await fireEvent.press(screen.getByTestId('festival-tab-Contacts'));
      await fireEvent.press(screen.getByTestId('festival-add-contact'));
      const labels = (field: string) => screen.getAllByTestId(new RegExp(`^recipient-sheet-${field}-choice-\\d+$`)).map((chip) => chip.props.accessibilityLabel);
      expect(labels('phone')).toEqual(['Use phone +1 (555) 010-0200', 'Use phone +15550100300']);
      expect(labels('email')).toEqual(['Use email Priya@example.com', 'Use email priya@work.com']);
      expect(screen.getByTestId('recipient-sheet-phone').props.value).toBe('+1 (555) 010-0200');
      await fireEvent.press(screen.getByTestId('recipient-sheet-email-choice-1'));
      expect(screen.getByTestId('recipient-sheet-email').props.value).toBe('priya@work.com');
      expect(errors.mock.calls.filter(([message]) => String(message).includes('same key'))).toEqual([]);
    });
  });

  // ManageFestivalView.swift:168
  it('disables Save Message when the message is blank or over 500 characters', async () => {
    load(group());
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Message'));
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

    // `setMessage` takes the first 500 characters, as Swift's `String(text.prefix(500))` does, so a
    // longer paste is trimmed rather than left over the limit for the server to reject.
    await fireEvent.changeText(screen.getByTestId('festival-message'), 'x'.repeat(501));
    expect(save()).toBe(false);
    expect(screen.getByText('500/500')).toBeTruthy();
  });

  // ITEM 1. The suggestion is placeholder text; only "Use suggestion" saves it.
  it('shows the suggestion as a placeholder and saves it only when asked', async () => {
    load(group({ baseMessage: '' }));
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Message'));
    const editor = screen.getByTestId('festival-message');
    expect(editor.props.value).toBe('');
    expect(editor.props.placeholder).toBe('Sam’s Birthday! Sending you warm wishes on your special day.');

    await fireEvent.press(screen.getByTestId('wish-use-suggestion'));
    expect(screen.getByTestId('festival-message').props.value).toBe('Sam’s Birthday! Sending you warm wishes on your special day.');
    // Once there is text, there is nothing to suggest.
    expect(screen.queryByTestId('wish-use-suggestion')).toBeNull();
  });

  /**
   * ITEM 5. Save Message on an unchanged-delivery edit used to raise "Save changes to scheduled
   * wishes?" and then save with `cancelSchedules:true`.
   */
  it('saves an approved message-only edit without the cancel prompt', async () => {
    const scheduled = group({ baseMessage: 'Happy birthday, Sam!', approvedAt: '2030-08-30T00:00:00Z' }).map((item) => ({
      ...item,
      drafts: [draft({ momentID: item.id, plans: [plan({ status: 'SCHEDULED' })] })],
    }));
    load(scheduled);
    mockParams = { ids: 'a' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Message'));
    await fireEvent.changeText(screen.getByTestId('festival-message'), 'Sam, many happy returns!');
    await fireEvent.press(screen.getByTestId('festival-save-message'));

    expect(alert).not.toHaveBeenCalledWith('Save changes to scheduled wishes?', expect.anything(), expect.anything());
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('festivalSave', expect.objectContaining({ cancelSchedules: false }), undefined));
  });

  it('still asks before a delivery change cancels the schedules', async () => {
    const scheduled = group({ baseMessage: 'Happy birthday, Sam!', approvedAt: '2030-08-30T00:00:00Z' }).map((item) => ({
      ...item,
      drafts: [draft({ momentID: item.id, plans: [plan({ status: 'SCHEDULED' })] })],
    }));
    load(scheduled);
    mockParams = { ids: 'a' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Schedule'));
    await fireEvent.press(screen.getByTestId('moment-repeat-yearly'));
    await fireEvent.press(screen.getByTestId('festival-schedule-save'));

    expect(alert).toHaveBeenCalledWith('Save changes to scheduled wishes?', expect.any(String), expect.any(Array), expect.anything());
  });

  it('asks before discarding unsaved changes', async () => {
    load(group());
    mockParams = { ids: 'a' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('recipient-select-k1'));
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
    await waitFor(() => expect(screen.getByText('Recipients')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith('save', expect.objectContaining({ type: 'birthday', title: 'Kate’s Birthday', firstName: 'Kate', source: 'manual' }), undefined);
  });

  /**
   * The occasion chosen here decides the greeting every scheduled wish carries
   * (`greetingMessage`), so a type that reaches the payload as the `newMomentInput` default would
   * send "Happy Birthday, …" on an anniversary. Nothing covered this picker before.
   *
   * Both buttons are exercised: the one in the form and the one in the header, which lives inside
   * `Stack.Screen` options (MomentEditorView.tsx:178-180) and so captures `save` separately.
   */
  describe('sends the chosen type in the payload', () => {
    const types = [
      ['birthday', 'Birthday'],
      ['anniversary', 'Anniversary'],
      ['festival', 'Festival'],
      ['getWellSoon', 'Get Well Soon'],
      ['custom', 'Custom'],
    ] as const;

    const saveWith = async (type: string, button: string, label?: string) => {
      load([]);
      const saved = moment({ id: 'new', type, title: 'Chosen', firstName: 'Kate', occurrenceDate: future(30), nextOccurrence: future(30) });
      mockPost.mockResolvedValueOnce({ moment: saved });
      mockSnapshot.mockResolvedValue({ moments: [saved], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false });
      await render(<MomentEditor />);
      await fireEvent.press(screen.getByTestId('moment-type'));
      await fireEvent.press(screen.getByTestId(`moment-type-${type}`));
      await fireEvent.changeText(screen.getByTestId('moment-title'), 'Chosen');
      // Read the picker before saving: every type but custom replaces this screen with Manage Moment.
      if (label !== undefined) expect(within(screen.getByTestId('moment-type')).queryByText(label)).toBeTruthy();
      await fireEvent.press(screen.getByTestId(button));
      await waitFor(() => expect(mockPost).toHaveBeenCalled());
    };

    it.each(types)('%s, saved from the form', async (type, label) => {
      // The picker shows the choice, and the payload carries the same value.
      await saveWith(type, 'moment-save', label);
      expect(mockPost).toHaveBeenCalledWith('save', expect.objectContaining({ type, title: 'Chosen' }), undefined);
    });

    it.each(types)('%s, saved from the header button', async (type) => {
      await saveWith(type, 'moment-save-top');
      expect(mockPost).toHaveBeenCalledWith('save', expect.objectContaining({ type, title: 'Chosen' }), undefined);
    });

    it('keeps the chosen type when a contact is picked afterwards', async () => {
      load([]);
      const saved = moment({ id: 'new', type: 'anniversary', title: 'Chosen', occurrenceDate: future(30), nextOccurrence: future(30) });
      mockPost.mockResolvedValueOnce({ moment: saved });
      mockSnapshot.mockResolvedValue({ moments: [saved], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false });
      await render(<MomentEditor />);
      await fireEvent.press(screen.getByTestId('moment-type'));
      await fireEvent.press(screen.getByTestId('moment-type-anniversary'));
      await fireEvent.changeText(screen.getByTestId('moment-first-name'), 'Visakan');
      await fireEvent.press(screen.getByTestId('moment-save'));
      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith('save', expect.objectContaining({ type: 'anniversary', firstName: 'Visakan', title: 'Visakan’s Anniversary' }), undefined);
    });
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

  // A `nexdo://moments-email` callback that arrived as a deep link with no session open (Android
  // restarted the app while the browser was up): ImportantMomentsStore.swift:185-189.
  it('confirms the ticket and refreshes for a Gmail callback link that arrives with no session open', async () => {
    resetOAuthCallbacks();
    load([], { emailConfigured: true });
    mockSnapshot.mockResolvedValue({ moments: [], emailAccount: { email: 'me@gmail.com', status: 'connected' }, emailConfigured: true, automaticEmailEnabled: false });
    deliverOAuthCallback('moments-email', 'nexdo://moments-email?status=confirm&ticket=v1.ticket');
    await render(<MomentSettings />);
    await waitFor(() => expect(screen.getByText('me@gmail.com')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith('connectEmailConfirm', { ticket: 'v1.ticket' }, undefined);
    expect(screen.queryByTestId('settings-error')).toBeNull();
  });

  it('shows Swift’s message for an error Gmail callback link', async () => {
    resetOAuthCallbacks();
    load([], { emailConfigured: true });
    deliverOAuthCallback('moments-email', 'nexdo://moments-email?status=error');
    await render(<MomentSettings />);
    await waitFor(() =>
      expect(screen.getByTestId('settings-error')).toHaveTextContent('Email connection cancelled or failed. Try connecting again.'),
    );
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it('still connects Gmail when the session comes back dismissed and the callback link lands after it', async () => {
    resetOAuthCallbacks();
    load([], { emailConfigured: true });
    mockPost.mockResolvedValueOnce({ url: 'https://accounts.example.com/consent' });
    let redirected: string | null = 'unset';
    mockOpenAuthSession.mockImplementation(async () => {
      setTimeout(() => {
        redirected = redirectOAuthCallback('nexdo://moments-email?status=confirm&ticket=v1.late');
      }, 50);
      return { type: 'dismiss' };
    });
    await render(<MomentSettings />);
    await fireEvent.press(screen.getByTestId('settings-connect'));

    await waitFor(() => expect(mockSnapshot).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('connectEmailConfirm', { ticket: 'v1.late' }, undefined);
    expect(mockOpenAuthSession).toHaveBeenCalledWith('https://accounts.example.com/consent', 'nexdo://moments-email', { preferEphemeralSession: true });
    expect(screen.queryByTestId('settings-error')).toBeNull();
    expect(redirected).toBeNull();
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

describe('Review wish while a wish is being written (android-polish.md §14)', () => {
  afterEach(() => jest.restoreAllMocks());
  const tones = ['Warm', 'Personal', 'Short', 'Fun'];
  const tryAnother = () => screen.getByTestId('review-try-another');
  const burst = async () => {
    for (let tap = 0; tap < 3; tap += 1) await fireEvent.press(tryAnother());
  };
  async function openReview() {
    const day = future(10);
    load([moment({ id: 'r', type: 'birthday', title: 'Sam’s Birthday', firstName: 'Sam', occurrenceDate: day, nextOccurrence: day, drafts: [draft({ id: 'old', momentID: 'r', body: 'Old wish' })] })]);
    mockParams = { id: 'r' };
    await render(<ReviewWish />);
    // An existing draft is reused on open, so nothing is being written yet.
    expect(generateCalls()).toHaveLength(0);
    // The AI toggle lives in the "Personalize with AI" disclosure.
    await fireEvent.press(screen.getByTestId('review-personalize'));
  }

  it('holds Try another, the tones and the AI toggle on Android, and releases them after the reply', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await openReview();
    const reply = pendingGenerate();

    await burst();
    expect(generateCalls()).toHaveLength(1);
    expect(within(tryAnother()).getByText('Writing your wish…')).toBeTruthy();
    expect(screen.getByTestId('review-try-another-spinner')).toBeTruthy();
    expect(isDisabled('review-try-another')).toBe(true);
    for (const tone of tones) expect(isDisabled(`review-tone-${tone}`)).toBe(true);
    expect(isDisabled('review-ai')).toBe(true);
    expect(screen.getByTestId('review-body').props.value).toBe('Old wish');
    expect(screen.getByTestId('review-body').props.editable).toBe(false);
    expect(opacity('review-body')).toBe(0.5);
    expect(isDisabled('review-edit')).toBe(true);

    await reply.resolve({ draft: draft({ id: 'new', momentID: 'r', body: 'A brand new wish' }), usedAI: true });
    await waitFor(() => expect(within(tryAnother()).getByText('Try another')).toBeTruthy());
    expect(isDisabled('review-try-another')).toBe(false);
    for (const tone of tones) expect(isDisabled(`review-tone-${tone}`)).toBe(false);
    expect(isDisabled('review-ai')).toBe(false);
    expect(isDisabled('review-edit')).toBe(false);
    expect(screen.getByTestId('review-body').props.value).toBe('A brand new wish');
    expect(screen.getByTestId('review-body').props.editable).toBe(true);
  });

  it('releases them on Android when the request fails, showing the error', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await openReview();
    const reply = pendingGenerate();

    await burst();
    expect(isDisabled('review-try-another')).toBe(true);
    await reply.reject(new Error('The request timed out.'));

    await waitFor(() => expect(within(tryAnother()).getByText('Try another')).toBeTruthy());
    expect(isDisabled('review-try-another')).toBe(false);
    for (const tone of tones) expect(isDisabled(`review-tone-${tone}`)).toBe(false);
    expect(isDisabled('review-ai')).toBe(false);
    expect(screen.getByTestId('review-body').props.value).toBe('Old wish');
    expect(screen.getByTestId('review-error')).toBeTruthy();

    await fireEvent.press(tryAnother());
    expect(generateCalls()).toHaveLength(2);
  });

  describe('the first draft, written when the screen opens', () => {
    async function openWithoutDraft() {
      const reply = pendingGenerate();
      const day = future(10);
      load([moment({ id: 'n', type: 'birthday', title: 'Sam’s Birthday', firstName: 'Sam', occurrenceDate: day, nextOccurrence: day })]);
      mockParams = { id: 'n' };
      await render(<ReviewWish />);
      return reply;
    }

    it('shows the same loading state on Android until it arrives', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const reply = await openWithoutDraft();

      expect(generateCalls()).toHaveLength(1);
      expect(within(tryAnother()).getByText('Writing your wish…')).toBeTruthy();
      expect(screen.getByTestId('review-try-another-spinner')).toBeTruthy();
      expect(isDisabled('review-try-another')).toBe(true);
      expect(isDisabled('review-edit')).toBe(true);
      for (const tone of tones) expect(isDisabled(`review-tone-${tone}`)).toBe(true);
      expect(isDisabled('review-approve')).toBe(true);
      expect(screen.getByTestId('review-body').props.editable).toBe(false);
      await fireEvent.press(tryAnother());
      expect(generateCalls()).toHaveLength(1);

      await reply.resolve({ draft: draft({ id: 'first', momentID: 'n', body: 'A first wish' }), usedAI: false });
      await waitFor(() => expect(within(tryAnother()).getByText('Try another')).toBeTruthy());
      expect(screen.getByTestId('review-body').props.value).toBe('A first wish');
      expect(isDisabled('review-try-another')).toBe(false);
      expect(isDisabled('review-edit')).toBe(false);
      for (const tone of tones) expect(isDisabled(`review-tone-${tone}`)).toBe(false);
      expect(isDisabled('review-approve')).toBe(false);
    });

    it('releases the controls on Android when the first draft fails', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const reply = await openWithoutDraft();
      expect(isDisabled('review-try-another')).toBe(true);

      await reply.reject(new Error('The request timed out.'));
      await waitFor(() => expect(within(tryAnother()).getByText('Try another')).toBeTruthy());
      expect(isDisabled('review-try-another')).toBe(false);
      expect(isDisabled('review-edit')).toBe(false);
      expect(screen.getByTestId('review-error')).toBeTruthy();
    });

    it('keeps the iOS screen unchanged', async () => {
      const reply = await openWithoutDraft();

      expect(generateCalls()).toHaveLength(1);
      expect(within(tryAnother()).getByText('Try another')).toBeTruthy();
      expect(screen.queryByTestId('review-try-another-spinner')).toBeNull();
      expect(isDisabled('review-edit')).toBe(false);
      for (const tone of tones) expect(isDisabled(`review-tone-${tone}`)).toBe(false);

      await reply.resolve({ draft: draft({ id: 'first', momentID: 'n', body: 'A first wish' }), usedAI: false });
      await waitFor(() => expect(screen.getByTestId('review-body').props.value).toBe('A first wish'));
    });
  });

  it('keeps the iOS screen unchanged, still with one request per burst', async () => {
    await openReview();
    const reply = pendingGenerate();

    await burst();
    expect(generateCalls()).toHaveLength(1);
    expect(within(tryAnother()).getByText('Try another')).toBeTruthy();
    expect(screen.queryByTestId('review-try-another-spinner')).toBeNull();
    for (const tone of tones) expect(isDisabled(`review-tone-${tone}`)).toBe(false);
    expect(isDisabled('review-ai')).toBe(false);
    expect(screen.getByTestId('review-body').props.editable).not.toBe(false);

    await reply.resolve({ draft: draft({ id: 'new', momentID: 'r', body: 'A brand new wish' }), usedAI: true });
    await waitFor(() => expect(screen.getByTestId('review-body').props.value).toBe('A brand new wish'));
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
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/moments/schedule-wish', params: { momentId: 'm', draftId: 'd', channel: 'messages', recipient: '+15555550100' } });
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

  it('shows the occasion subject, never the moment title, before sending an email', async () => {
    const item = moment({ id: 'm', type: 'birthday', title: 'Ask about her surgery', firstName: 'Sam', email: 'a@b.co', emailSubject: 'Happy Birthday, Sam!', drafts: [draft({ id: 'd', body: 'Hi Sam' })] });
    load([item], { emailAccount: { email: 'me@gmail.com', status: 'connected' }, emailConfigured: true });
    mockParams = { momentId: 'm', draftId: 'd' };
    await render(<ChooseDelivery />);
    await fireEvent.press(screen.getByTestId('delivery-email'));
    await fireEvent.press(screen.getByTestId('delivery-send'));
    expect(screen.getByText('Happy Birthday, Sam!')).toBeTruthy();
    // The title stays only in the screen header the user sees.
    expect(screen.getAllByText('Ask about her surgery')).toHaveLength(1);
  });
});

describe('Wish details', () => {
  // ImportantMomentsView.swift:534: a Messages wish never sends itself, and the subtitle says so.
  it('tells you a Messages wish waits for you to tap Send', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', channel: 'messages' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    expect(
      screen.getByText('Your wish and schedule are saved. Open Messages and tap Send when you are ready; Messages wishes are not sent automatically.'),
    ).toBeTruthy();
  });

  // ImportantMomentsView.swift:544-546: an expired wish always explains itself the same way; any other
  // status shows the plan's own last error.
  it('explains an expired wish with Swift\'s fixed text rather than its last error', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', status: 'EXPIRED', lastError: 'Messages opened; delivery not confirmed.' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    expect(
      screen.getByText('This wish expired 24 hours after its scheduled send time because delivery was not confirmed. Create a new wish to send it.'),
    ).toBeTruthy();
    expect(screen.queryByText('Messages opened; delivery not confirmed.')).toBeNull();
  });

  // ImportantMomentsView.swift:537: `Label(recipient, systemImage:)` — phone for Messages, envelope for
  // email, a person otherwise.
  it.each([
    ['messages', 'call'],
    ['email', 'mail'],
    ['copy', 'person'],
  ])('marks a %s recipient with the %s icon', async (channel, icon) => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', channel, recipient: 'sam@example.com' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    // The icon is decorative (hidden from screen readers); the recipient text is what is read.
    expect(screen.getByTestId('wish-recipient-icon', { includeHiddenElements: true }).props.name).toBe(icon);
    expect(screen.getByText('sam@example.com')).toBeTruthy();
  });

  it('keeps "Review the delivery status below." for a copy wish awaiting you', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', channel: 'copy' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    expect(screen.getByText('Review the delivery status below.')).toBeTruthy();
  });

  it('offers edit, open Messages and cancel for a Messages wish awaiting you', async () => {
    const item = moment({ drafts: [draft({ plans: [plan({ id: 'p1' })] })] });
    load([item]);
    mockParams = { planId: 'p1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<WishDetails />);
    expect(screen.getByTestId('wish-title').props.children).toBe('Scheduled — manual send');
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

  it('lets the person settle a "Check Sent mail" email', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', channel: 'email', automaticDelivery: true, status: 'UNCERTAIN' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    expect(screen.queryByTestId('wish-retry')).toBeNull();
    expect(screen.getByTestId('wish-uncertain-sent')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('wish-uncertain-failed'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('plan', { id: 'p1', action: 'failed' }, undefined));
  });

  it('records "I found it in Sent mail" as sent', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', channel: 'email', automaticDelivery: true, status: 'UNCERTAIN' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    await fireEvent.press(screen.getByTestId('wish-uncertain-sent'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('plan', { id: 'p1', action: 'sent' }, undefined));
  });

  // ImportantMomentsView.swift:554: "Retry after reconnecting" only for a failed automatic email.
  it('retries a failed automatic email, and offers no retry for a manual one', async () => {
    load([
      moment({
        drafts: [
          draft({
            plans: [
              plan({ id: 'p1', channel: 'email', automaticDelivery: true, status: 'FAILED' }),
              plan({ id: 'p2', channel: 'messages', automaticDelivery: false, status: 'FAILED' }),
            ],
          }),
        ],
      }),
    ]);
    mockParams = { planId: 'p1' };
    const view = await render(<WishDetails />);
    await fireEvent.press(screen.getByTestId('wish-retry'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('plan', { id: 'p1', action: 'retry' }, undefined));
    await view.unmount();
    mockParams = { planId: 'p2' };
    await render(<WishDetails />);
    expect(screen.queryByTestId('wish-retry')).toBeNull();
  });

  // ImportantMomentsView.swift:557-561: the prompt is a secondary footnote, "I found it in Sent mail" is
  // `.bordered`, and "It wasn't sent" is a plain button — the safer answer is the one that stands out.
  it('styles the "Check Sent mail" choices as Swift does', async () => {
    load([moment({ drafts: [draft({ plans: [plan({ id: 'p1', channel: 'email', automaticDelivery: true, status: 'UNCERTAIN' })] })] })]);
    mockParams = { planId: 'p1' };
    await render(<WishDetails />);
    const prompt = StyleSheet.flatten(screen.getByText('Check the Sent folder in Gmail, then tell Nexdo what happened.').props.style);
    expect(prompt.fontSize).toBe(13);
    expect(StyleSheet.flatten(screen.getByTestId('wish-uncertain-sent').props.style).backgroundColor).toBeDefined();
    expect(StyleSheet.flatten(screen.getByTestId('wish-uncertain-failed').props.style ?? {}).backgroundColor).toBeUndefined();
    expect(screen.getByLabelText("It wasn't sent")).toBeTruthy();
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
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/moments/editor', params: { imported: expect.stringContaining('"title":"Diwali Wishes"'), done: 'back' } });
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

/**
 * Android: Create Moment's Recipients list, the shared recipient sheet, the one-go save through
 * `festivalSave`, and Manage Moment's Add Contact / Edit recipient — aligned with iOS
 * swift-multi-recipient-create (94a2ecd). iOS in this app keeps the single recipient.
 */
describe('Recipients on Android', () => {
  // Every new person gets its own key, as a real UUID would give it; and every hashed contact address its
  // own digest, so the device's record of card-sourced addresses (contactLinks.ts) tells them apart.
  let uuid = 0;
  beforeEach(async () => {
    (Crypto.randomUUID as jest.Mock).mockImplementation(() => `uuid-${++uuid}`);
    (Crypto.digestStringAsync as jest.Mock).mockImplementation(async (_algorithm: string, value: string) => `sha(${value})`.padEnd(40, '.'));
    await AsyncStorage.clear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    (Crypto.randomUUID as jest.Mock).mockImplementation(() => 'test-nonce');
    (Crypto.digestStringAsync as jest.Mock).mockImplementation(async () => 'digest');
    (Contacts.getContactByIdAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  const KATE = {
    id: 'C1',
    contactType: 'person',
    name: 'Kate Bell',
    firstName: 'Kate',
    lastName: 'Bell',
    phoneNumbers: [{ number: '+1 (555) 010-0200' }, { number: '+1 555 010 0300' }],
    emails: [{ email: 'kate@example.com' }],
  };

  /** The snapshot the server would return after `festivalSave`: one moment per saved recipient. */
  function serveSaves(anchor: ImportantMoment) {
    // The first save is the new moment; any later one (a custom moment's other people) is a moment of its own.
    let saves = 0;
    mockPost.mockImplementation(async (operation: string, input: { sourceKey?: string }) =>
      operation === 'save' ? { moment: saves++ === 0 ? anchor : { ...anchor, id: `other-${input.sourceKey}` } } : { ok: true },
    );
    mockSnapshot.mockImplementation(async () => {
      const call = [...mockPost.mock.calls].reverse().find(([operation]) => operation === 'festivalSave');
      if (!call) return { moments: [anchor], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false };
      const input = call[1] as { title: string; recipients: { id?: string; key: string; name: string; phone: string; email: string; selected: boolean }[]; settings: { groupID: string } };
      const moments = input.recipients.map((recipient) =>
        moment({
          ...anchor,
          id: recipient.id ?? `m-${recipient.key}`,
          title: input.title,
          firstName: recipient.name,
          phone: recipient.phone,
          email: recipient.email,
          enabled: recipient.selected,
          sourceKey: recipient.id ? anchor.sourceKey : `${anchor.type}:${input.settings.groupID}:${recipient.key}`,
          festivalSettings: JSON.stringify(input.settings),
        }),
      );
      return { moments, emailAccount: null, emailConfigured: false, automaticEmailEnabled: false };
    });
  }

  const fill = async (fields: { name?: string; phone?: string; email?: string }) => {
    if (fields.name !== undefined) await fireEvent.changeText(screen.getByTestId('recipient-sheet-name'), fields.name);
    if (fields.phone !== undefined) await fireEvent.changeText(screen.getByTestId('recipient-sheet-phone'), fields.phone);
    if (fields.email !== undefined) await fireEvent.changeText(screen.getByTestId('recipient-sheet-email'), fields.email);
  };
  const addManually = async (fields: { name?: string; phone?: string; email?: string }) => {
    await fireEvent.press(screen.getByTestId('moment-enter-recipient'));
    await fill(fields);
    await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
  };
  const rowText = (index: number) => within(screen.getByTestId(`moment-recipient-${index}`)).getAllByText(/./).map((node) => node.props.children);
  const problem = () => screen.getByTestId('recipient-sheet-error').props.children;

  it('adds two people on create, one from Contacts and one by hand, and saves them all in one go', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load([]);
    const day = future(30);
    const anchor = moment({ id: 'new', type: 'birthday', title: 'Kate’s Birthday', firstName: 'Kate', occurrenceDate: day, nextOccurrence: day, sourceKey: 'manual-anchor' });
    serveSaves(anchor);
    (Contacts.presentContactPickerAsync as jest.Mock).mockResolvedValueOnce(KATE);
    await render(<MomentEditor />);

    // At least one recipient is required; the privacy note is always there.
    expect(screen.queryByTestId('moment-first-name')).toBeNull();
    expect(isDisabled('moment-save')).toBe(true);
    expect(screen.getByTestId('moment-recipients-required').props.children).toBe('Add at least one recipient.');
    expect(screen.getByTestId('moment-recipients-note').props.children).toBe(
      'Only the recipients and occasion you confirm here are saved to your Nexdo account. Your address book is never uploaded.',
    );
    expect(screen.getByText('Choose from Contacts')).toBeTruthy();
    expect(screen.getByText('Enter recipient manually')).toBeTruthy();

    // Choose from Contacts: the sheet is pre-filled with the contact's first name, and its two numbers are quick choices.
    await fireEvent.press(screen.getByTestId('moment-choose-contact'));
    expect(screen.getByText('Add Recipient')).toBeTruthy();
    expect(screen.getByText('Add a phone number, an email, or both.')).toBeTruthy();
    expect(screen.getByTestId('recipient-sheet-cancel')).toBeTruthy();
    expect(screen.getByTestId('recipient-sheet-name').props.value).toBe('Kate');
    expect(screen.getByTestId('recipient-sheet-phone').props.value).toBe('+1 (555) 010-0200');
    expect(screen.getByTestId('recipient-sheet-email').props.value).toBe('kate@example.com');
    expect(within(screen.getByTestId('recipient-sheet-submit')).getByText('Add')).toBeTruthy();
    expect(screen.getByTestId('recipient-sheet-phone-choice-1').props.accessibilityLabel).toBe('Use phone +1 555 010 0300');
    await fireEvent.press(screen.getByTestId('recipient-sheet-phone-choice-1'));
    expect(screen.getByTestId('recipient-sheet-phone').props.value).toBe('+1 555 010 0300');
    await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
    expect(rowText(0)).toEqual(['Kate', 'Mobile · ••• ••• 0300 · Email · k••••@example.com', 'Edit', 'Remove']);
    expect(screen.getByLabelText('Edit Kate')).toBeTruthy();
    expect(screen.getByLabelText('Remove Kate')).toBeTruthy();
    expect(screen.getByTestId('moment-title').props.value).toBe('Kate’s Birthday');
    expect(screen.queryByTestId('moment-recipients-required')).toBeNull();

    // Enter recipient manually opens the same sheet, empty.
    await fireEvent.press(screen.getByTestId('moment-enter-recipient'));
    expect(screen.getByTestId('recipient-sheet-name').props.value).toBe('');
    await fill({ name: 'Ravi Kumar', email: ' ravi@example.com ' });
    await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
    expect(rowText(1)).toEqual(['Ravi Kumar', 'Email · r••••@example.com', 'Edit', 'Remove']);

    await fireEvent.press(screen.getByTestId('moment-save'));
    await waitFor(() => expect(screen.getByText('Recipients')).toBeTruthy());

    // The moment is created for the first person (phone as digits with its +), then everyone is saved in one festivalSave.
    const operations = mockPost.mock.calls.map(([operation]) => operation);
    expect(operations.filter((operation) => operation === 'save' || operation === 'festivalSave')).toEqual(['save', 'festivalSave']);
    expect(mockPost).toHaveBeenCalledWith('save', expect.objectContaining({ type: 'birthday', title: 'Kate’s Birthday', firstName: 'Kate', phone: '+15550100300', email: 'kate@example.com' }), undefined);
    const input = mockPost.mock.calls.find(([operation]) => operation === 'festivalSave')![1];
    const raviKey = input.recipients[1].key;
    expect(raviKey).toMatch(/^UUID-\d+$/);
    expect(input).toMatchObject({ ids: ['new'], title: 'Kate’s Birthday', active: true, cancelSchedules: false });
    expect(input.recipients).toEqual([
      { id: 'new', key: 'new', name: 'Kate', phone: '+15550100300', email: 'kate@example.com', selected: true },
      { key: raviKey, name: 'Ravi Kumar', phone: '', email: 'ravi@example.com', selected: true },
    ]);
    expect(input.settings.groupID).toMatch(/^UUID-\d+$/);
    expect(input.settings).toMatchObject({ channels: { new: 'messages', [raviKey]: 'email' }, contactIDs: { new: 'C1', [raviKey]: '' }, selected: { new: true, [raviKey]: true } });

    // Manage Moment → Contacts shows both, selected.
    await fireEvent.press(screen.getByTestId('festival-tab-Contacts'));
    expect(screen.getByTestId('recipient-select-new').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId(`recipient-select-${raviKey}`).props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByTestId('festival-error')).toBeNull();
  });

  it('retries only festivalSave, with the same moment and group, after it fails', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load([]);
    const anchor = moment({ id: 'new', type: 'birthday', title: 'Asha’s Birthday', occurrenceDate: future(30), nextOccurrence: future(30), sourceKey: 'manual-anchor' });
    serveSaves(anchor);
    mockPost.mockImplementationOnce(async () => ({ moment: anchor })).mockImplementationOnce(async () => {
      throw new Error('Network down');
    });
    await render(<MomentEditor />);
    await addManually({ name: 'Asha', phone: '5550100200' });
    await addManually({ name: 'Ben', email: 'ben@example.com' });
    await fireEvent.press(screen.getByTestId('moment-save'));
    await waitFor(() => expect(screen.getByTestId('moment-recipients-retry').props.children).toBe('Your moment is saved, but not all of its recipients are. Tap Save again to finish.'));
    // The list is locked once the moment exists.
    await fireEvent.press(screen.getByTestId('moment-enter-recipient'));
    expect(screen.queryByTestId('recipient-sheet-name')).toBeNull();
    const first = mockPost.mock.calls.find(([operation]) => operation === 'festivalSave')![1];

    await fireEvent.press(screen.getByTestId('moment-save'));
    await waitFor(() => expect(screen.getByText('Recipients')).toBeTruthy());
    const operations = mockPost.mock.calls.map(([operation]) => operation).filter((operation) => operation === 'save' || operation === 'festivalSave');
    expect(operations).toEqual(['save', 'festivalSave', 'festivalSave']);
    const retried = mockPost.mock.calls.filter(([operation]) => operation === 'festivalSave')[1][1];
    expect(retried.ids).toEqual(['new']);
    expect(retried.settings.groupID).toBe(first.settings.groupID);
    expect(retried.recipients.map((recipient: { key: string }) => recipient.key)).toEqual(first.recipients.map((recipient: { key: string }) => recipient.key));
  });

  it('saves each recipient of a custom moment as its own custom moment', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load([]);
    const anchor = moment({ id: 'c1', type: 'custom', title: 'Team lunch', occurrenceDate: future(30), nextOccurrence: future(30), sourceKey: 'manual-anchor' });
    serveSaves(anchor);
    await render(<MomentEditor />);
    await fireEvent.press(screen.getByTestId('moment-type'));
    await fireEvent.press(screen.getByTestId('moment-type-custom'));
    await fireEvent.changeText(screen.getByTestId('moment-title'), 'Team lunch');
    await addManually({ name: 'Asha', phone: '+91 98765 43210' });
    await addManually({ name: 'Ben', email: 'ben@example.com' });
    await fireEvent.press(screen.getByTestId('moment-save'));
    await waitFor(() => expect(mockPost.mock.calls.filter(([operation]) => operation === 'save')).toHaveLength(2));
    const saves = mockPost.mock.calls.filter(([operation]) => operation === 'save').map(([, input]) => input);
    expect(saves[0]).toMatchObject({ type: 'custom', title: 'Team lunch', firstName: 'Asha', phone: '+919876543210', email: '' });
    expect(saves[1]).toMatchObject({ type: 'custom', title: 'Team lunch', firstName: 'Ben', phone: '', email: 'ben@example.com' });
    expect(saves[1].sourceKey).toMatch(/^UUID-\d+$/);
    expect(saves[1].sourceKey).not.toBe(saves[0].sourceKey);
    expect(mockPost.mock.calls.some(([operation]) => operation === 'festivalSave')).toBe(false);
  });

  it('starts an imported contact as the first recipient', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load([]);
    const imported = { ...newMomentInput('IMPORT', 'UTC'), firstName: 'Kate', phone: '+1 555 010 0200', email: 'kate@example.com', occurrenceDate: future(40), title: 'Kate’s Birthday', source: 'contacts' };
    await render(<MomentEditorView imported={imported} dismiss={jest.fn()} />);
    expect(rowText(0)).toEqual(['Kate', 'Mobile · ••• ••• 0200 · Email · k••••@example.com', 'Edit', 'Remove']);
    expect(isDisabled('moment-save')).toBe(false);
  });

  /** A saved festival opens its manager, which asks for the catalog. */
  function serveCatalog() {
    const saves = mockPost.getMockImplementation()!;
    mockPost.mockImplementation(async (operation: string, ...rest: unknown[]) => (operation === 'festivalCatalog' ? { entries: [] } : saves(operation, ...rest)));
  }

  // fac34ed (MomentEditor.swift:129-135): re-importing a catalog festival keeps the saved group's id, so
  // its recipients update in place instead of a second group of duplicates.
  it('re-imports a saved catalog festival into its existing group', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const day = future(30);
    const saved = moment({
      id: 'diwali-1',
      type: 'festival',
      title: 'Diwali Wishes',
      firstName: 'Asha',
      occurrenceDate: day,
      nextOccurrence: day,
      source: 'festivalCatalog',
      sourceKey: 'festival:diwali',
      festivalSettings: settings({ groupID: 'SAVED-GROUP' }),
    });
    load([saved]);
    serveSaves({ ...saved, id: 'new' });
    serveCatalog();
    const imported = { ...newMomentInput('festival:diwali', 'UTC'), type: 'festival', title: 'Diwali Wishes', yearly: false, source: 'festivalCatalog', occurrenceDate: day };
    await render(<MomentEditorView imported={imported} dismiss={jest.fn()} />);
    await addManually({ name: 'Ravi Kumar', email: 'ravi@example.com' });
    await fireEvent.press(screen.getByTestId('moment-save'));
    await waitFor(() => expect(mockPost.mock.calls.some(([operation]) => operation === 'festivalSave')).toBe(true));
    const input = mockPost.mock.calls.find(([operation]) => operation === 'festivalSave')![1];
    expect(input.settings.groupID).toBe('SAVED-GROUP');
  });

  it('starts a new group for a festival that was never imported', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const day = future(30);
    load([]);
    serveSaves(moment({ id: 'new', type: 'festival', title: 'Holi Wishes', occurrenceDate: day, nextOccurrence: day, source: 'festivalCatalog', sourceKey: 'festival:holi' }));
    serveCatalog();
    const imported = { ...newMomentInput('festival:holi', 'UTC'), type: 'festival', title: 'Holi Wishes', yearly: false, source: 'festivalCatalog', occurrenceDate: day };
    await render(<MomentEditorView imported={imported} dismiss={jest.fn()} />);
    await addManually({ name: 'Ravi Kumar', email: 'ravi@example.com' });
    await fireEvent.press(screen.getByTestId('moment-save'));
    await waitFor(() => expect(mockPost.mock.calls.some(([operation]) => operation === 'festivalSave')).toBe(true));
    expect(mockPost.mock.calls.find(([operation]) => operation === 'festivalSave')![1].settings.groupID).toMatch(/^UUID-\d+$/);
  });

  it('edits and removes a row, and the first person names the moment', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load([]);
    await render(<MomentEditor />);
    await addManually({ name: 'Asha Rao', phone: '5550100200' });
    await addManually({ name: 'Ben Ito', email: 'ben@example.com' });
    expect(screen.getByTestId('moment-title').props.value).toBe('Asha Rao’s Birthday');

    await fireEvent.press(screen.getByLabelText('Edit Asha Rao'));
    expect(screen.getByText('Edit Recipient')).toBeTruthy();
    expect(within(screen.getByTestId('recipient-sheet-submit')).getByText('Save')).toBeTruthy();
    expect(screen.getByTestId('recipient-sheet-phone').props.value).toBe('5550100200');
    await fill({ phone: '5550109999', email: 'asha@example.com' });
    await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
    expect(rowText(0)).toEqual(['Asha Rao', 'Mobile · ••• ••• 9999 · Email · a••••@example.com', 'Edit', 'Remove']);

    await fireEvent.press(screen.getByLabelText('Remove Asha Rao'));
    expect(screen.queryByTestId('moment-recipient-1')).toBeNull();
    expect(rowText(0)[0]).toBe('Ben Ito');
    expect(screen.getByTestId('moment-title').props.value).toBe('Ben Ito’s Birthday');
    await fireEvent.press(screen.getByLabelText('Remove Ben Ito'));
    expect(isDisabled('moment-save')).toBe(true);
  });

  it('validates every filled field with iOS’s messages, and refuses the same person twice', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load([]);
    await render(<MomentEditor />);
    await fireEvent.press(screen.getByTestId('moment-enter-recipient'));
    const submit = () => fireEvent.press(screen.getByTestId('recipient-sheet-submit'));

    // Add is always enabled; pressing it explains what is missing.
    expect(isDisabled('recipient-sheet-submit')).toBe(false);
    await submit();
    expect(problem()).toBe('Enter a name.');
    // The message clears as soon as a field changes.
    await fill({ name: 'x'.repeat(81) });
    expect(screen.queryByTestId('recipient-sheet-error')).toBeNull();
    await submit();
    expect(problem()).toBe('Use a name of 80 characters or fewer.');
    await fill({ name: 'Cara' });
    await submit();
    expect(problem()).toBe('Enter a phone number or email.');
    // A bad phone is refused even when the email is fine.
    await fill({ phone: '12345', email: 'cara@example.com' });
    await submit();
    expect(problem()).toBe('Enter a valid phone number.');
    await fill({ phone: '', email: 'cara@' });
    await submit();
    expect(problem()).toBe('Enter a valid email address.');
    await fill({ phone: '+1 555 010 0200', email: 'Cara@Example.com' });
    await submit();
    expect(screen.queryByTestId('recipient-sheet')).toBeNull();

    // The same phone formatted differently, or the same email in another case, is the same person.
    await fireEvent.press(screen.getByTestId('moment-enter-recipient'));
    await fill({ name: 'Dup', phone: '+1-555-010-0200' });
    await submit();
    expect(problem()).toBe('This person is already a recipient.');
    await fill({ phone: '', email: ' cara@example.COM ' });
    await submit();
    expect(problem()).toBe('This person is already a recipient.');
    await fireEvent.press(screen.getByTestId('recipient-sheet-cancel'));
    expect(screen.queryByTestId('moment-recipient-1')).toBeNull();

    // Editing a person may keep their own address.
    await fireEvent.press(screen.getByLabelText('Edit Cara'));
    await fill({ name: 'Cara Diaz' });
    await submit();
    expect(rowText(0)[0]).toBe('Cara Diaz');
  });

  describe('Manage Moment', () => {
    const day = future(20);
    const saved = () => [
      moment({ id: 'a', title: 'Sam’s Birthday', firstName: 'Sam', phone: '+15555550100', email: 'sam@example.com', occurrenceDate: day, nextOccurrence: day, sourceKey: 'birthday:g:k1', festivalSettings: settings({ groupID: 'g', contactIDs: { k1: 'C9' }, channels: { k1: 'messages' } }) }),
    ];
    const open = async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      load(saved());
      mockParams = { ids: 'a' };
      await render(<ManageMoment />);
      await fireEvent.press(screen.getByTestId('festival-tab-Contacts'));
    };
    const saveChanges = async () => {
      mockPost.mockClear();
      await fireEvent.press(screen.getByTestId('festival-save'));
    };
    const renameSam = async (name: string) => {
      await fireEvent.press(screen.getByTestId('recipient-edit-k1'));
      await fill({ name });
      await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
    };

    it('edits a recipient in the sheet, and adds from Contacts and by hand with the same sheet', async () => {
      await open();
      await fireEvent.press(screen.getByTestId('recipient-edit-k1'));
      expect(screen.getByText('Edit Recipient')).toBeTruthy();
      expect(screen.getByTestId('recipient-sheet-name').props.value).toBe('Sam');
      await fill({ name: 'Sam Lee', phone: '' });
      await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
      const row = within(screen.getByTestId('recipient-k1'));
      expect(row.getByText('Sam Lee')).toBeTruthy();
      // With the phone gone, the Messages channel falls back to Email.
      expect(row.getByText('Email · s••••@example.com')).toBeTruthy();

      (Contacts.presentContactPickerAsync as jest.Mock).mockResolvedValueOnce(KATE);
      await fireEvent.press(screen.getByTestId('festival-add-contact'));
      expect(screen.getByText('Add Recipient')).toBeTruthy();
      expect(screen.getByTestId('recipient-sheet-name').props.value).toBe('Kate');
      await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
      expect(screen.getByText('Kate')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('festival-manual'));
      await fill({ name: 'Ravi', email: 'SAM@example.com' });
      await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
      expect(problem()).toBe('This person is already a recipient.');
    });

    it('never compares a typed address with the contact card', async () => {
      (Contacts.getContactByIdAsync as jest.Mock).mockResolvedValue({ id: 'C9', phoneNumbers: [{ number: '+15555550100' }], emails: [{ email: 'sam@example.com' }] });
      await open();
      // Sam's email is typed over the card's: the contact link stays, and Save never reports it as changed.
      await fireEvent.press(screen.getByTestId('recipient-edit-k1'));
      await fill({ email: 'sam@personal.com' });
      await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
      await saveChanges();
      await waitFor(() => expect(mockPost).toHaveBeenCalledWith('festivalSave', expect.anything(), undefined));
      expect(mockPost.mock.calls.find(([operation]) => operation === 'festivalSave')![1].settings.contactIDs).toEqual({ k1: 'C9' });
      expect(screen.queryByTestId('festival-error')).toBeNull();
      // The typed address is recorded on the device as not taken from the card.
      const stored = JSON.parse((await AsyncStorage.getItem('nexdo.moments.contactAddressLinks'))!);
      expect(Object.values(stored)).toContain(false);
    });

    it('shows no warning for an address saved before links existed, and records it from the card', async () => {
      // Sam's saved email is not on the card, but nothing records it as taken from the card: no warning.
      (Contacts.getContactByIdAsync as jest.Mock).mockResolvedValue({ id: 'C9', phoneNumbers: [{ number: '+1 (555) 555-0100' }], emails: [{ email: 'other@example.com' }] });
      await open();
      await renameSam('Sam Lee');
      await saveChanges();
      await waitFor(() => expect(mockPost).toHaveBeenCalledWith('festivalSave', expect.anything(), undefined));
      expect(screen.queryByTestId('festival-error')).toBeNull();
    });

    it('warns when an address taken from the contact card is no longer on it', async () => {
      (Contacts.getContactByIdAsync as jest.Mock).mockResolvedValue({ ...KATE });
      await open();
      (Contacts.presentContactPickerAsync as jest.Mock).mockResolvedValueOnce(KATE);
      await fireEvent.press(screen.getByTestId('festival-add-contact'));
      await fireEvent.press(screen.getByTestId('recipient-sheet-submit'));
      await saveChanges();
      await waitFor(() => expect(mockPost).toHaveBeenCalledWith('festivalSave', expect.anything(), undefined));
      expect(screen.queryByTestId('festival-error')).toBeNull();
      // A successful Save Changes goes on to the next step (Phase 12, `prepareNextTabAfterSave`).
      await waitFor(() => expect(screen.getByText('Wish Message')).toBeTruthy());
      await fireEvent.press(screen.getByTestId('festival-tab-Contacts'));

      // Kate's card loses the email the recipient was given from it.
      (Contacts.getContactByIdAsync as jest.Mock).mockResolvedValue({ ...KATE, emails: [{ email: 'kate@new.com' }] });
      await renameSam('Sam Lee');
      await saveChanges();
      await waitFor(() => expect(screen.getByTestId('festival-error').props.children).toBe('A contact’s email changed. Review their delivery address.'));
      expect(mockPost).not.toHaveBeenCalledWith('festivalSave', expect.anything(), undefined);
    });

    it('iOS keeps the inline Edit recipient fields and the delivery-address menus', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      load(saved());
      mockParams = { ids: 'a' };
      await render(<ManageMoment />);
      await fireEvent.press(screen.getByTestId('festival-tab-Contacts'));
      await fireEvent.press(screen.getByTestId('recipient-edit-k1'));
      expect(screen.getByTestId('recipient-name-k1').props.value).toBe('Sam');
      (Contacts.presentContactPickerAsync as jest.Mock).mockResolvedValueOnce(KATE);
      await fireEvent.press(screen.getByTestId('festival-add-contact'));
      expect(screen.getByText('Choose delivery address')).toBeTruthy();
      expect(screen.queryByTestId('recipient-sheet-name')).toBeNull();
    });
  });

  it('iOS Create Moment keeps the single recipient fields', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    load([]);
    await render(<MomentEditor />);
    expect(screen.getByTestId('moment-first-name')).toBeTruthy();
    expect(screen.queryByTestId('moment-enter-recipient')).toBeNull();
    expect(isDisabled('moment-save')).toBe(false);
  });
});

/** Phase 12: Details folded into Schedule, and Edit Moment (ManageFestivalView.swift:162-347). */
describe('Manage Moment, the Schedule step', () => {
  const day = future(20);
  const birthday = (extra: Partial<ImportantMoment> = {}, settingsOverrides: Record<string, unknown> = {}) =>
    moment({
      id: 'a',
      type: 'birthday',
      title: 'Sam’s Birthday',
      firstName: 'Sam',
      phone: '+15555550100',
      email: 'sam@example.com',
      occurrenceDate: day,
      nextOccurrence: day,
      sourceKey: 'birthday:g:k1',
      festivalSettings: settings({ groupID: 'g', channels: { k1: 'messages' }, ...settingsOverrides }),
      ...extra,
    });
  async function openSchedule(moments: ImportantMoment[] = [birthday()]) {
    load(moments);
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('festival-tab-Schedule'));
  }
  afterEach(() => jest.restoreAllMocks());

  it('shows the moment, send time with the prepare reminder, delivery tags and the reminder note', async () => {
    await openSchedule();
    const card = within(screen.getByTestId('festival-moment'));
    expect(card.getByText('Sam’s Birthday')).toBeTruthy();
    expect(card.getByText('Birthday')).toBeTruthy();
    expect(card.getByText(sendDayLabel(momentDate(day, 'UTC'), 'UTC'))).toBeTruthy();
    expect(screen.getByText('Repeats on this date each year.\nReview and schedule each wish separately.')).toBeTruthy();
    expect(screen.getByText('Reminds you to review the wish. Nothing is sent.')).toBeTruthy();
    expect(screen.getByLabelText('Prepare reminder, 1 day before')).toBeTruthy();
    expect(screen.getByLabelText('Messages for Sam').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Email for Sam')).toBeTruthy();
    expect(screen.getByLabelText('Copy / Share for Sam')).toBeTruthy();
    expect(screen.getByText('At the scheduled time, we’ll remind you to send manual wishes. For Messages, open the prepared wish and tap Send. Only email marked automatic sends for you.')).toBeTruthy();
    expect(screen.getByTestId('moment-send-reminder')).toBeTruthy();
    expect(screen.queryByText('Send if app is closed')).toBeNull();
    // Schedule shows no notices; nothing to connect while Messages is chosen.
    expect(screen.queryByTestId('festival-connect-email')).toBeNull();
  });

  it('offers hours or days for the prepare reminder and saves the choice', async () => {
    await openSchedule();
    await fireEvent.press(screen.getByTestId('moment-prepare-reminder'));
    for (const value of [0, 60, 240, 480, 1440, 4320, 10080, 20160]) expect(screen.getByTestId(`moment-prepare-reminder-${value}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('moment-prepare-reminder-240'));
    expect(screen.getByLabelText('Prepare reminder, 4 hours before')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('festival-schedule-save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('festivalSave', expect.objectContaining({ settings: expect.objectContaining({ prepareHours: 4, prepareDays: 0 }) }), undefined));
  });

  it('switches a recipient’s channel with the tags, and offers to connect email for Email', async () => {
    await openSchedule();
    await fireEvent.press(screen.getByLabelText('Email for Sam'));
    expect(screen.getByLabelText('Email for Sam').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Messages for Sam').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByText('You send at the scheduled time')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('festival-connect-email'));
    expect(mockPush).toHaveBeenCalledWith('/wellness/moments/settings');
  });

  it('edits the moment in Edit Moment, saving a new occasion type', async () => {
    await openSchedule();
    await fireEvent.press(screen.getByTestId('moment-edit'));
    expect(screen.getByText('Review and schedule each wish separately. Repeating a moment does not automatically send future wishes.')).toBeTruthy();
    expect(screen.getByTestId('festival-name').props.value).toBe('Sam’s Birthday');
    await fireEvent.changeText(screen.getByTestId('festival-name'), 'Sam & Lee');
    await fireEvent.press(screen.getByTestId('moment-edit-type'));
    // Custom moments are not managed here, so they are not offered.
    expect(screen.queryByTestId('moment-edit-type-custom')).toBeNull();
    await fireEvent.press(screen.getByTestId('moment-edit-type-anniversary'));
    await fireEvent.press(screen.getByTestId('moment-edit-save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('festivalSave', expect.objectContaining({ type: 'anniversary', title: 'Sam & Lee' }), undefined));
  });

  it('asks before Edit Moment cancels scheduled wishes, and Keep schedules sends nothing', async () => {
    const scheduled = birthday({ drafts: [draft({ momentID: 'a', plans: [plan({ status: 'SCHEDULED' })] })] }, { baseMessage: 'Hi', approvedAt: '2030-08-30T00:00:00Z' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await openSchedule([scheduled]);
    await fireEvent.press(screen.getByTestId('moment-edit'));
    await fireEvent.press(screen.getByTestId('moment-edit-repeat'));
    await fireEvent.press(screen.getByTestId('moment-edit-save'));
    expect(alert).toHaveBeenCalledWith('Save changes to scheduled wishes?', 'Saving these changes cancels existing schedules. Review and schedule the updated wishes again.', expect.any(Array));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Keep schedules')?.onPress?.();
    expect(mockPost).not.toHaveBeenCalledWith('festivalSave', expect.anything(), undefined);
    // Cancel schedules and save goes through with cancelSchedules.
    await act(async () => buttons.find((button) => button.text === 'Cancel schedules and save')?.onPress?.());
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('festivalSave', expect.objectContaining({ yearly: true, cancelSchedules: true }), undefined));
  });

  it('goes on from Contacts to Message after Save Changes', async () => {
    load([birthday()]);
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    await fireEvent.press(screen.getByTestId('recipient-edit-k1'));
    await fireEvent.changeText(screen.getByTestId('recipient-name-k1'), 'Sammy');
    await fireEvent.press(screen.getByTestId('festival-save'));
    await waitFor(() => expect(screen.getByText('Wish Message')).toBeTruthy());
    expect(screen.getByTestId('festival-tab-Message').props.accessibilityState).toEqual({ selected: true });
  });
});
