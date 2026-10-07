import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { NutritionDay, NutritionEntry, NutritionInsight, NutritionSettings, NutritionSummary } from '../../../api/nutrition';
import type { Profile } from '../../../api';
import { useSession } from '../../../store/session';

const mockApi = {
  settings: jest.fn(),
  saveSettings: jest.fn(),
  day: jest.fn(),
  summary: jest.fn(),
  insight: jest.fn(),
  actOnInsight: jest.fn(),
  sendCode: jest.fn(),
  verifyCode: jest.fn(),
  callNow: jest.fn(),
  addEntry: jest.fn(),
  updateEntry: jest.fn(),
  deleteEntry: jest.fn(),
};
jest.mock('../../../api/nutrition', () => ({
  nutritionApi: new Proxy({}, { get: (_target, key: string) => (...args: unknown[]) => (mockApi as Record<string, jest.Mock>)[key](...args) }),
}));
jest.mock('../../shopping/store', () => ({ shoppingStore: { getState: () => ({ refresh: jest.fn(async () => undefined) }) } }));

import { CalorieTracker } from '../CalorieTracker';

/**
 * `CalorieTrackerView` (ios/App/CalorieTrackerView.swift): all eight pages and the food editor, in the
 * design preview (sample data) and live (the part 1 Nutrition API, mocked here).
 */

const NOW = Date.parse('2026-10-05T19:00:00Z'); // Monday 5 Oct, noon in Los Angeles
const clients: QueryClient[] = [];
let alert: jest.SpyInstance;

function settings(overrides: Partial<NutritionSettings> = {}): NutritionSettings {
  return {
    enabled: false,
    phone: null,
    phoneVerified: false,
    localTime: '19:30',
    timeZone: 'America/Los_Angeles',
    repeatDaily: true,
    noAnswer: 'NOTIFY',
    voice: 'marin',
    calorieGoal: 1800,
    goals: { Protein: 120 },
    voices: ['marin', 'cedar'],
    insightsEnabled: true,
    ...overrides,
  };
}

function entry(overrides: Partial<NutritionEntry> = {}): NutritionEntry {
  return { id: 'e1', meal: 'LUNCH', description: 'Dal and rice', kcal: 450, source: 'USDA', status: 'CONFIRMED', fromCall: true, ...overrides };
}

function day(entries: NutritionEntry[]): NutritionDay {
  return {
    date: '2026-10-05',
    calorieGoal: 1800,
    totals: { kcal: entries.reduce((sum, item) => sum + item.kcal, 0), proteinG: 40.4, carbsG: 120, fatG: 30, fiberG: 9.6, calciumMg: null },
    needsReview: entries.filter((item) => item.status !== 'CONFIRMED').length,
    entries,
  };
}

const SUMMARY: NutritionSummary = {
  startDate: '2026-10-05',
  endDate: '2026-10-11',
  days: 7,
  calorieGoal: 1800,
  daily: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map((date, index) => ({ date, kcal: index === 0 ? 1700 : 0 })),
  averageKcal: 1700,
  daysLogged: 1,
};

async function open(live: boolean, onClose = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  await render(
    <QueryClientProvider client={client}>
      <CalorieTracker live={live} now={() => NOW} onClose={onClose} region="US" />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return onClose;
}

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const title = () => screen.getByRole('header').props.children;
const lastAlert = () => alert.mock.calls[alert.mock.calls.length - 1];

beforeEach(() => {
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'America/Los_Angeles' } as Profile);
});
afterEach(() => {
  alert.mockRestore();
  clients.splice(0).forEach((client) => client.clear());
});

