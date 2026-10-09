import { healthRoute } from '@/server/health/telemetry';
import { emailConfigured, googleEmailAuthorizationURL, verifyEmailState } from '@/server/moments/email';
import { oauthNoticeEnabled, oauthNoticeResponse } from '@/server/oauth-notice';

const textHeaders = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

// connectURL() sends the app here while GOOGLE_OAUTH_UNVERIFIED_NOTICE is on: the notice first, then Google.
async function healthHandlerGET(req: Request) {
  const params = new URL(req.url).searchParams;
  const state = params.get('state') ?? '';
  try { await verifyEmailState(state); }
  catch { return new Response('This email connection link is invalid or has expired. Start again from Nexdo.', { status: 400, headers: textHeaders }); }
  if (!emailConfigured()) return new Response('Connected email is not configured on this server.', { status: 503, headers: textHeaders });
  if (oauthNoticeEnabled() && params.get('ack') !== '1') {
    // Gmail is connected only from the apps; the callback's failure link closes their auth browser.
    return oauthNoticeResponse({ service: 'Gmail', continueUrl: `/api/moments/email/start?${new URLSearchParams({ state, ack: '1' })}`, cancelUrl: 'nexdo://moments-email?status=error' });
  }
  return new Response(null, { status: 303, headers: { Location: googleEmailAuthorizationURL(state), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export const GET = healthRoute('GET /api/moments/email/start', healthHandlerGET);
