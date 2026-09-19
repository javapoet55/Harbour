import type { ImportantMoment } from '../api/moments';
import type { GroceryList } from '../api/shopping';
import {
  attentionRowSubtitle,
  commitmentCount,
  commitmentHeadline,
  momentDisplayGroups,
  momentsDueToday,
  nextShoppingList,
  readFestivalSettings,
  shoppingSubtitle,
  showsAttentionRow,
  summaryLine,
  upcomingMomentCount,
} from './todayQuickAccess';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata. */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function moment(id: string, nextOccurrence: string, extra: Partial<ImportantMoment> = {}): ImportantMoment {
  return {
    id,
    type: 'custom',
    title: `Moment ${id}`,
    firstName: '',
    phone: '',
    email: '',
    occurrenceDate: nextOccurrence,
    timeZoneID: ZONE,
    source: 'manual',
    sourceKey: id,
    yearly: false,
    enabled: true,
    festivalSettings: '{}',
    snoozedUntil: null,
    nextOccurrence,
    drafts: [],
    ...extra,
  };
}

/** Every key the synthesised `FestivalSettings` decoder requires (FestivalManagement.swift:3-19). */
function festivalSettings(groupID: string, archived = false): string {
  return JSON.stringify({
    groupID,
    prepareDays: 7,
    catalogID: '',
    catalogManaged: false,
    baseMessage: '',
    tone: 'Warm',
    personalContext: '',
    manuallyEdited: false,
    includeImage: false,
    imageID: '',
    imageStyle: 'Traditional',
    imageAspect: 'Portrait',
    imagePrompt: '',
    overrides: {},
    channels: {},
    contactIDs: {},
    automatic: {},
    selected: {},
    archived,
  });
}

/** `TodayIntelligenceCard` summary (RootView.swift:1403-1413, e0a7bcd). */
describe('the "Your day, in focus" summary', () => {
  it('composes "X Tasks · Y Appointments · Z Moments", singularising each', () => {
    expect(summaryLine(0, 0, 0)).toBe('0 Tasks · 0 Appointments · 0 Moments');
    expect(summaryLine(1, 1, 1)).toBe('1 Task · 1 Appointment · 1 Moment');
    expect(summaryLine(3, 2, 4)).toBe('3 Tasks · 2 Appointments · 4 Moments');
  });

  it('counts moments into the commitment total', () => {
    expect(commitmentCount(2, 1, 3)).toBe(6);
    expect(commitmentHeadline(commitmentCount(0, 1, 0), true)).toBe('1 commitment today');
    expect(commitmentHeadline(commitmentCount(2, 1, 3), false)).toBe('6 commitments ahead');
  });
});

/** The attention row (RootView.swift:1146-1166). */
describe('the attention row', () => {
  it.each([
    [1, 0, '1 overdue task'],
    [3, 0, '3 overdue tasks'],
    [1, 2, '1 overdue task · 2 other'],
    [0, 1, '1 schedule check'],
    [0, 2, '2 schedule checks'],
  ])('overdue %i, other %i reads "%s"', (overdue, other, expected) => {
    expect(attentionRowSubtitle(overdue, other)).toBe(expected);
  });

  it('shows only when something needs attention', () => {
    expect(showsAttentionRow(0, 0)).toBe(false);
    expect(showsAttentionRow(1, 0)).toBe(true);
    expect(showsAttentionRow(0, 1)).toBe(true);
  });
});

/** `ImportantMomentsStore.today` (ImportantMomentsStore.swift:65-67). */
describe('momentsDueToday', () => {
  it('keeps enabled moments occurring today in their own zone', () => {
    const result = momentsDueToday([moment('today', '2026-09-16'), moment('tomorrow', '2026-09-17'), moment('off', '2026-09-16', { enabled: false })], NOW);
    expect(result.map((item) => item.id)).toEqual(['today']);
  });

  it('uses each moment’s zone: 09:00 in Kolkata is still the 15th in Los Angeles', () => {
    expect(momentsDueToday([moment('la', '2026-09-15', { timeZoneID: 'America/Los_Angeles' })], NOW)).toHaveLength(1);
  });

  it('drops a moment snoozed past now, and keeps one whose snooze has ended', () => {
    const snoozed = moment('snoozed', '2026-09-16', { snoozedUntil: '2026-09-16T04:30:00.000Z' });
    const woke = moment('woke', '2026-09-16', { snoozedUntil: '2026-09-16T02:00:00.000Z' });
    expect(momentsDueToday([snoozed, woke], NOW).map((item) => item.id)).toEqual(['woke']);
  });

  it('drops a moment whose wish for this occurrence was already SENT', () => {
    const plan = {
      id: 'p',
      draftID: 'd',
      channel: 'sms',
      recipient: '',
      subject: '',
      body: '',
      scheduledAtUTC: '2026-09-16T02:30:00.000Z',
      timeZoneID: ZONE,
      status: 'SENT',
      idempotencyKey: 'k',
      automaticDelivery: false,
      repeatYearly: false,
      reminderOffset: 0,
    };
    const draft = { id: 'd', momentID: 'sent', tone: 'Warm', body: '', personalContext: '', status: 'READY', generationVersion: 1, plans: [plan] };
    expect(momentsDueToday([moment('sent', '2026-09-16', { drafts: [draft] })], NOW)).toHaveLength(0);
    // A scheduled (not yet sent) wish does not remove it.
    const pending = { ...draft, plans: [{ ...plan, status: 'SCHEDULED' }] };
    expect(momentsDueToday([moment('sent', '2026-09-16', { drafts: [pending] })], NOW)).toHaveLength(1);
  });
});