describe('the design preview (not live)', () => {
  it('intro: sample copy, the sample dashboard link and Learn more', async () => {
    await open(false);
    expect(title()).toBe('Create Agent');
    expect(screen.getByTestId('calorie-status')).toHaveTextContent('UI Preview · Sample data · No calls are scheduled');
    expect(screen.getByText('Build a daily habit. Plan a check-in, track meals and explore your nutrition goals.')).toBeTruthy();
    expect(screen.getByText('Preview a natural conversation about your meals and snacks.')).toBeTruthy();
    expect(screen.getByTestId('calorie-to-dashboard')).toHaveTextContent('Explore sample dashboard');
    await press('calorie-learn-more');
    expect(lastAlert()[0]).toBe('Calorie Tracker Preview');
    expect(lastAlert()[1]).toContain('This is a design preview.');
    expect(mockApi.settings).not.toHaveBeenCalled();
  });

  it('time → goals → confirm → ready, with the choices carried into the summary', async () => {
    await open(false);
    await press('calorie-set-up');
    expect(title()).toBe('Daily Food Check-in');
    expect(screen.getByText('When should NexDo call you?')).toBeTruthy();
    expect(screen.getByLabelText('Call time, 8:00 PM')).toBeTruthy();
    await press('calorie-call-time');
    await press('calorie-call-time-hour-7');
    await press('calorie-call-time-minute-30');
    await press('calorie-call-time-done');
    expect(screen.getByLabelText('Call time, 7:30 PM')).toBeTruthy();
    expect(screen.getByText('If I don’t answer')).toBeTruthy();
    await press('calorie-no-answer-RETRY_ONCE');
    expect(screen.getByTestId('calorie-no-answer-RETRY_ONCE').props.accessibilityState).toEqual({ selected: true });
    await press('calorie-time-next');

    expect(screen.getByText('Your Nutrition Goals')).toBeTruthy();
    expect(screen.queryByTestId('insights-toggle')).toBeNull();
    await press('calorie-goal-stepper-increment');
    expect(screen.getByTestId('calorie-goal-value')).toHaveTextContent('2,050 kcal');
    await fireEvent.changeText(screen.getByTestId('calorie-goal-0'), '0');
    await fireEvent.changeText(screen.getByTestId('calorie-goal-7'), '20000');
    await press('calorie-goals-next');

    expect(title()).toBe('Review & Confirm');
    const summary = within(screen.getByTestId('calorie-summary'));
    expect(summary.getByText('Call time: 7:30 PM')).toBeTruthy();
    expect(summary.getByText('If no answer: Retry once')).toBeTruthy();
    expect(summary.getByText('Voice: Marin')).toBeTruthy();
    expect(summary.getByText('2,050 kcal goal')).toBeTruthy();
    expect(screen.queryByTestId('calorie-phone')).toBeNull();
    expect(screen.getByText('Here’s what you’ve set up. You can change these options anytime in this preview.')).toBeTruthy();

    // Back to Goals: Next clamped the values to 1 … 10,000.
    await press('calorie-back');
    expect(screen.getByTestId('calorie-goal-0').props.value).toBe('1');
    expect(screen.getByTestId('calorie-goal-7').props.value).toBe('10,000');
    await press('calorie-restore-goals');
    expect(screen.getByTestId('calorie-goal-value')).toHaveTextContent('2,000 kcal');
    expect(screen.getByTestId('calorie-goal-0').props.value).toBe('150');
    await press('calorie-goals-next');

    await press('calorie-preview-activation');
    expect(title()).toBe('Agent Preview');
    expect(screen.getByText('All Set!')).toBeTruthy();
    expect(screen.getByText('Your check-in design is ready. No agent has been activated and no calls will be placed.')).toBeTruthy();
    expect(screen.getByText('What happens next?')).toBeTruthy();
    expect(screen.queryByTestId('calorie-call-now')).toBeNull();
    await press('calorie-edit-setup');
    expect(screen.getByText('When should NexDo call you?')).toBeTruthy();
  });

  it('"Maybe later" and "View Nutrition Dashboard" lead to the dashboard; Back from there is the intro', async () => {
    const onClose = await open(false);
    await press('calorie-set-up');
    await press('calorie-time-next');
    await press('calorie-goals-next');
    await press('calorie-preview-activation');
    await press('calorie-view-dashboard');
    expect(title()).toBe('Nutrition');
    await press('calorie-back');
    expect(title()).toBe('Create Agent');
    await press('calorie-back');
    expect(onClose).toHaveBeenCalled();
  });

  it('dashboard: the sample day, macros, key nutrients and the Week / Month charts', async () => {
    await open(false);
    await press('calorie-to-dashboard');
    expect(screen.getByTestId('calorie-total')).toHaveTextContent('1,430');
    expect(screen.getByText('of 2,000 kcal')).toBeTruthy();
    expect(screen.getByTestId('calorie-left')).toHaveTextContent('570');
    expect(screen.getByTestId('calorie-percent')).toHaveTextContent('71%');
    expect(within(screen.getByTestId('calorie-macro-0')).getByText('82 / 150 g')).toBeTruthy();
    expect(within(screen.getByTestId('calorie-key-nutrients')).getByText('12 / 25 g')).toBeTruthy();
    expect(screen.queryByText(/Omega-3 isn’t tracked yet/)).toBeNull();
    expect(screen.queryByTestId('insight-card')).toBeNull();
    await press('calorie-period-Week');
    expect(screen.getByText('Calories · Last 7 days')).toBeTruthy();
    expect(screen.getByText('Illustrative trends · Sample data')).toBeTruthy();
    expect(screen.getByTestId('calorie-chart').props.accessibilityLabel).toBe('Calories chart: M 1500 kcal, T 2080 kcal, W 1850 kcal, T 2400 kcal, F 1950 kcal, S 1760 kcal, S 1620 kcal');
    await press('calorie-period-Month');
    expect(screen.getByText('Calories · Weekly averages')).toBeTruthy();
    expect(screen.getByTestId('calorie-chart').props.accessibilityLabel).toBe('Calories chart: W1 1880 kcal');
    expect(screen.queryByTestId('calorie-pause')).toBeNull();
    await press('calorie-manage');
    expect(screen.getByText('When should NexDo call you?')).toBeTruthy();
  });

  it('insights: Nutrient Gaps against the sample targets, Recommendations, Food Ideas into the editor', async () => {
    await open(false);
    await press('calorie-to-dashboard');
    await press('calorie-view-insights');
    expect(title()).toBe('Nutrition Insights');
    expect(screen.getByText('You’ve logged 71% of your sample calorie goal.')).toBeTruthy();
    expect(screen.getByText('Nutrient Gaps')).toBeTruthy();
    expect(within(screen.getByTestId('calorie-gap-3')).getByText('13 g below the sample target')).toBeTruthy();
    expect(within(screen.getByTestId('calorie-gap-6')).getByText('400 IU below the sample target')).toBeTruthy();
    expect(within(screen.getByTestId('calorie-gap-7')).getByText('700 mg below the sample target')).toBeTruthy();
    await press('calorie-insights-tab-Recommendations');
    expect(screen.queryByText('Nutrient Gaps')).toBeNull();
    expect(screen.getByText('Food Ideas')).toBeTruthy();
    await press('calorie-idea-🥣 Greek yogurt');
    expect(screen.getByTestId('calorie-editor-name').props.value).toBe('Greek yogurt');
    expect(screen.getByText('Sample meal')).toBeTruthy();
    expect(screen.getByText('This entry changes the preview only.')).toBeTruthy();
    await press('calorie-editor-cancel');
    expect(screen.queryByTestId('calorie-food-editor')).toBeNull();
    await press('calorie-open-log');
    expect(title()).toBe('Today’s Food Log');
  });

  it('log and the editor: add, edit and remove change the sample day', async () => {
    await open(false);
    await press('calorie-to-dashboard');
    await press('calorie-view-log');
    expect(screen.getByText('Sample meals · Edits last while this preview is open')).toBeTruthy();
    expect(within(screen.getByTestId('calorie-meal-BREAKFAST')).getByText('430 kcal')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove 🍌  Banana'));
    expect(within(screen.getByTestId('calorie-meal-BREAKFAST')).getByText('325 kcal')).toBeTruthy();

    await press('calorie-add-food');
    expect(within(screen.getByTestId('calorie-food-editor')).getByRole('header')).toHaveTextContent('Add Food');
    expect(screen.getByTestId('calorie-editor-save').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('calorie-editor-name'), 'Apple');
    await fireEvent.changeText(screen.getByTestId('calorie-editor-calories'), '5001');
    expect(screen.getByTestId('calorie-editor-save').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('calorie-editor-calories'), '95');
    await press('calorie-editor-meal');
    await press('calorie-editor-meal-SNACKS');
    await press('calorie-editor-save');
    await waitFor(() => expect(screen.queryByTestId('calorie-food-editor')).toBeNull());
    expect(within(screen.getByTestId('calorie-meal-SNACKS')).getByText('265 kcal')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Edit 🐟  Grilled salmon, 180 calories'));
    expect(within(screen.getByTestId('calorie-food-editor')).getByRole('header')).toHaveTextContent('Edit Food');
    expect(screen.getByTestId('calorie-editor-calories').props.value).toBe('180');
    await fireEvent.changeText(screen.getByTestId('calorie-editor-calories'), '220');
    await press('calorie-editor-save');
    // Dinner holds only the salmon: the group total and the row both read 220.
    await waitFor(() => expect(within(screen.getByTestId('calorie-meal-DINNER')).getAllByText('220 kcal')).toHaveLength(2));
    // 1,430 − 105 (banana) + 95 (apple) + 40 (salmon) = 1,460.
    expect(within(screen.getByTestId('calorie-log-total')).getByText('1,460 / 2,000 kcal')).toBeTruthy();
  });
});

describe('live', () => {
  beforeEach(() => {
    mockApi.day.mockResolvedValue(day([entry(), entry({ id: 'e2', meal: 'SNACKS', description: 'Granola bar', kcal: 0, source: 'ESTIMATE', status: 'NEEDS_REVIEW', fromCall: false })]));
    mockApi.summary.mockResolvedValue(SUMMARY);
    mockApi.insight.mockResolvedValue({ insight: null });
  });

  it('with calls off: the live intro, then the phone check, verification and Turn On Daily Calls', async () => {
    mockApi.settings.mockResolvedValue(settings());
    mockApi.sendCode.mockResolvedValue({ sent: true, alreadyVerified: false, phoneVerified: false, channel: 'voice' });
    mockApi.verifyCode.mockResolvedValue(settings({ phone: '+16505550123', phoneVerified: true }));
    mockApi.saveSettings.mockImplementation(async (update) => settings({ ...update, phone: '+16505550123', phoneVerified: true }));
    mockApi.callNow.mockResolvedValue({ callId: 'c1', status: 'dialing' });
    await open(true);
    await waitFor(() => expect(screen.getByTestId('calorie-status')).toHaveTextContent('Daily calls are off'));
    expect(title()).toBe('Create Agent');
    expect(screen.getByTestId('calorie-to-dashboard')).toHaveTextContent('Go to my dashboard');
    await press('calorie-set-up');
    // The saved settings were applied: 7:30 PM and the 120 g protein goal.
    expect(screen.getByLabelText('Call time, 7:30 PM')).toBeTruthy();
    await press('calorie-time-next');
    expect(screen.getByTestId('calorie-goal-0').props.value).toBe('120');
    expect(screen.getByTestId('insights-toggle')).toBeTruthy();
    await press('calorie-goals-next');

    expect(screen.getByText('Your phone number')).toBeTruthy();
    expect(screen.getByTestId('calorie-turn-on').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('calorie-phone-input'), '12');
    await press('calorie-send-code');
    expect(lastAlert()[1]).toBe('Enter your mobile number with its country code, for example +1 650 555 0123.');
    await fireEvent.changeText(screen.getByTestId('calorie-phone-input'), '(650) 555-0123');
    await press('calorie-send-code');
    await waitFor(() => expect(mockApi.sendCode).toHaveBeenCalledWith('+16505550123'));
    await waitFor(() => expect(lastAlert()[1]).toBe('Calling +16505550123 now. Answer to hear your 6-digit code.'));
    expect(lastAlert()[0]).toBe('Calorie Tracker');
    expect(screen.getByTestId('calorie-send-code')).toHaveTextContent('Call me again with a code');
    await fireEvent.changeText(screen.getByTestId('calorie-code-input'), '12345');
    expect(screen.getByTestId('calorie-verify').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('calorie-code-input'), '123 456');
    await press('calorie-verify');
    await waitFor(() => expect(screen.getByTestId('calorie-change-phone')).toBeTruthy());
    expect(mockApi.verifyCode).toHaveBeenCalledWith('123456');
    expect(screen.getByText('+16505550123')).toBeTruthy();

    await press('calorie-turn-on');
    await waitFor(() => expect(title()).toBe('Daily Check-in'));
    expect(mockApi.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, localTime: '19:30', calorieGoal: 1800, insightsEnabled: true, goals: expect.objectContaining({ Protein: 120 }) }));
    expect(screen.getByText('NexDo will call you at 7:30 PM to log your meals.')).toBeTruthy();
    await press('calorie-call-now');
    await waitFor(() => expect(lastAlert()[1]).toBe('Calling you now. Pick up to log today’s meals.'));
    // Turning calls on rewrites the history to [intro], as Swift does.
    await press('calorie-back');
    expect(title()).toBe('Create Agent');
  });

  it('"Save without calls" saves and opens the dashboard; a failure shows the server\'s message', async () => {
    mockApi.settings.mockResolvedValue(settings());
    mockApi.saveSettings.mockRejectedValueOnce(new Error('Check the values and try again.')).mockResolvedValueOnce(settings());
    await open(true);
    await waitFor(() => expect(screen.getByTestId('calorie-status')).toHaveTextContent('Daily calls are off'));
    await press('calorie-set-up');
    await press('calorie-time-next');
    await press('calorie-goals-next');
    await press('calorie-save-without-calls');
    await waitFor(() => expect(lastAlert()).toEqual(['Calorie Tracker', 'Check the values and try again.', [{ text: 'OK', style: 'cancel' }]]));
    expect(title()).toBe('Review & Confirm');
    await press('calorie-save-without-calls');
    await waitFor(() => expect(title()).toBe('Nutrition'));
    expect(mockApi.saveSettings.mock.calls[1][0]).not.toHaveProperty('enabled');
  });

  it('with calls on: opens on the dashboard, with the insight card, the review link and Pause daily calls', async () => {
    const insight: NutritionInsight = { key: 'k1', kind: 'GAP', title: 'Fiber has been low', text: 'You averaged 9 g of fiber this week.', nutrient: 'Fiber', items: ['Oats'], listTitle: 'Groceries', state: 'open' };
    mockApi.settings.mockResolvedValue(settings({ enabled: true, phone: '+16505550123', phoneVerified: true }));
    mockApi.insight.mockResolvedValue({ insight });
    mockApi.actOnInsight.mockResolvedValue({ ok: true, added: ['Oats'], listTitle: 'Groceries' });
    mockApi.saveSettings.mockResolvedValue(settings({ enabled: false }));
    await open(true);
    await waitFor(() => expect(title()).toBe('Nutrition'));
    expect(screen.getByTestId('calorie-status')).toHaveTextContent('Daily call at 7:30 PM');
    await waitFor(() => expect(screen.getByTestId('insight-card')).toBeTruthy());
    expect(mockApi.insight).toHaveBeenCalledWith('2026-10-05');
    expect(screen.getByText('Fiber has been low')).toBeTruthy();
    expect(screen.getByTestId('calorie-total')).toHaveTextContent('450');
    expect(screen.getByText('of 1,800 kcal')).toBeTruthy();
    expect(within(screen.getByTestId('calorie-macro-0')).getByText('40 / 120 g')).toBeTruthy();
    expect(within(screen.getByTestId('calorie-key-nutrients')).getByText('10 / 25 g')).toBeTruthy();
    // Calcium is unknown today and omega-3 is not tracked: both show their goal alone.
    expect(within(screen.getByTestId('calorie-key-nutrients')).getAllByText('Goal 1,000 mg')).toHaveLength(2);
    expect(screen.getByText(/Omega-3 isn’t tracked yet/)).toBeTruthy();
    expect(screen.getByText('1 item to review in your food log')).toBeTruthy();

    await press('insight-add');
    await waitFor(() => expect(screen.getByText('Added to Groceries')).toBeTruthy());
    expect(mockApi.actOnInsight).toHaveBeenCalledWith({ date: '2026-10-05', key: 'k1', action: 'add' });

    await press('calorie-pause');
    await waitFor(() => expect(lastAlert()[1]).toBe('Daily calls are paused. Turn them back on from Manage daily check-in.'));
    expect(mockApi.saveSettings).toHaveBeenCalledWith({ enabled: false });
  });

  it('an insight with nothing to add offers "Got it"; one with items offers "Not now"', async () => {
    mockApi.settings.mockResolvedValue(settings({ enabled: true }));
    mockApi.insight.mockResolvedValue({ insight: { key: 'k2', kind: 'STREAK', title: 'Three days logged', text: 'Keep going.', items: [], state: 'open' } });
    mockApi.actOnInsight.mockResolvedValue({ ok: true, added: [], listTitle: null });
    await open(true);
    await waitFor(() => expect(screen.getByTestId('insight-card')).toBeTruthy());
    expect(screen.getByTestId('insight-dismiss')).toHaveTextContent('Got it');
    await press('insight-dismiss');
    await waitFor(() => expect(screen.queryByTestId('insight-card')).toBeNull());
    expect(mockApi.actOnInsight).toHaveBeenCalledWith({ date: '2026-10-05', key: 'k2', action: 'dismiss' });
  });

  it('Week shows this Monday–Sunday week from the server; Insights shows This Week', async () => {
    mockApi.settings.mockResolvedValue(settings({ enabled: true }));
    await open(true);
    await waitFor(() => expect(title()).toBe('Nutrition'));
    await press('calorie-period-Week');
    await waitFor(() => expect(screen.getByText('Average 1700 kcal on 1 logged day')).toBeTruthy());
    expect(screen.getByText('Calories · This week (Mon–Sun)')).toBeTruthy();
    expect(mockApi.summary).toHaveBeenCalledWith('week', '2026-10-05');
    expect(screen.getByTestId('calorie-chart').props.accessibilityLabel).toContain('M 1700 kcal');
    await press('calorie-period-Today');
    await press('calorie-view-insights');
    await waitFor(() => expect(screen.getByText('1 of 7 days logged')).toBeTruthy());
    expect(screen.getByText('This Week')).toBeTruthy();
    expect(screen.getByText('Average 1700 kcal on the days you logged, against a 1800 kcal goal.')).toBeTruthy();
    expect(screen.getByText('1 item to review')).toBeTruthy();
    expect(screen.getByText('You’ve logged 25% of today’s calorie goal.')).toBeTruthy();
  });

  it('log: "Looks right", Edit and Add go to the server for the selected day', async () => {
    mockApi.settings.mockResolvedValue(settings({ enabled: true }));
    mockApi.updateEntry.mockResolvedValue({ entry: entry() });
    mockApi.addEntry.mockResolvedValue({ entry: entry({ id: 'e3' }) });
    mockApi.deleteEntry.mockResolvedValue({ deleted: true });
    await open(true);
    await waitFor(() => expect(title()).toBe('Nutrition'));
    await press('calorie-view-log');
    await waitFor(() => expect(screen.getByText('Granola bar')).toBeTruthy());
    expect(screen.getByText('Items from your check-in call and ones you add here')).toBeTruthy();
    expect(screen.getByLabelText('From your call')).toBeTruthy();
    expect(screen.getByText('Estimated')).toBeTruthy();
    await press('calorie-confirm-e2');
    await waitFor(() => expect(mockApi.updateEntry).toHaveBeenCalledWith('e2', { confirm: true }));

    await press('calorie-edit-e2');
    expect(screen.getByText('Food')).toBeTruthy();
    expect(screen.getByText('Saved to your food log for Oct 5, 2026.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('calorie-editor-calories'), '190');
    await press('calorie-editor-save');
    await waitFor(() => expect(mockApi.updateEntry).toHaveBeenLastCalledWith('e2', { meal: 'SNACKS', description: 'Granola bar', kcal: 190 }));
    await waitFor(() => expect(screen.queryByTestId('calorie-food-editor')).toBeNull());

    await press('calorie-add-food');
    await fireEvent.changeText(screen.getByTestId('calorie-editor-name'), '  Tea ');
    await fireEvent.changeText(screen.getByTestId('calorie-editor-calories'), '0');
    await press('calorie-editor-save');
    await waitFor(() => expect(mockApi.addEntry).toHaveBeenCalledWith({ date: '2026-10-05', meal: 'BREAKFAST', description: 'Tea', kcal: 0 }));

    await fireEvent.press(screen.getByLabelText('Remove Dal and rice'));
    await waitFor(() => expect(mockApi.deleteEntry).toHaveBeenCalledWith('e1'));
  });

  it('Edit sends kcal only when it changed, so a rename or a new meal keeps the nutrients', async () => {
    mockApi.settings.mockResolvedValue(settings({ enabled: true }));
    mockApi.updateEntry.mockResolvedValue({ entry: entry() });
    await open(true);
    await waitFor(() => expect(title()).toBe('Nutrition'));
    await press('calorie-view-log');
    await waitFor(() => expect(screen.getByText('Dal and rice')).toBeTruthy());

    // A confirmed food opens the editor from its calories.
    await fireEvent.press(screen.getByLabelText('Edit Dal and rice, 450 calories'));
    await fireEvent.changeText(screen.getByTestId('calorie-editor-name'), 'Dal, rice and ghee');
    await press('calorie-editor-save');
    await waitFor(() => expect(mockApi.updateEntry).toHaveBeenLastCalledWith('e1', { meal: 'LUNCH', description: 'Dal, rice and ghee' }));
    await waitFor(() => expect(screen.queryByTestId('calorie-food-editor')).toBeNull());

    // The day reloads from the server, which still has the old name.
    await fireEvent.press(await screen.findByLabelText('Edit Dal and rice, 450 calories'));
    await fireEvent.changeText(screen.getByTestId('calorie-editor-calories'), '500');
    await press('calorie-editor-save');
    await waitFor(() => expect(mockApi.updateEntry).toHaveBeenLastCalledWith('e1', { meal: 'LUNCH', description: 'Dal and rice', kcal: 500 }));
  });

  it('the day moves back, never past today, and reloads', async () => {
    mockApi.settings.mockResolvedValue(settings({ enabled: true }));
    await open(true);
    await waitFor(() => expect(title()).toBe('Nutrition'));
    await press('calorie-next-day');
    expect(screen.getByTestId('calorie-date')).toHaveTextContent('Oct 5, 2026');
    await press('calorie-previous-day');
    expect(screen.getByTestId('calorie-date')).toHaveTextContent('Oct 4, 2026');
    await waitFor(() => expect(mockApi.day).toHaveBeenCalledWith('2026-10-04'));
    // Not today: no insight card is asked for.
    expect(mockApi.insight).not.toHaveBeenCalledWith('2026-10-04');
  });
});
