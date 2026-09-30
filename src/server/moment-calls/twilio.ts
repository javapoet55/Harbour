import { observedFetch } from '@/server/health/telemetry';
import { xmlEscape } from '@/server/nutrition/twilio';

type Credentials = { accountSid: string; authToken: string };
export type TwilioResult<T> = { ok: true; data: T } | { ok: false; status: number; code?: number; message?: string };

/** Minimal Twilio REST call (form-encoded). Never throws; errors come back as data. */
export async function twilioApi<T>(creds: Credentials, method: 'GET' | 'POST' | 'DELETE', path: string, params?: URLSearchParams, fetchImpl: typeof observedFetch = observedFetch): Promise<TwilioResult<T>> {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}`;
  const url = method === 'GET' && params ? `${base}${path}?${params}` : `${base}${path}`;
  try {
    const response = await fetchImpl(url, {
      method,
      headers: { Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(method === 'POST' && params ? { body: params } : {}),
    });
    if (method === 'DELETE' && (response.status === 204 || response.status === 404)) return { ok: true, data: {} as T };
    const payload = await response.json().catch(() => ({})) as T & { code?: number; message?: string };
    return response.ok ? { ok: true, data: payload } : { ok: false, status: response.status, code: payload.code, message: payload.message };
  } catch { return { ok: false, status: 0, message: 'twilio_request_failed' }; }
}

const doc = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
const say = (text: string) => `<Say voice="Polly.Joanna">${xmlEscape(text)}</Say>`;

/** Ask the user through the voice agent; afterwards Twilio follows the redirect to learn the decision. */
export const agentTwiml = (workerUrl: string, token: string, afterUrl: string) =>
  doc(`<Connect><Stream url="${xmlEscape(workerUrl)}"><Parameter name="callToken" value="${xmlEscape(token)}"/></Stream></Connect><Redirect method="POST">${xmlEscape(afterUrl)}</Redirect>`);

/** Bridge to the recipient showing the user's own verified number. */
export const bridgeTwiml = (opts: { intro?: string; callerId: string; to: string; actionUrl: string }) =>
  doc(`${opts.intro ? say(opts.intro) : ''}<Dial callerId="${xmlEscape(opts.callerId)}" timeout="30" answerOnBridge="true" action="${xmlEscape(opts.actionUrl)}" method="POST"><Number>${xmlEscape(opts.to)}</Number></Dial>`);

export const sayAndHangup = (text: string) => doc(`${say(text)}<Hangup/>`);
export const hangup = () => doc('<Hangup/>');
