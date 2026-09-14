'use client';
/** Retry only a schedule rejection, after showing its concrete warnings. */
export async function scheduleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 409) return response;
  const payload = await response.clone().json().catch(() => null);
  if (payload?.code !== 'SCHEDULE_WARNING' || !Array.isArray(payload.warnings)) return response;
  if (!window.confirm(`${payload.warnings.join('\n\n')}\n\nSave this time anyway?`)) return response;
  const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
  return fetch(input, { ...init, body: JSON.stringify({ ...body, allowScheduleConflict: true }) });
}
