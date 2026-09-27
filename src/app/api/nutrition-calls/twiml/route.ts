import { twimlForCall } from '@/server/nutrition/calls';
import { nutritionCallConfig } from '@/server/nutrition/config';
import { formParams, hangupTwiml, publicUrl, validTwilioRequest } from '@/server/nutrition/twilio';

const xml = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/xml' } });

/** Twilio fetches this when the call is answered (after answering-machine detection). */
export async function POST(request: Request) {
  const cfg = nutritionCallConfig();
  const params = await formParams(request);
  if (!validTwilioRequest(cfg.twilio.authToken, publicUrl(cfg.appUrl, request), params, request.headers.get('x-twilio-signature'))) return xml(hangupTwiml(), 403);
  const callId = new URL(request.url).searchParams.get('callId');
  if (!callId || params.AccountSid !== cfg.twilio.accountSid) return xml(hangupTwiml());
  return xml(await twimlForCall(callId, params));
}
