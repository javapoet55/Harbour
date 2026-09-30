import { callStatus } from '@/server/moment-calls/service';
import { twilioWebhook } from '@/server/moment-calls/webhook';

/** Twilio: status of the call to the user (missed, busy, completed). */
export const POST = (request: Request) => twilioWebhook(request, (q, p) => callStatus(q.get('callId') ?? '', p), false);
