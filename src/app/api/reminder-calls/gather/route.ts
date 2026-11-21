import { reminderCallGather } from '@/server/reminder-calls';
import { twilioWebhook } from '@/server/moment-calls/webhook';

/** Twilio: the key the person pressed after hearing the reminder. */
export const POST = (request: Request) => twilioWebhook(request, (q, p) => reminderCallGather(q.get('callId') ?? '', p));
