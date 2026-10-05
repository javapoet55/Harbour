import { recordCallerIdResult } from '@/server/moment-calls/caller-id';
import { twilioWebhook } from '@/server/moment-calls/webhook';

/** Twilio: result of the caller-ID verification call. */
export const POST = (request: Request) => twilioWebhook(request, (q, p) => recordCallerIdResult(q.get('userId') ?? '', p), false);
