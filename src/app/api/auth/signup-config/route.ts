import { turnstileRequired } from '@/server/signup/abuse';
export async function GET() {
  return Response.json({ required: turnstileRequired(), siteKey: process.env.TURNSTILE_SITE_KEY ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
}
