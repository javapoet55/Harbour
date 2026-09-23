import type { CalendarPush } from '../api';

/**
 * The note shown after New Event or a voice-created event: the server's `message`, the calendar it
 * reached, and any `warnings`. `null` when the response carries no write-back outcome (an older server).
 */
export type CalendarPushNotice = {
  message: string;
  calendarName: string | null;
  warnings: string[];
  tone: 'info' | 'warning';
};

export function calendarPushNotice(response: unknown): CalendarPushNotice | null {
  if (!response || typeof response !== 'object') return null;
  const body = response as { calendarPush?: Partial<CalendarPush>; message?: unknown; warnings?: unknown };
  const push = body.calendarPush;
  if (!push || typeof push.status !== 'string' || typeof body.message !== 'string' || body.message.length === 0) return null;
  const message = body.message;
  // On a failed write the server repeats the message as the warning; show it once.
  const warnings = Array.isArray(body.warnings)
    ? body.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.length > 0 && warning !== message)
    : [];
  // The name only means something when the event reached, or was meant to reach, that calendar.
  const named = push.status !== 'not_connected' && typeof push.calendarName === 'string' && push.calendarName.length > 0;
  return {
    message,
    calendarName: named ? push.calendarName! : null,
    warnings,
    tone: push.status === 'failed' || push.status === 'partial' || warnings.length > 0 ? 'warning' : 'info',
  };
}
