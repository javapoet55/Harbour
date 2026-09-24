import { strictAdminDateRange } from '@/lib/admin-date-range';

// JSON helpers shared by the admin read API used by the separate admin frontend.
export const adminApiHeaders = { 'Cache-Control': 'private, no-store' };
export const adminJson = (body: unknown, status = 200) => Response.json(body, { status, headers: adminApiHeaders });

export function adminApiFailure(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') return adminJson({ error: 'Admin sign-in required' }, 401);
  return adminJson({ error: 'Admin data is temporarily unavailable' }, 503);
}

/** The from/to query parameters as an exact range, or null when either is missing or invalid. */
export function adminQueryRange(request: Request) {
  const params = new URL(request.url).searchParams;
  return strictAdminDateRange(params.get('from'), params.get('to'));
}

export const invalidRange = () => adminJson({ error: 'Choose a valid reporting range of up to 366 days, ending today or earlier.' }, 400);
