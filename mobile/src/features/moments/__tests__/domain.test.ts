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
  fallbackWish,
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
  contactLinkFor,
  defaultChannel,
  editedContactLink,
  firstNameOf,
  RECIPIENT_ADDRESS_REQUIRED,
  RECIPIENT_EMAIL_INVALID,
  RECIPIENT_NAME_REQUIRED,
  RECIPIENT_PHONE_INVALID,
  recipientProblem,
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
  // WishMessageTests.swift: festivalSettingsDecodeFieldByField
  it('reads settings never saved by Manage Moment as nil, so group identity stays stable', () => {
    expect(readFestivalSettings('{}')).toBeNull();
    expect(readFestivalSettings('{"archived":true}')).toBeNull();
    expect(readFestivalSettings('{"groupID":""}')).toBeNull();
    expect(readFestivalSettings('not json')).toBeNull();
    expect(readFestivalSettings('[]')).toBeNull();
    expect(readFestivalSettings(null)).toBeNull();
    expect(readFestivalSettings(settings())?.groupID).toBe('shared');
    expect(readFestivalSettings(settings({ approvedAt: null }))?.approvedAt).toBeNull();
  });

  // ITEM 2. One missing or mistyped key used to discard every other saved field.
  it('decodes field by field with defaults, keeping the rest of what was saved', () => {
    const partial = '{"groupID":"g1","baseMessage":"Asha, cake at seven!","approvedAt":"2026-09-23T10:00:00Z","overrides":{"a":"Just for you"},"imageAspect":5,"channels":{"a":"email"}}';
    const read = readFestivalSettings(partial);
    expect(read).not.toBeNull();
    expect(read?.groupID).toBe('g1');
    expect(read?.baseMessage).toBe('Asha, cake at seven!');
    expect(read?.approvedAt).toBe('2026-09-23T10:00:00Z');
    expect(read?.overrides).toEqual({ a: 'Just for you' });
    expect(read?.channels).toEqual({ a: 'email' });
    // Mistyped falls back to its default rather than taking the whole object down.
    expect(read?.imageAspect).toBe('Portrait');
    expect(read?.tone).toBe('Warm');
    expect(read?.prepareDays).toBe(7);
    expect(read?.includeImage).toBe(false);
    expect(read?.cardGreeting).toBeNull();
    // A fresh moment's settings still round-trip unchanged.
    const full = readFestivalSettings(settings({ baseMessage: 'Hello', cardSignature: 'Sri' }));
    expect(readFestivalSettings(JSON.stringify(full))).toEqual(full);
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

  // ImportantMomentsView.swift:273. The server moves an unconfirmed manual delivery to EXPIRED
  // after a 24-hour grace period; it needs the owner's attention, not silence.
  it('lists an expired delivery under Action needed', () => {
    const expired = [
      moment({
        id: 'e',
        occurrenceDate: '2030-09-20',
        nextOccurrence: '2030-09-20',
        drafts: [
          draft({
            id: 'de',
            plans: [
              plan({
                id: 'pe',
                draftID: 'de',
                status: 'EXPIRED',
                lastError: 'Delivery was not confirmed within one day. Create a new wish to send it.',
              }),
            ],
          }),
        ],
      }),
    ];
    const displayed = displayedMoments(expired, { tab: 'Scheduled', filter: 'All', search: '' }, now);
    const ids = (deliveryFilter: string) => tabPlans(sortedPlans(expired), displayed, { tab: 'Scheduled', deliveryFilter }).map((item) => item.id);
    expect(ids('All')).toEqual(['pe']);
    expect(ids('Action needed')).toEqual(['pe']);
    // Swift gives EXPIRED no case of its own, so the label falls through to the default branch,
    // and an expired delivery can no longer be edited.
    expect(planStatusLabel(plan({ status: 'EXPIRED' }))).toBe('Expired');
    expect(planEditable(plan({ status: 'EXPIRED' }))).toBe(false);
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

  /**
   * Copied from `the resolved wish text` in src/server/moments/wish-message.integration.test.ts. The
   * server rewrites pending plans with its own `greetingMessage`, so the two must agree byte for byte.
   */
  describe('greetingMessage matches the server', () => {
    it('matches the app’s greeting rules', () => {
      expect(greetingMessage('Happy birthday! Enjoy.', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Enjoy.');
      expect(greetingMessage('Happy Birthday', 'birthday', 'Asha')).toBe('Happy Birthday, Asha!');
      expect(greetingMessage('Dear asha, enjoy.', 'birthday', 'Asha')).toBe('Dear asha, enjoy.');
      expect(greetingMessage('Happy Birthdays all round', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Happy Birthdays all round');
      expect(greetingMessage('Joyful Diwali!', 'festival', 'Asha')).toBe('Joyful Diwali!');
    });

    it('never produces two greetings, whatever the moment’s type says', () => {
      expect(greetingMessage('Happy anniversary! Wishing you a wonderful year.', 'birthday', 'Visakan')).toBe('Happy Anniversary, Visakan! Wishing you a wonderful year.');
      expect(greetingMessage('Happy Birthday! Enjoy.', 'anniversary', 'Visakan')).toBe('Happy Birthday, Visakan! Enjoy.');
      expect(greetingMessage('Get well soon. Rest up.', 'birthday', 'Visakan')).toBe('Get well soon, Visakan! Rest up.');
      expect(greetingMessage('Best wishes! Have a lovely day.', 'birthday', 'Visakan')).toBe('Best wishes, Visakan! Have a lovely day.');
      expect(greetingMessage('Happy anniversary', 'birthday', 'Visakan')).toBe('Happy Anniversary, Visakan!');
    });

    it('is unchanged when the message opens with the moment’s own greeting', () => {
      expect(greetingMessage('Happy Anniversary! Here’s to ten years.', 'anniversary', 'Asha')).toBe('Happy Anniversary, Asha! Here’s to ten years.');
      expect(greetingMessage('get well soon. Thinking of you.', 'getWellSoon', 'Asha')).toBe('Get well soon, Asha! Thinking of you.');
    });

    it('adds the moment’s own greeting when the message has no opening', () => {
      expect(greetingMessage('Have a lovely day!', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Have a lovely day!');
      expect(greetingMessage('Have a lovely day!', 'anniversary', 'Asha')).toBe('Happy Anniversary, Asha! Have a lovely day!');
      expect(greetingMessage('Rest up.', 'getWellSoon', 'Asha')).toBe('Get well soon, Asha! Rest up.');
      expect(greetingMessage('Happy anniversaries all round', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Happy anniversaries all round');
    });

    it('adds no greeting line without a recipient name, or for an occasion that has none', () => {
      expect(greetingMessage('Happy anniversary! Wishing you well.', 'birthday', '')).toBe('Happy anniversary! Wishing you well.');
      expect(greetingMessage('Happy anniversary! Wishing you well.', 'birthday', '   ')).toBe('Happy anniversary! Wishing you well.');
      expect(greetingMessage('Happy Birthday! Enjoy.', 'festival', 'Asha')).toBe('Happy Birthday! Enjoy.');
      expect(greetingMessage('Best wishes! Enjoy.', 'custom', 'Asha')).toBe('Best wishes! Enjoy.');
    });
  });

  /**
   * Birthday and anniversary used to fall through to the festival wording keyed on the title, so a
   * birthday draft read "<title>! Wishing you and your family a joyful celebration…". Their wording is
   * `fallback` in src/server/moments/domain.ts:26-40, addressed to the recipient.
   */
  describe('fallbackWish', () => {
    it('addresses a birthday and an anniversary to the person, in every tone', () => {
      expect(fallbackWish('Title', 'Warm', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Wishing you a wonderful day and a fantastic year ahead! 🎉');
      expect(fallbackWish('Title', 'Short', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Wishing you a wonderful day.');
      expect(fallbackWish('Title', 'Fun', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Here’s to smiles, good company, and a day worth celebrating! 🎉');
      expect(fallbackWish('Title', 'Personal', 'birthday', 'Asha')).toBe('Happy Birthday, Asha! Thinking of you and sending my warmest wishes on this special day.');
      expect(fallbackWish('Title', 'Warm', 'anniversary', 'Visakan')).toBe('Happy Anniversary, Visakan! Wishing you a wonderful day and a fantastic year ahead! 🎉');
      expect(fallbackWish('Title', 'Short', 'anniversary', 'Visakan')).toBe('Happy Anniversary, Visakan! Wishing you a wonderful day.');
      // The title never appears in these two: only `firstName` does.
      expect(fallbackWish('Visakan’s Anniversary', 'Short', 'anniversary')).toBe('Happy Anniversary! Wishing you a wonderful day.');
    });

    /** `fallback` alternates its Warm line by draft version; an offline draft is always the first. */
    it('alternates the Warm wording by version, as the server does', () => {
      expect(fallbackWish('Title', 'Warm', 'birthday', 'Asha', 1)).toBe('Happy Birthday, Asha! Wishing you a wonderful day and a fantastic year ahead! 🎉');
      expect(fallbackWish('Title', 'Warm', 'birthday', 'Asha', 2)).toBe('Happy Birthday, Asha! Hope your day is filled with happiness and lovely moments! 🎉');
      expect(fallbackWish('Title', 'Warm', 'anniversary', 'Visakan', 3)).toBe('Happy Anniversary, Visakan! Wishing you a wonderful day and a fantastic year ahead! 🎉');
      expect(fallbackWish('Title', 'Warm', 'anniversary', 'Visakan', 4)).toBe('Happy Anniversary, Visakan! Hope your day is filled with happiness and lovely moments! 🎉');
      // The default is version 1.
      expect(fallbackWish('Title', 'Warm', 'birthday', 'Asha')).toBe(fallbackWish('Title', 'Warm', 'birthday', 'Asha', 1));
    });

    it('leaves Get Well Soon and the festival tones as they were', () => {
      expect(fallbackWish('Sam', 'Short', 'getWellSoon')).toBe('Get well soon. Thinking of you.');
      expect(fallbackWish('Sam', 'Warm', 'getWellSoon')).toBe('Get well soon. Sending care, comfort, and warm wishes for brighter days ahead.');
      expect(fallbackWish('Diwali', 'Warm')).toBe('Diwali! Wishing you and your family a joyful celebration filled with happiness and new beginnings! ✨');
      expect(fallbackWish('Diwali', 'Short')).toBe('Diwali! Wishing you joy and happiness.');
      expect(fallbackWish('Diwali', 'Personal', 'festival')).toBe('Diwali! Thinking of you and your family and sending warm wishes for a joyful celebration.');
      expect(fallbackWish('Diwali', 'Fun', 'festival')).toBe('Diwali! Here’s to a celebration full of smiles, good company, and wonderful memories! ✨');
    });

    /** The greeting rule absorbs the draft's own opening rather than adding a second one. */
    it('produces a draft the greeting rule leaves with one greeting', () => {
      const named = fallbackWish('Title', 'Warm', 'birthday', 'Asha');
      expect(greetingMessage(named, 'birthday', 'Asha')).toBe(named);
      // A shared draft carries no name, so each recipient's own is added.
      const shared = fallbackWish('Title', 'Warm', 'anniversary');
      expect(greetingMessage(shared, 'anniversary', 'Visakan')).toBe('Happy Anniversary, Visakan! Wishing you a wonderful day and a fantastic year ahead! 🎉');
      expect(greetingMessage(shared, 'anniversary', 'Asha')).toBe('Happy Anniversary, Asha! Wishing you a wonderful day and a fantastic year ahead! 🎉');
    });
  });

  it('defaults the card signature from the profile name', () => {
    expect(defaultSignature(' Sri Kumar ')).toBe('With love, Sri & family');
    expect(defaultSignature('Rahul')).toBe('With love, Rahul & family');
    expect(defaultSignature('  ')).toBe('With love, your family');
  });
});

describe('recipient sheet rules', () => {
  const cara = { name: 'Cara', phone: '+1 555 010 0200', email: 'cara@example.com' };

  it('requires a name and a valid phone or email', () => {
    expect(recipientProblem({ name: ' ', phone: '5550100200', email: '' }, [])).toBe(RECIPIENT_NAME_REQUIRED);
    expect(recipientProblem({ name: 'Cara', phone: ' ', email: '' }, [])).toBe(RECIPIENT_ADDRESS_REQUIRED);
    expect(recipientProblem({ name: 'Cara', phone: '123456', email: '' }, [])).toBe(RECIPIENT_PHONE_INVALID);
    expect(recipientProblem({ name: 'Cara', phone: '1234567890123456', email: '' }, [])).toBe(RECIPIENT_PHONE_INVALID);
    expect(recipientProblem({ name: 'Cara', phone: '', email: 'cara@' }, [])).toBe(RECIPIENT_EMAIL_INVALID);
    expect(recipientProblem(cara, [])).toBeNull();
    expect(recipientProblem({ name: 'Cara', phone: '', email: 'cara@example.com' }, [])).toBeNull();
  });

  it('refuses a second person with the same phone or email, however it is written', () => {
    expect(recipientProblem({ name: 'Dup', phone: '15550100200', email: '' }, [cara])).toBe('Cara already has this phone number.');
    expect(recipientProblem({ name: 'Dup', phone: '', email: ' CARA@example.com' }, [cara])).toBe('Cara already has this email.');
    expect(recipientProblem({ name: 'Dup', phone: '5550100999', email: 'dup@example.com' }, [cara])).toBeNull();
  });

  it('chooses Messages when there is a phone and Email when there is only an email', () => {
    expect(defaultChannel({ phone: '5550100200', email: 'a@b.co' })).toBe('messages');
    expect(defaultChannel({ phone: ' ', email: 'a@b.co' })).toBe('email');
    expect(defaultChannel({ phone: '', email: '' })).toBe('share');
  });

  it('keeps a contact link only while the addresses are the contact’s own', () => {
    const contact = { id: 'C1', phones: ['+1 (555) 010-0200', '+1 555 010 0300'], emails: ['Kate@Example.com'] };
    expect(contactLinkFor({ phone: '15550100300', email: 'kate@example.com' }, contact)).toBe('C1');
    expect(contactLinkFor({ phone: '', email: 'kate@example.com' }, contact)).toBe('C1');
    expect(contactLinkFor({ phone: '5550109999', email: 'kate@example.com' }, contact)).toBe('');
    expect(contactLinkFor({ phone: '15550100200', email: 'kate@other.com' }, contact)).toBe('');
    expect(contactLinkFor({ phone: '15550100200', email: '' }, null)).toBe('');
    const saved = { phone: '+15550100200', email: 'kate@example.com', contactIdentifier: 'C1' };
    expect(editedContactLink(saved, { phone: '+1 555 010 0200', email: 'KATE@example.com' })).toBe('C1');
    expect(editedContactLink(saved, { phone: '', email: 'kate@example.com' })).toBe('C1');
    expect(editedContactLink(saved, { phone: '+15550100200', email: 'kate@work.com' })).toBe('');
  });

  it('names the moment after the first word of a name', () => {
    expect(firstNameOf('  Kate   Bell ')).toBe('Kate');
    expect(firstNameOf('')).toBe('');
  });
});