/** `upcomingCount` and `MomentDisplayGroup.groups` (TodayQuickAccess.swift:27-31, ImportantMoment.swift:126-144). */
describe('upcomingMomentCount', () => {
  it('counts enabled moments on or after today, not past or disabled ones', () => {
    const moments = [moment('past', '2026-09-15'), moment('today', '2026-09-16'), moment('later', '2026-10-01'), moment('off', '2026-10-01', { enabled: false })];
    expect(upcomingMomentCount(moments, NOW)).toBe(2);
  });

  it('counts a greeting-card group once', () => {
    const settings = festivalSettings('g1');
    const moments = [
      moment('a', '2026-10-01', { type: 'birthday', festivalSettings: settings }),
      moment('b', '2026-10-01', { type: 'birthday', festivalSettings: settings }),
      moment('c', '2026-10-01', { type: 'birthday' }),
    ];
    expect(momentDisplayGroups(moments).map((group) => group.map((item) => item.id))).toEqual([['a', 'b'], ['c']]);
    expect(upcomingMomentCount(moments, NOW)).toBe(2);
  });

  it('groups festivals with recipients by title, day, zone and yearly', () => {
    const moments = [
      moment('a', '2026-11-08', { type: 'festival', title: 'Diwali', firstName: 'Asha' }),
      moment('b', '2026-11-08', { type: 'festival', title: ' diwali ', firstName: 'Ravi' }),
      moment('c', '2026-11-08', { type: 'festival', title: 'Diwali' }),
    ];
    expect(momentDisplayGroups(moments)).toHaveLength(2);
  });
});

describe('readFestivalSettings', () => {
  it('is nil for the column default "{}", as the strict Swift decoder is', () => {
    expect(readFestivalSettings('{}')).toBeNull();
    expect(readFestivalSettings(null)).toBeNull();
    expect(readFestivalSettings('not json')).toBeNull();
  });

  it('reads complete settings', () => {
    expect(readFestivalSettings(festivalSettings('g1', true))).toEqual({ groupID: 'g1', archived: true });
  });

  it('is nil when a required key has the wrong type', () => {
    const broken = JSON.parse(festivalSettings('g1'));
    broken.prepareDays = 'seven';
    expect(readFestivalSettings(JSON.stringify(broken))).toBeNull();
  });
});

/** `nextList` and `shoppingSubtitle` (TodayQuickAccess.swift:24-40). */
describe('the Shopping tile', () => {
  const item = (id: string, checked: boolean) => ({ id, name: id, category: 'Other', quantity: '1', size: '', notes: '', checked });
  const list = (id: string, date: string, items = [item('a', false)], completedAt: string | null = null): GroceryList => ({
    id,
    title: id,
    date,
    timeZone: ZONE,
    weekly: false,
    completedAt,
    revision: 0,
    items,
  });

  it('picks the earliest UNCOMPLETED list', () => {
    const lists = [list('late', '2026-09-30'), list('done', '2026-09-01', [], '2026-09-02T00:00:00.000Z'), list('soon', '2026-09-18')];
    expect(nextShoppingList(lists)?.id).toBe('soon');
  });

  it('reads "N items · Day", counting unchecked items and never singularising', () => {
    expect(shoppingSubtitle([list('soon', '2026-09-18', [item('a', false), item('b', true)])], false)).toBe('1 items · Fri');
    expect(shoppingSubtitle([list('soon', '2026-09-20', [item('a', false), item('b', false)])], false)).toBe('2 items · Sun');
  });

  it('reads "Your lists" with no open list and "View lists" after a failed refresh', () => {
    expect(shoppingSubtitle([], false)).toBe('Your lists');
    expect(shoppingSubtitle([list('done', '2026-09-01', [], '2026-09-02T00:00:00.000Z')], false)).toBe('Your lists');
    expect(shoppingSubtitle([list('soon', '2026-09-18')], true)).toBe('View lists');
  });
});
