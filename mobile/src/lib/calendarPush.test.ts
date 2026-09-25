import { calendarPushNotice } from './calendarPush';

/** The server's `calendarPush` outcome (src/lib/calendar-push.ts on main) as a note. */
describe('calendarPushNotice', () => {
  it('shows the message and the calendar an event reached', () => {
    expect(
      calendarPushNotice({
        success: true,
        calendarPush: { status: 'pushed', total: 1, succeeded: 1, calendarName: 'sri@example.com' },
        message: 'Saved in Nexdo and added it to your connected calendar.',
      }),
    ).toEqual({ message: 'Saved in Nexdo and added it to your connected calendar.', calendarName: 'sri@example.com', warnings: [], tone: 'info' });
  });

  it('names no calendar when none is connected', () => {
    expect(
      calendarPushNotice({
        success: true,
        calendarPush: { status: 'not_connected', total: 0, succeeded: 0, calendarName: 'ignored' },
        message: 'Saved in Nexdo only. No connected calendar is set to receive Nexdo events.',
      }),
    ).toMatchObject({ calendarName: null, tone: 'info' });
  });

  it('marks a failed write as a warning and does not repeat the message as a warning', () => {
    const message = 'Saved in Nexdo, but it could not be added to your connected calendar.';
    expect(
      calendarPushNotice({ success: true, calendarPush: { status: 'failed', total: 1, succeeded: 0, calendarName: 'Work' }, message, warnings: [message] }),
    ).toEqual({ message, calendarName: 'Work', warnings: [], tone: 'warning' });
  });

  it('keeps other warnings, and marks a partial series as a warning', () => {
    expect(
      calendarPushNotice({
        success: true,
        calendarPush: { status: 'partial', total: 3, succeeded: 2 },
        message: 'Saved 3 events in Nexdo; 2 reached your connected calendar and 1 did not.',
        warnings: ['Something else went wrong.', 42],
      }),
    ).toMatchObject({ calendarName: null, warnings: ['Something else went wrong.'], tone: 'warning' });
  });

  it('shows nothing for a server without write-back, or a malformed body', () => {
    expect(calendarPushNotice({ success: true, occurrenceCount: 3 })).toBeNull();
    expect(calendarPushNotice({ success: true, calendarPush: { status: 'pushed' } })).toBeNull();
    expect(calendarPushNotice(null)).toBeNull();
    expect(calendarPushNotice('Saved')).toBeNull();
  });
});
