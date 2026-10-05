import { handleCallStatus } from '@/server/nutrition/calls';
import { nutritionCallConfig } from '@/server/nutrition/config';
import { formParams, publicUrl, validTwilioRequest } from '@/server/nutrition/twilio';

/** Twilio call progress callbacks (initiated, ringing, answered, completed). */
export async function POST(request: Request) {
  const cfg = nutritionCallConfig();
  const params = await formParams(request);
  if (!validTwilioRequest(cfg.twilio.authToken, publicUrl(cfg.appUrl, request), params, request.headers.get('x-twilio-signature'))) return new Response(null, { status: 403 });
  const callId = new URL(request.url).searchParams.get('callId');
  if (callId && params.AccountSid === cfg.twilio.accountSid) await handleCallStatus(callId, params);
  return new Response(null, { status: 204 });
}
