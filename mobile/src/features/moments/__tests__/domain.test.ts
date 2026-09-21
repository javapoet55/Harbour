import {
  isoString,
  keepTimeOnDay,
  momentDate,
  momentDay,
  momentLabel,
  momentRelative,
  nextOccurrence,
  sendDayLabel,
  upcomingGroupFor,
  zonedInstant,
} from '../dates';
import {
  capitalized,
  composerPlanAction,
  defaultSignature,
  defaultTitle,
  displayedMoments,
  displayGroups,
  editableGroups,
  greetingHeading,
  greetingMessage,
  isArchived,
  maskedAddress,
  needsWishReview,
  normalizedPhone,
  OPENED_UNCONFIRMED,
  planEditable,
  planStatusLabel,
  readFestivalSettings,
  readyToSchedule,
  recipientInitials,
  sortedPlans,
  tabPlans,
  todayMoments,
  typeLabel,
  upcomingDelivery,
  upcomingMomentCount,
  updatingTitle,
  validateRecipients,
  validateSchedule,
  type ManagedRecipient,
} from '../domain';
import { draft, moment, plan, settings } from '../testFixtures';

describe('MomentDates', () => {
  // ImportantMomentTests.swift: momentRecurrenceKeepsLeapDayAndUsesRecipientZone
  it('observes February 29 on February 28 in a non-leap year, in the recipient zone', () => {
    const now = Date.parse('2027-03-01T01:00:00Z');
    expect(nextOccurrence('2000-02-29', true, 'America/Los_Angeles', now)).toBe('2027-02-28');
    expect(nextOccurrence('2000-02-29', true, 'Asia/Tokyo', now)).toBe('2028-02-29');
    expect(nextOccurrence('2026-12-25', false, 'UTC', now)).toBe('2026-12-25');
  });

  it('keeps February 29 in a leap year', () => {
    expect(nextOccurrence('2000-02-29', true, 'UTC', Date.parse('2028-01-10T12:00:00Z'))).toBe('2028-02-29');
  });

  // momentLocalDatesAcrossDST
  it('round-trips local days across DST', () => {
    for (const day of ['2026-03-08', '2026-11-01']) {
      expect(momentDay(momentDate(day, 'America/Los_Angeles'), 'America/Los_Angeles')).toBe(day);
    }
  });

  it('labels relative days', () => {
    const now = Date.parse('2026-09-19T12:00:00Z');
    expect(momentRelative('2026-09-19', 'UTC', now)).toBe('Today');
    expect(momentRelative('2026-09-20', 'UTC', now)).toBe('Tomorrow');
    expect(momentRelative('2026-09-29', 'UTC', now)).toBe('In 10 days');
    expect(momentRelative('2026-09-01', 'UTC', now)).toBe('Past moment');
  });

  it('formats the send day and the medium/short label', () => {
    const at = Date.parse('2026-10-25T15:00:00Z');
    expect(sendDayLabel(at, 'America/Los_Angeles')).toBe('Sun, Oct 25, 2026');
    // momentLabel formats in the device locale by design, so pin one here; the
    // assertion would otherwise depend on the machine running the suite.
    expect(momentLabel(at, 'America/Los_Angeles', 'en-US')).toBe('Oct 25, 2026 at 8:00 AM');
  });

  it('writes ISO instants without fractions, as ISO8601DateFormatter does', () => {
    expect(isoString(Date.parse('2026-10-25T15:00:00.789Z'))).toBe('2026-10-25T15:00:00Z');
  });

  it('finds a wall time in a zone and rejects a DST gap', () => {
    expect(zonedInstant('2026-10-25', 8, 0, 'America/Los_Angeles')).toBe(Date.parse('2026-10-25T15:00:00Z'));
    expect(zonedInstant('2026-03-08', 2, 30, 'America/Los_Angeles')).toBeNull();
    // A repeated hour takes the first instant.
    expect(zonedInstant('2026-11-01', 1, 30, 'America/Los_Angeles')).toBe(Date.parse('2026-11-01T08:30:00Z'));
    expect(zonedInstant('2026-10-25', 8, 0, 'Not/AZone')).toBeNull();
  });

  it('moves a send time to a new day, keeping its local time', () => {
    const send = Date.parse('2026-10-25T15:30:00Z'); // 8:30 PDT
    expect(keepTimeOnDay(send, '2026-12-01', 'America/Los_Angeles')).toBe(Date.parse('2026-12-01T16:30:00Z')); // 8:30 PST
  });

  // momentGroupsUseOccurrenceAndRecipientCalendar
  it('buckets upcoming moments the way Swift orders its checks', () => {
    const now = momentDate('2026-09-16', 'America/Los_Angeles');
    const zone = 'America/Los_Angeles';
    expect(upcomingGroupFor('2026-09-17', zone, now)).toBe('This Week');
    expect(upcomingGroupFor('2026-09-23', zone, now)).toBe('Next Week');
    expect(upcomingGroupFor('2026-09-30', zone, now)).toBe('This Month');
    expect(upcomingGroupFor('2026-10-20', zone, now)).toBe('Next Month');
    expect(upcomingGroupFor('2026-11-20', zone, now)).toBe('Later');
    expect(upcomingGroupFor('2027-01-20', zone, momentDate('2026-12-16', zone))).toBe('Next Month');
    // Next week, but in next month: Next Month is checked first.
    expect(upcomingGroupFor('2026-10-01', zone, momentDate('2026-09-25', zone))).toBe('Next Month');
  });
});

