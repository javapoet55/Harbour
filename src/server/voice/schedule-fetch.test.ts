import { afterEach, expect, it, vi } from 'vitest';
import { scheduleFetch } from '@/lib/schedule-fetch';
afterEach(() => vi.unstubAllGlobals());
it('does not retry when the user declines a warning', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'SCHEDULE_WARNING', warnings: ['Conflict'] }), { status: 409 }));
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('window', { confirm: () => false });
  expect((await scheduleFetch('/api/tasks', { method: 'POST', body: '{}' })).status).toBe(409);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('retries the same body once with explicit consent only after approval', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: 'SCHEDULE_WARNING', warnings: ['Conflict'] }), { status: 409 })).mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('window', { confirm: () => true });
  await scheduleFetch('/api/tasks/t', { method: 'PATCH', body: JSON.stringify({ durationMin: 60 }) });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ durationMin: 60, allowScheduleConflict: true });
});
it('never retries unrelated or uncertain failures', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
  vi.stubGlobal('fetch', fetch);
  await scheduleFetch('/api/tasks', { method: 'POST', body: '{}' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
