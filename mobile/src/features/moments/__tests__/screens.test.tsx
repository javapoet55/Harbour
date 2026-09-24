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

import type { ImportantMoment, MomentsSnapshot } from '../../../api/moments';
import { momentDate, sendDayLabel } from '../dates';
import { OPENED_UNCONFIRMED } from '../domain';
import { rememberDraft } from '../handoff';
import { momentsStore } from '../store';
import { draft, moment, plan, settings } from '../testFixtures';
import { deliverOAuthCallback, redirectOAuthCallback, resetOAuthCallbacks } from '../../../lib/oauthCallbacks';

import ImportantMoments from '../../../../app/(tabs)/(today)/moments/index';
import ManageMoment from '../../../../app/(tabs)/(today)/moments/manage';
import MomentEditor from '../../../../app/(tabs)/(today)/moments/editor';
import MomentSettings from '../../../../app/(tabs)/(today)/moments/settings';
import ChooseDelivery from '../../../../app/(tabs)/(today)/moments/delivery';
import WishDetails from '../../../../app/(tabs)/(today)/moments/wish';
import ChooseFestivals from '../../../../app/(tabs)/(today)/moments/festivals';
import ScheduleWish from '../../../../app/(tabs)/(today)/moments/schedule-wish';
import ReviewWish from '../../../../app/(tabs)/(today)/moments/review';

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

  it('keeps "No moments yet" on Upcoming only', async () => {
    load([]);
    await render(<ImportantMoments />);
    expect(screen.getByTestId('moments-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('moments-tab-Scheduled'));
    expect(screen.queryByTestId('moments-empty')).toBeNull();
    expect(screen.getByText('No scheduled wishes')).toBeTruthy();
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

  /** docs/android-polish.md §9: the four steps share one size, each as wide as its label. */
  it('draws the four steps at one size on Android, dropping together when they do not fit', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load(group());
    mockParams = { ids: 'a' };
    await render(<ManageMoment />);
    const tabs = ['Details', 'Contacts', 'Wish Message', 'Schedule'];
    const size = (tab: string) => StyleSheet.flatten(within(screen.getByTestId(`festival-tab-${tab}`)).getByText(tab).props.style).fontSize;
    const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 64 } } });

    // No per-tab shrink: each label is one line of plain text, not a FitText.
    for (const tab of tabs) expect(within(screen.getByTestId(`festival-tab-${tab}`)).getByText(tab).props.numberOfLines).toBe(1);

    // "Wish Message" is the long one; on a 360dp-wide row they only fit a step down — all four.
    await fireEvent(screen.getByTestId('festival-tabs'), 'layout', layout(360));
    for (const [index, width] of [50, 66, 98, 66].entries()) {
      await fireEvent(screen.getByTestId(`festival-tabs-measure-${index}`, { includeHiddenElements: true }), 'layout', layout(width));
    }
    expect(tabs.map(size)).toEqual([13, 13, 13, 13]);

    // The selected step keeps its filled indigo pill, and a tab still switches the step.
    expect(StyleSheet.flatten(screen.getByTestId('festival-tab-Details').props.style).backgroundColor).toBe('#3D29F0');
    await fireEvent.press(screen.getByTestId('festival-tab-Contacts'));
    expect(StyleSheet.flatten(screen.getByTestId('festival-tab-Contacts').props.style).backgroundColor).toBe('#3D29F0');
    jest.restoreAllMocks();
  });

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
    await fireEvent.press(screen.getByTestId('festival-tab-Wish Message'));
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
      await fireEvent.press(screen.getByTestId('festival-tab-Wish Message'));
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
      expect(screen.getByTestId('festival-notice').props.children).toBe('AI draft ready for review.');
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

      await reply.resolve({ draft: draft({ body: 'A brand new wish' }), usedAI: true });
      await waitFor(() => expect(screen.getByTestId('festival-message').props.value).toBe('A brand new wish'));
    });
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
    await fireEvent.press(screen.getByTestId('festival-tab-Wish Message'));
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
    await fireEvent.press(screen.getByTestId('festival-tab-Wish Message'));
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
    await fireEvent.changeText(screen.getByTestId('festival-name'), 'Sam’s 30th');
    await fireEvent.press(screen.getByTestId('festival-save'));

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
  it('refreshes for a connected Gmail callback link that arrives with no session open', async () => {
    resetOAuthCallbacks();
    load([], { emailConfigured: true });
    mockSnapshot.mockResolvedValue({ moments: [], emailAccount: { email: 'me@gmail.com', status: 'connected' }, emailConfigured: true, automaticEmailEnabled: false });
    deliverOAuthCallback('moments-email', 'nexdo://moments-email?status=connected');
    await render(<MomentSettings />);
    await waitFor(() => expect(screen.getByText('me@gmail.com')).toBeTruthy());
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
        redirected = redirectOAuthCallback('nexdo://moments-email?status=connected');
      }, 50);
      return { type: 'dismiss' };
    });
    await render(<MomentSettings />);
    await fireEvent.press(screen.getByTestId('settings-connect'));

    await waitFor(() => expect(mockSnapshot).toHaveBeenCalled());
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

    await reply.resolve({ draft: draft({ id: 'new', momentID: 'r', body: 'A brand new wish' }), usedAI: true });
    await waitFor(() => expect(within(tryAnother()).getByText('Try another')).toBeTruthy());
    expect(isDisabled('review-try-another')).toBe(false);
    for (const tone of tones) expect(isDisabled(`review-tone-${tone}`)).toBe(false);
    expect(isDisabled('review-ai')).toBe(false);
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