describe('plans', () => {
  // wishResultsNeverConfuseCopyWithSent
  it('never confuses Copy with Sent', () => {
    const copied = plan({ channel: 'copy', status: 'COPIED', scheduledAtUTC: '2026-09-17T16:00:00.000Z', timeZoneID: 'America/Los_Angeles' });
    expect(planStatusLabel(copied)).toBe('Copied — delivery not confirmed');
    expect(planEditable(copied)).toBe(false);
  });

  // An Android composer cannot confirm a send, so the wish stays awaiting confirmation and reads
  // the same way Copy and Share do rather than claiming it was sent or failed.
  it('distinguishes an opened Messages wish from one still awaiting the composer', () => {
    expect(planStatusLabel(plan({ status: 'AWAITING_CONFIRMATION', lastError: OPENED_UNCONFIRMED }))).toBe('Opened — delivery not confirmed');
    expect(planStatusLabel(plan({ status: 'AWAITING_CONFIRMATION', lastError: 'Something else went wrong.' }))).toBe('Confirmation required');
  });

  it.each([
    ['submitted', 'sent'],
    ['unknown', 'opened'],
    ['failed', 'failed'],
    ['cancelled', null],
  ] as const)('records the %s composer outcome as %s', (outcome, expected) => {
    expect(composerPlanAction(outcome)).toBe(expected);
  });

  it('labels every status', () => {
    expect(planStatusLabel(plan({ status: 'SCHEDULED' }))).toBe('Auto-send scheduled');
    expect(planStatusLabel(plan({ status: 'AWAITING_CONFIRMATION' }))).toBe('Confirmation required');
    expect(planStatusLabel(plan({ status: 'SHARED' }))).toBe('Shared — delivery not confirmed');
    expect(planStatusLabel(plan({ status: 'UNCERTAIN' }))).toBe('Check Sent mail');
    expect(planStatusLabel(plan({ status: 'CANCELLED' }))).toBe('Cancelled');
    expect(planStatusLabel(plan({ status: 'SOME_THING' }))).toBe('Some thing');
  });

  it('capitalises like Foundation', () => {
    expect(capitalized('messages')).toBe('Messages');
    expect(typeLabel('getWellSoon')).toBe('Get Well Soon');
    expect(typeLabel('custom')).toBe('Custom');
  });
});

describe('review state', () => {
  // wishReviewDistinguishesApprovalFromScheduling
  it('distinguishes approval from scheduling', () => {
    let item = moment({ type: 'festival', title: 'Diwali', firstName: 'Sam', occurrenceDate: '2026-09-20', nextOccurrence: '2026-09-20', festivalSettings: null });
    expect(needsWishReview(item)).toBe(true);
    item = { ...item, festivalSettings: settings({ baseMessage: 'Happy Diwali', approvedAt: '2026-09-17T00:00:00Z' }) };
    expect(readyToSchedule(item)).toBe(true);
    expect(needsWishReview(item)).toBe(false);
    const awaiting = plan({ scheduledAtUTC: '2026-09-20T08:00:00Z', reminderOffset: 60 });
    item = { ...item, drafts: [draft({ status: 'PLANNED', plans: [awaiting] })] };
    expect(upcomingDelivery(item)).toBeDefined();
    expect(needsWishReview(item)).toBe(false);
    expect(readyToSchedule(item)).toBe(false);
    item = { ...item, drafts: [draft({ status: 'PLANNED', plans: [{ ...awaiting, status: 'CANCELLED' }] })] };
    expect(readyToSchedule(item)).toBe(true);
    item = { ...item, festivalSettings: settings({ baseMessage: 'Happy Diwali', approvedAt: null }) };
    expect(needsWishReview(item)).toBe(true);
    item = { ...item, type: 'birthday', festivalSettings: null, drafts: [draft({ body: 'Happy Birthday' })] };
    expect(readyToSchedule(item)).toBe(true);
    item = { ...item, nextOccurrence: '2027-09-20' };
    expect(needsWishReview(item)).toBe(true);
    item = { ...item, enabled: false };
    expect(needsWishReview(item)).toBe(false);
  });

  it('does not treat a sent custom wish as ready again', () => {
    const item = moment({ type: 'custom', drafts: [draft({ plans: [plan({ status: 'SENT' })] })] });
    expect(readyToSchedule(item)).toBe(false);
  });
});

