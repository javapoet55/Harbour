import { z } from 'zod';
import { backendFetch } from '@/server/backend';
import { sessionToken } from '@/server/session';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const token = await sessionToken();
  if (!token) return Response.redirect(new URL('/login', request.url));
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  try {
    const response = await backendFetch(`/api/admin/feedback/bugs/${id}/screenshot`, { token });
    if (!response.ok) return new Response(null, { status: response.status === 404 ? 404 : response.status === 401 ? 401 : 503, headers });
    if (response.headers.get('Content-Type') !== 'image/jpeg') return new Response(null, { status: 502, headers });
    return new Response(response.body, { headers: { ...headers, 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline; filename="bug-screenshot.jpg"' } });
  } catch { return new Response(null, { status: 503, headers }); }
}
