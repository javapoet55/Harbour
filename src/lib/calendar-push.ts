// Outcome of writing Nexdo-created events to the connected calendar. Returned to both apps as `calendarPush`.
export type CalendarPushStatus = 'pushed' | 'removed' | 'not_connected' | 'failed' | 'partial';
export type CalendarPushResult = { status: CalendarPushStatus; total: number; succeeded: number; calendarName?: string };
type Action = 'saved' | 'updated' | 'deleted';

// Spoken by voice as well as shown, so the calendar is not named here: Google names a primary
// calendar after its email address. Apps can show `calendarPush.calendarName` alongside.
const CALENDAR = 'your connected calendar';

export function calendarPushMessage(result: CalendarPushResult, action: Action = 'saved') {
  const many = result.total > 1;
  const { status, total, succeeded } = result;
  if (action === 'deleted') {
    if (status === 'removed' || status === 'pushed') return `Deleted from Nexdo and ${CALENDAR}.`;
    // A deleted event that never reached a calendar has nothing to remove there.
    if (status === 'not_connected') return 'Deleted from Nexdo.';
    return `Deleted from Nexdo, but it could not be removed from ${CALENDAR}.`;
  }
  const verb = action === 'saved' ? 'Saved' : 'Updated';
  const subject = many ? `${verb} ${total} events in Nexdo` : `${verb} in Nexdo`;
  if (status === 'pushed' || status === 'removed') return action === 'saved' ? `${subject} and added ${many ? 'them' : 'it'} to ${CALENDAR}.` : `${subject} and ${CALENDAR}.`;
  if (status === 'not_connected') return `${subject} only. No connected calendar is set to receive Nexdo events.`;
  if (status === 'partial') return `${subject}; ${succeeded} reached ${CALENDAR} and ${total - succeeded} did not.`;
  return `${subject}, but ${many ? 'they' : 'it'} could not be ${action === 'saved' ? 'added to' : 'updated in'} ${CALENDAR}.`;
}

/** A warning for the response `warnings` array, or undefined when nothing went wrong. */
export function calendarPushWarning(result: CalendarPushResult, action: Action = 'saved') {
  return result.status === 'failed' || result.status === 'partial' ? calendarPushMessage(result, action) : undefined;
}