describe('FestivalSettings.read', () => {
  it('needs every non-optional key, as Swift’s synthesised Decodable does', () => {
    expect(readFestivalSettings('{}')).toBeNull();
    expect(readFestivalSettings('{"archived":true}')).toBeNull();
    expect(readFestivalSettings('not json')).toBeNull();
    expect(readFestivalSettings(settings())?.groupID).toBe('shared');
    expect(readFestivalSettings(settings({ approvedAt: null }))?.approvedAt).toBeNull();
  });

  it('reads archived from the raw JSON, not through the settings decoder', () => {
    expect(isArchived(moment({ festivalSettings: '{ "archived" : true }' }))).toBe(true);
    expect(isArchived(moment({ festivalSettings: settings({ archived: false }) }))).toBe(false);
    expect(isArchived(moment({ festivalSettings: null }))).toBe(false);
  });
});

describe('display groups', () => {
  // festivalCardsGroupRecipientsWithoutMergingOtherOccasions
  it('groups festival recipients without merging other occasions', () => {
    const festival = (id: string, title = 'Happy Diwali', day = '2026-10-20', type = 'festival') =>
      moment({ id, type, title, firstName: id, occurrenceDate: day, nextOccurrence: day, timeZoneID: 'America/Los_Angeles', sourceKey: id, festivalSettings: null });
    const groups = displayGroups([
      festival('a'),
      festival('b', ' happy diwali '),
      festival('c', 'Happy Diwali', '2026-10-21'),
      festival('d', 'Happy Holi'),
      festival('e', 'Happy Diwali', '2026-10-20', 'birthday'),
      festival('f', 'Happy Diwali', '2026-10-20', 'birthday'),
    ]);
    expect(groups).toHaveLength(5);
    expect(groups[0].moments.map((item) => item.id)).toEqual(['a', 'b']);
    expect(groups.slice(1).every((group) => group.moments.length === 1)).toBe(true);
  });

  // allGreetingCategoriesKeepGroupsAndApproval
  it.each(['birthday', 'anniversary', 'getWellSoon', 'festival'])('keeps %s recipients in one approved group', (type) => {
    const encoded = settings({ baseMessage: 'Warm wishes', cardSignature: 'With love, Sam', approvedAt: '2026-09-17T00:00:00Z' });
    const make = (id: string, category: string) => moment({ id, type: category, title: 'Occasion', firstName: id, sourceKey: id, festivalSettings: encoded });
    const a = make('a', type);
    const groups = displayGroups([a, make('b', type), make('c', type === 'festival' ? 'birthday' : 'festival')]);
    expect(readyToSchedule(a)).toBe(true);
    expect(needsWishReview(a)).toBe(false);
    expect(groups).toHaveLength(2);
    expect(groups[0].moments).toHaveLength(2);
  });

  // editableMomentGroupsExcludeArchivedRecipientsButHistoryKeepsThem
  it('excludes archived recipients from editing but keeps them in history', () => {
    const removed = moment({ id: 'removed', firstName: 'removed', yearly: true, enabled: false, festivalSettings: settings({ archived: true }) });
    const current = moment({ id: 'current', firstName: 'current', yearly: true, festivalSettings: settings({ archived: false }) });
    expect(editableGroups([removed, current])[0].moments.map((item) => item.id)).toEqual(['current']);
    expect(displayGroups([removed, current])[0].moments).toHaveLength(2);
    expect(editableGroups([{ ...current, festivalSettings: '{ "archived" : true }' }])).toHaveLength(0);
  });

  it('counts upcoming groups for the Quick Access tile', () => {
    const now = Date.parse('2030-09-01T12:00:00Z');
    const encoded = settings();
    const list = [
      moment({ id: 'a', firstName: 'a', festivalSettings: encoded }),
      moment({ id: 'b', firstName: 'b', festivalSettings: encoded }),
      moment({ id: 'c', type: 'custom', enabled: false }),
      moment({ id: 'd', type: 'custom', occurrenceDate: '2030-08-01', nextOccurrence: '2030-08-01' }),
    ];
    expect(upcomingMomentCount(list, now)).toBe(1);
  });
});

