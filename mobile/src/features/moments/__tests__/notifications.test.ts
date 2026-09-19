import * as Notifications from 'expo-notifications';

import { buildMomentReminders, MOMENT_NOTIFICATION_PREFIX, readMomentPayload, replaceMomentNotifications } from '../notifications';
import { draft, moment, plan, settings } from '../testFixtures';

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const NOW = Date.parse('2030-09-01T12:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  mocked.getPresentedNotificationsAsync.mockResolvedValue([]);
});

describe('buildMomentReminders', () => {
  it('schedules one festival prepare reminder per group at 08:00 in the festival’s zone', () => {
    const encoded = settings({ groupID: 'diwali', prepareDays: 7 });
    const reminders = buildMomentReminders(
      [
        moment({ id: 'a', type: 'festival', firstName: 'A', occurrenceDate: '2030-10-20', nextOccurrence: '2030-10-20', timeZoneID: 'Asia/Kolkata', festivalSettings: encoded }),
        moment({ id: 'b', type: 'festival', firstName: 'B', occurrenceDate: '2030-10-20', nextOccurrence: '2030-10-20', timeZoneID: 'Asia/Kolkata', festivalSettings: encoded }),
        moment({ id: 'c', type: 'festival', festivalSettings: settings({ groupID: 'none', prepareDays: 0 }) }),
        moment({ id: 'd', type: 'festival', enabled: false, festivalSettings: settings({ groupID: 'off' }) }),
      ],
      NOW,
    );
    expect(reminders).toEqual([{ id: 'a', at: Date.parse('2030-10-13T02:30:00Z'), body: 'Review your festival wish.' }]);
  });

  it('adds a ready alert for wishes YOU send, never for automatic email, and a one-hour warning', () => {
    const reminders = buildMomentReminders(
      [
        moment({
          id: 'm',
          drafts: [
            draft({
              id: 'd1',
              plans: [
                plan({ id: 'messages', draftID: 'd1', scheduledAtUTC: '2030-09-20T08:00:00Z', reminderOffset: 60 }),
                plan({ id: 'auto', draftID: 'd1', channel: 'email', automaticDelivery: true, status: 'SCHEDULED', scheduledAtUTC: '2030-09-10T08:00:00Z', reminderOffset: 60 }),
                plan({ id: 'manual-email', draftID: 'd1', channel: 'email', scheduledAtUTC: '2030-09-05T08:00:00Z' }),
                plan({ id: 'cancelled', draftID: 'd1', status: 'CANCELLED', scheduledAtUTC: '2030-09-06T08:00:00Z' }),
                plan({ id: 'past', draftID: 'd1', scheduledAtUTC: '2030-08-01T08:00:00Z' }),
              ],
            }),
          ],
        }),
        moment({ id: 'off', enabled: false, drafts: [draft({ id: 'd2', plans: [plan({ id: 'disabled', draftID: 'd2', scheduledAtUTC: '2030-09-07T08:00:00Z' })] })] }),
      ],
      NOW,
    );
    expect(reminders.map((item) => [item.id, new Date(item.at).toISOString(), item.body])).toEqual([
      ['manual-email', '2030-09-05T08:00:00.000Z', 'Your wish is ready. Open Nexdo to send it.'],
      ['auto', '2030-09-10T07:00:00.000Z', 'Your scheduled wish is due in one hour.'],
      ['messages', '2030-09-20T07:00:00.000Z', 'Your scheduled wish is due in one hour.'],
      ['messages', '2030-09-20T08:00:00.000Z', 'Your wish is ready. Open Nexdo, then tap Send in Messages.'],
    ]);
  });
});

describe('replaceMomentNotifications', () => {
  const list = [moment({ drafts: [draft({ plans: [plan({ id: 'p1', scheduledAtUTC: '2030-09-20T08:00:00Z', reminderOffset: 60 })] })] })];

  it('clears the whole nexdo.moment. set, pending and delivered, and schedules the rebuilt one', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'nexdo.moment.0' },
      { identifier: 'nexdo.action.x' },
    ] as never);
    mocked.getPresentedNotificationsAsync.mockResolvedValueOnce([{ request: { identifier: 'nexdo.moment.3' } }] as never);
    const error = await replaceMomentNotifications({ moments: list, owner: 'owner-hash', isCurrent: () => true, now: NOW });
    expect(error).toBeNull();
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('nexdo.moment.0');
    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('nexdo.action.x');
    expect(mocked.dismissNotificationAsync).toHaveBeenCalledWith('nexdo.moment.3');
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(mocked.scheduleNotificationAsync).toHaveBeenNthCalledWith(1, {
      identifier: `${MOMENT_NOTIFICATION_PREFIX}0`,
      content: { title: 'Important Moment', body: 'Your scheduled wish is due in one hour.', sound: 'default', data: { momentID: 'p1', momentOwner: 'owner-hash' } },
      trigger: { type: 'date', date: new Date('2030-09-20T07:00:00Z') },
    });
  });

  it('schedules nothing without permission', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' } as never);
    await replaceMomentNotifications({ moments: list, owner: 'o', isCurrent: () => true, now: NOW });
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('caps at 60 pending requests, counting task reminders, and says so', async () => {
    const taskReminders = Array.from({ length: 59 }, (_, index) => ({ identifier: `nexdo.action.${index}` }));
    mocked.getAllScheduledNotificationsAsync.mockResolvedValueOnce([]).mockResolvedValueOnce(taskReminders as never);
    const error = await replaceMomentNotifications({ moments: list, owner: 'o', isCurrent: () => true, now: NOW });
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(error).toBe('Only the next 1 wish reminders fit on this device. Reopen Nexdo to refresh later reminders.');
  });

  it('stops scheduling for an account that is no longer current', async () => {
    await replaceMomentNotifications({ moments: list, owner: 'o', isCurrent: () => false, now: NOW });
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reports a request that could not be added', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValueOnce(new Error('nope'));
    const error = await replaceMomentNotifications({ moments: list, owner: 'o', isCurrent: () => true, now: NOW });
    expect(error).toBe('A wish reminder could not be scheduled. Enable notifications and refresh.');
  });
});

describe('readMomentPayload', () => {
  it('reads momentID and momentOwner only', () => {
    expect(readMomentPayload({ momentID: 'm', momentOwner: 'o' })).toEqual({ momentID: 'm', momentOwner: 'o' });
    expect(readMomentPayload({ actionID: 'a', owner: 'o' })).toBeNull();
    expect(readMomentPayload(null)).toBeNull();
  });
});
