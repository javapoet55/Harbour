import { nutritionCallConfig } from '@/server/nutrition/config';
import { formParams, publicUrl, validTwilioRequest } from '@/server/nutrition/twilio';
import { hangup } from './twilio';

export const xmlResponse = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/xml' } });

/** Verifies Twilio's signature and account, then hands the form parameters and ?query to the handler. */
export async function twilioWebhook(request: Request, handle: (query: URLSearchParams, params: Record<string, string>) => Promise<string | void>, xml = true) {
  const cfg = nutritionCallConfig();
  const params = await formParams(request);
  if (!validTwilioRequest(cfg.twilio.authToken, publicUrl(cfg.appUrl, request), params, request.headers.get('x-twilio-signature'))) {
    return xml ? xmlResponse(hangup(), 403) : new Response(null, { status: 403 });
  }
  if (params.AccountSid !== cfg.twilio.accountSid) return xml ? xmlResponse(hangup()) : new Response(null, { status: 204 });
  const body = await handle(new URL(request.url).searchParams, params);
  return xml ? xmlResponse(body || hangup()) : new Response(null, { status: 204 });
}