describe('list filters', () => {
  const now = Date.parse('2030-09-01T12:00:00Z');
  const list = [
    moment({ id: 'birthday', title: 'Sam’s Birthday', drafts: [draft({ id: 'd1', plans: [plan({ id: 'p1', draftID: 'd1', status: 'SENT' })] })] }),
    moment({ id: 'well', type: 'getWellSoon', title: 'Get Well Soon', occurrenceDate: '2030-09-05', nextOccurrence: '2030-09-05', drafts: [draft({ id: 'd2', plans: [plan({ id: 'p2', draftID: 'd2', status: 'SCHEDULED', automaticDelivery: true }), plan({ id: 'p3', draftID: 'd2', status: 'CANCELLED' })] })] }),
    moment({ id: 'past', type: 'custom', title: 'Old', occurrenceDate: '2030-08-01', nextOccurrence: '2030-08-01', drafts: [draft({ id: 'd4', plans: [plan({ id: 'p4', draftID: 'd4', status: 'FAILED' })] })] }),
    moment({ id: 'archived', title: 'Removed', festivalSettings: '{"archived":true}', drafts: [draft({ id: 'd5', plans: [plan({ id: 'p5', draftID: 'd5', status: 'COPIED' })] })] }),
  ];

  it('hides past moments on Upcoming and archived ones everywhere but Sent', () => {
    expect(displayedMoments(list, { tab: 'Upcoming', filter: 'All', search: '' }, now).map((item) => item.id)).toEqual(['well', 'birthday']);
    expect(displayedMoments(list, { tab: 'Scheduled', filter: 'All', search: '' }, now).map((item) => item.id)).toEqual(['past', 'well', 'birthday']);
    expect(displayedMoments(list, { tab: 'Sent', filter: 'All', search: '' }, now).map((item) => item.id)).toContain('archived');
  });

  it('filters by type, including "Get Well Soon", and searches titles case-insensitively', () => {
    expect(displayedMoments(list, { tab: 'Upcoming', filter: 'Get Well Soon', search: '' }, now).map((item) => item.id)).toEqual(['well']);
    expect(displayedMoments(list, { tab: 'Upcoming', filter: 'All', search: 'sam' }, now).map((item) => item.id)).toEqual(['birthday']);
  });

  it('shows history on Sent and the rest, minus cancelled, on Scheduled', () => {
    const plans = sortedPlans(list);
    const sent = tabPlans(plans, displayedMoments(list, { tab: 'Sent', filter: 'All', search: '' }, now), { tab: 'Sent', deliveryFilter: 'Automatic' });
    expect(sent.map((item) => item.id).sort()).toEqual(['p1', 'p5']);
    const scheduled = (deliveryFilter: string) =>
      tabPlans(plans, displayedMoments(list, { tab: 'Scheduled', filter: 'All', search: '' }, now), { tab: 'Scheduled', deliveryFilter }).map((item) => item.id);
    expect(scheduled('All').sort()).toEqual(['p2', 'p4']);
    expect(scheduled('Automatic')).toEqual(['p2']);
    expect(scheduled('Confirmation')).toEqual(['p4']);
    expect(scheduled('Action needed')).toEqual(['p4']);
  });

  it('copies Swift: an empty Sent tab still "displays" moments, so it shows no empty message', () => {
    const noHistory = [moment({ id: 'x' })];
    const displayed = displayedMoments(noHistory, { tab: 'Sent', filter: 'All', search: '' }, now);
    expect(displayed).toHaveLength(1);
    expect(tabPlans(sortedPlans(noHistory), displayed, { tab: 'Sent', deliveryFilter: 'All' })).toHaveLength(0);
  });

  it('finds today’s moments for the Today card, skipping snoozed and already-sent ones', () => {
    const today = Date.parse('2030-09-20T10:00:00Z');
    const list2 = [
      moment({ id: 'a' }),
      moment({ id: 'b', snoozedUntil: '2030-09-20T11:00:00Z' }),
      moment({ id: 'c', drafts: [draft({ plans: [plan({ status: 'SENT', scheduledAtUTC: '2030-09-20T09:00:00Z' })] })] }),
    ];
    expect(todayMoments(list2, today).map((item) => item.id)).toEqual(['a']);
  });
});

