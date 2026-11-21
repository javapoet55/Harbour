import { reminderCallStatus } from '@/server/reminder-calls';
import { twilioWebhook } from '@/server/moment-calls/webhook';

/** Twilio: final status of the reminder call (missed, busy, completed). */
export const POST = (request: Request) => twilioWebhook(request, (q, p) => reminderCallStatus(q.get('callId') ?? '', p), false);
