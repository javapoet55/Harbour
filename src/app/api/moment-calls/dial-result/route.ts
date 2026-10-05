import { dialResult } from '@/server/moment-calls/service';
import { twilioWebhook } from '@/server/moment-calls/webhook';

/** Twilio: the bridged call to the recipient ended (answered and finished, or not answered). */
export const POST = (request: Request) => twilioWebhook(request, (q, p) => dialResult(q.get('callId') ?? '', p));