describe('recipients and validation', () => {
  const recipient = (overrides: Partial<ManagedRecipient> = {}): ManagedRecipient => ({
    key: 'k',
    name: 'Sam Lee',
    phone: '+1 (555) 555-0123',
    email: 'sam@example.com',
    selected: true,
    contactIdentifier: '',
    ...overrides,
  });

  it('builds initials and masked addresses', () => {
    expect(recipientInitials('Sam  Lee Park')).toBe('SL');
    expect(maskedAddress(recipient(), 'email')).toBe('Email · s••••@example.com');
    expect(maskedAddress(recipient(), 'messages')).toBe('Mobile · ••• ••• 0123');
    expect(maskedAddress(recipient(), 'share')).toBe('Copy / Share');
    expect(maskedAddress(recipient({ email: 'nope' }), 'email')).toBe('Choose email');
    expect(normalizedPhone('+1 (555) 555-0123')).toBe('+15555550123');
  });

  it('validates recipients as FestivalValidation does', () => {
    const base = JSON.parse(settings()) as Parameters<typeof validateRecipients>[1];
    expect(validateRecipients([recipient({ selected: false })], base)).toBe('Select at least one recipient.');
    expect(validateRecipients([recipient({ name: ' ' })], base)).toBe('Enter a recipient name.');
    expect(validateRecipients([recipient({ phone: '12' })], base)).toBe('Choose a valid phone number for Sam Lee.');
    expect(validateRecipients([recipient({ phone: '', email: 'bad' })], base)).toBe('Choose a valid email address for Sam Lee.');
    expect(validateRecipients([recipient(), recipient({ key: 'k2' })], base)).toBe('Remove duplicate delivery addresses.');
    expect(validateRecipients([recipient(), recipient({ key: 'k2' })], { ...base, channels: { k: 'share', k2: 'share' } })).toBeNull();
  });

  it('validates a schedule in Swift’s order', () => {
    const approved = { ...(JSON.parse(settings({ baseMessage: 'Hi', approvedAt: '2030-01-01T00:00:00Z' })) as Parameters<typeof validateRecipients>[1]) };
    const args = { settings: approved, date: 2_000, active: true, emailReady: false, recipients: [recipient()], now: 1_000 };
    expect(validateSchedule({ ...args, active: false })).toBe('Enable the festival before scheduling.');
    expect(validateSchedule({ ...args, settings: { ...approved, approvedAt: null } })).toBe('Review and save the message before scheduling.');
    expect(validateSchedule({ ...args, date: 500 })).toBe('Choose a future delivery time.');
    expect(validateSchedule({ ...args, settings: { ...approved, channels: { k: 'share' } } })).toBe(
      'Copy / Share is available now from Review Wish; choose Messages or Email to schedule.',
    );
    expect(validateSchedule({ ...args, settings: { ...approved, channels: { k: 'email' } } })).toBe('Connect email and enable the backend scheduler first.');
    expect(validateSchedule(args)).toBeNull();
  });
});

describe('titles, greetings and signatures', () => {
  it('keeps an automatic title in step with the type and name', () => {
    expect(defaultTitle('birthday', ' Sam ')).toBe('Sam’s Birthday');
    expect(updatingTitle('Happy Birthday', 'birthday', '', 'anniversary', '')).toBe('Happy Anniversary');
    expect(updatingTitle('Sam’s Birthday', 'birthday', 'Sam', 'birthday', 'Kate')).toBe('Kate’s Birthday');
    expect(updatingTitle('Party!', 'birthday', 'Sam', 'birthday', 'Kate')).toBe('Party!');
    expect(updatingTitle('Happy Birthday', 'birthday', '', 'custom', '')).toBe('');
  });

  it('names each recipient once in their wish', () => {
    expect(greetingHeading('festival', 'Sam')).toBeNull();
    expect(greetingMessage('Happy Birthday! Have a great day.', 'birthday', 'Sam')).toBe('Happy Birthday, Sam! Have a great day.');
    expect(greetingMessage('Have a great day, sam.', 'birthday', 'Sam')).toBe('Have a great day, sam.');
    expect(greetingMessage('Samantha, have fun.', 'birthday', 'Sam')).toBe('Happy Birthday, Sam! Samantha, have fun.');
    expect(greetingMessage('Rest up.', 'getWellSoon', 'Sam')).toBe('Get well soon, Sam! Rest up.');
  });

  it('defaults the card signature from the profile name', () => {
    expect(defaultSignature(' Sri Kumar ')).toBe('With love, Sri & family');
    expect(defaultSignature('Rahul')).toBe('With love, Rahul & family');
    expect(defaultSignature('  ')).toBe('With love, your family');
  });
});
