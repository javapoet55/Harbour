import { twimlForCall } from '@/server/moment-calls/service';
import { twilioWebhook } from '@/server/moment-calls/webhook';

/** Twilio: the user answered the connect call (after answering-machine detection). */
export const POST = (request: Request) => twilioWebhook(request, (q, p) => twimlForCall(q.get('callId') ?? '', p));
