import { turnstileRequired } from '@/server/signup/abuse';
export async function GET() {
  const required = turnstileRequired();
  const siteKey = process.env.TURNSTILE_SITE_KEY ?? '';
  if (required && (!siteKey || !process.env.TURNSTILE_SECRET_KEY || !process.env.TURNSTILE_HOSTNAMES?.trim())) {
    return Response.json({ error: 'Account security checks are temporarily unavailable. Please try again shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({ required, siteKey }, { headers: { 'Cache-Control': 'no-store' } });
}
