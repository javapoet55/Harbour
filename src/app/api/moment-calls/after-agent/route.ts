import { afterAgent } from '@/server/moment-calls/service';
import { twilioWebhook } from '@/server/moment-calls/webhook';

/** Twilio: the voice agent finished; bridge to the recipient if the user said yes. */
export const POST = (request: Request) => twilioWebhook(request, (q, p) => afterAgent(q.get('callId') ?? '', p));
