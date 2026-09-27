import { createHmac, timingSafeEqual } from 'node:crypto';
import { observedFetch } from '@/server/health/telemetry';

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Twilio request validation: base64(HMAC-SHA1(authToken, url + sorted POST key/value pairs)). */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}
export function validTwilioRequest(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  return !!authToken && !!signature && safeEqual(twilioSignature(authToken, url, params), signature);
}

/**
 * The public URL Twilio called. Behind Railway's proxy request.url carries an internal host, so the
 * signature is checked against APP_URL + the original path and query string.
 */
export function publicUrl(appUrl: string, request: Request): string {
  const { pathname, search } = new URL(request.url);
  return `${appUrl}${pathname}${search}`;
}

export async function formParams(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === 'string') out[key] = value;
  return out;
}

/** Signed, opaque per-call token that ties the media stream back to one NutritionCall row. */
export function callToken(secret: string, callId: string): string {
  const sig = createHmac('sha256', secret).update(`nutrition-call:${callId}`).digest('base64url');
  return `${callId}.${sig}`;
}
export function verifyCallToken(secret: string, token: unknown): string | null {
  if (!secret || typeof token !== 'string' || token.length > 200) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const callId = token.slice(0, dot);
  return safeEqual(callToken(secret, callId), token) ? callId : null;
}

export const xmlEscape = (value: string) => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));

export function streamTwiml(workerUrl: string, token: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${xmlEscape(workerUrl)}"><Parameter name="callToken" value="${xmlEscape(token)}"/></Stream></Connect></Response>`;
}
export const hangupTwiml = () => '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

export type DialRequest = { accountSid: string; authToken: string; from: string; to: string; twimlUrl: string; statusUrl: string; timeLimitSeconds: number };

/** Places the outbound call. Answering-machine detection runs before the TwiML is fetched. */
export async function createTwilioCall(req: DialRequest, fetchImpl: typeof observedFetch = observedFetch): Promise<{ sid: string } | { error: string }> {
  const body = new URLSearchParams({
    To: req.to, From: req.from, Url: req.twimlUrl, Method: 'POST',
    StatusCallback: req.statusUrl, StatusCallbackMethod: 'POST',
    MachineDetection: 'Enable', Timeout: '25', TimeLimit: String(req.timeLimitSeconds),
  });
  for (const event of ['initiated', 'ringing', 'answered', 'completed']) body.append('StatusCallbackEvent', event);
  try {
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(req.accountSid)}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${req.accountSid}:${req.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = await response.json().catch(() => ({})) as { sid?: string };
    if (!response.ok || !payload.sid) return { error: `twilio_${response.status}` };
    return { sid: payload.sid };
  } catch { return { error: 'twilio_request_failed' }; }
}
