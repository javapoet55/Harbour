import { reminderCallTwiml } from '@/server/reminder-calls';
import { twilioWebhook } from '@/server/moment-calls/webhook';

/** Twilio: the reminder call was answered (after answering-machine detection). */
export const POST = (request: Request) => twilioWebhook(request, (q, p) => reminderCallTwiml(q.get('callId') ?? '', p));
